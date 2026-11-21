import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { test } from "node:test";
import { checkInboundRateLimit } from "./email/inbound_rate_limit.ts";
import { cleanupExpiredRateLimits, consumeRateLimit, checkSnapshotRateLimit } from "./rate_limits.ts";
import { getTaskRunInfo, isTaskDueThisTick, markTaskRun, SCHEDULED_TASK_RAW_MAILS } from "./scheduled_tasks.ts";
import { WORKER_STORE_SCHEMA } from "./worker_store.ts";

const MIN = 60_000;
const DAY = 24 * 60 * MIN;

function createD1(t) {
    const sqlite = new DatabaseSync(":memory:");
    sqlite.exec("CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT, updated_at TEXT)");
    t.after(() => sqlite.close());
    const DB = {
        prepare(sql) {
            return {
                async first() { return sqlite.prepare(sql).get() ?? null; },
                bind(...params) {
                    return {
                        async first(column) {
                            const row = sqlite.prepare(sql).get(...params);
                            return (column ? row?.[column] : row) ?? null;
                        },
                        async run() { return sqlite.prepare(sql).run(...params); },
                        all() { return sqlite.prepare(sql).all(...params); },
                    };
                },
                all() { return sqlite.prepare(sql).all(); },
            };
        },
        async batch(statements) {
            sqlite.exec("BEGIN");
            try {
                const results = statements.map(statement => ({ results: statement.all() }));
                sqlite.exec("COMMIT");
                return results;
            } catch (error) {
                sqlite.exec("ROLLBACK");
                throw error;
            }
        },
    };
    return { DB, sqlite };
}

test("D1 counters enforce daily UTC boundaries and a rolling-from-first-use webhook window", async (t) => {
    const { DB } = createD1(t);
    const daily = (now) => {
        const day = Math.floor(now / DAY) * DAY;
        return consumeRateLimit(DB, "daily", 1, now, day, day + DAY);
    };
    assert.equal(await daily(DAY - 1), true);
    assert.equal(await daily(DAY - 1), false);
    assert.equal(await daily(DAY), true);
    assert.equal(await daily(DAY + 1), false);

    const webhook = (now) => consumeRateLimit(DB, "webhook", 2, now, now - MIN, now + 2 * MIN);
    assert.equal(await webhook(MIN), true);
    assert.equal(await webhook(MIN + 1), true);
    assert.equal(await webhook(2 * MIN), false);
    assert.equal(await webhook(2 * MIN + 1), true);
});

test("inbound defaults allow ten per pair, then ban that sender across mailboxes without more writes", async (t) => {
    const { DB, sqlite } = createD1(t);
    let now = MIN;
    t.mock.method(Date, "now", () => now);
    const env = { DB };
    const check = (recipient = "one@example.com") => checkInboundRateLimit(" Sender@EXAMPLE.com ", recipient, env);
    for (let i = 0; i < 10; i++) assert.equal((await check()).blocked, false);
    assert.match((await check()).reason, /pair 11\/10/);
    const before = sqlite.prepare("SELECT total_changes() AS n").get().n;
    assert.equal((await check("two@example.com")).blocked, true);
    assert.equal((await checkInboundRateLimit("sender@example.com", "one@example.com", env, false)).blocked, true);
    assert.equal(sqlite.prepare("SELECT total_changes() AS n").get().n, before);
    assert.equal((await checkInboundRateLimit("", "one@example.com", env)).blocked, false);
    now += 10 * MIN;
    assert.equal((await check()).blocked, false);
    await cleanupExpiredRateLimits(DB);
});

test("custom inbound windows reset from first use and sender totals stop mailbox rotation", async (t) => {
    const { DB, sqlite } = createD1(t);
    sqlite.prepare("INSERT INTO settings (key, value) VALUES ('abuse_protection_settings', ?)")
        .run(JSON.stringify({ inboundWindowMinutes: 2, inboundPairLimit: 2, inboundSenderLimit: 3, inboundBanMinutes: 1 }));
    let now = MIN - 1;
    t.mock.method(Date, "now", () => now);
    const check = recipient => checkInboundRateLimit("sender@example.com", recipient, { DB });
    assert.equal((await check("a@example.com")).blocked, false);
    now = MIN;
    assert.equal((await check("a@example.com")).blocked, false);
    assert.equal((await check("b@example.com")).blocked, false);
    assert.match((await check("c@example.com")).reason, /sender 4\/3/);
    now = 3 * MIN - 1;
    assert.equal((await check("a@example.com")).blocked, false);
});

test("snapshot counter is atomic, shared across links, persists bans across isolates and does not extend them", async (t) => {
    const { DB, sqlite } = createD1(t);
    const now = MIN;
    const check = (db = DB, at = now) => checkSnapshotRateLimit(db, "203.0.113.1", 2, MIN, 10 * MIN, at);
    assert.deepEqual(await Promise.all([check(), check(), check()]), [0, 0, 600]);
    const before = sqlite.prepare("SELECT total_changes() AS n").get().n;
    assert.equal(await check({ ...DB }, now + 1000), 599);
    assert.equal(await check(DB, now + 2000), 598);
    assert.equal(sqlite.prepare("SELECT total_changes() AS n").get().n, before);
    assert.equal(await check(DB, now + 10 * MIN), 0);
    assert.equal(await checkSnapshotRateLimit(DB, "203.0.113.2", 2, MIN, MIN, now), 0);
});

test("cron imports an existing KV timestamp once, then reads and writes only D1", async (t) => {
    const { DB, sqlite } = createD1(t);
    sqlite.exec(WORKER_STORE_SCHEMA);
    t.mock.method(Date, "now", () => 5 * MIN);
    const legacy = { at: 4 * MIN, affected: 2 };
    const get = t.mock.fn(async () => legacy);
    const put = t.mock.fn(async () => assert.fail("unexpected KV write"));
    const env = { DB, KV: { get, put } };
    assert.equal(await isTaskDueThisTick(env, SCHEDULED_TASK_RAW_MAILS, 3), false);
    assert.deepEqual(await getTaskRunInfo(env, SCHEDULED_TASK_RAW_MAILS), legacy);
    await markTaskRun({ DB }, SCHEDULED_TASK_RAW_MAILS, 5);
    assert.deepEqual(await getTaskRunInfo(env, SCHEDULED_TASK_RAW_MAILS), { at: 5 * MIN, affected: 5 });
    sqlite.exec("INSERT INTO worker_store_import (id, complete) VALUES (1, 1)");
    assert.equal(await getTaskRunInfo(env, "unset"), null);
    assert.equal(get.mock.callCount(), 1);
    assert.equal(put.mock.callCount(), 0);
});
