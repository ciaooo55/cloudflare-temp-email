import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { test } from "node:test";
import { checkInboundRateLimit } from "./email/inbound_rate_limit.ts";
import { cleanupExpiredRateLimits, consumeRateLimit } from "./rate_limits.ts";
import { getTaskRunInfo, isTaskDueThisTick, markTaskRun, SCHEDULED_TASK_RAW_MAILS } from "./scheduled_tasks.ts";
import { WORKER_STORE_SCHEMA } from "./worker_store.ts";

const MIN = 60_000;
const DAY = 24 * 60 * MIN;

function createD1(t) {
    const sqlite = new DatabaseSync(":memory:");
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

test("inbound limits reset per minute and enforce pair and sender limits without KV", async (t) => {
    const { DB } = createD1(t);
    const time = t.mock.method(Date, "now", () => MIN);
    const check = (sender, recipient) => checkInboundRateLimit(sender, recipient, { DB });

    for (let i = 0; i < 30; i++) {
        assert.equal((await check(" Sender@EXAMPLE.com ", "one@example.com")).blocked, false);
    }
    time.mock.mockImplementation(() => 2 * MIN);
    assert.equal((await check("sender@example.com", "one@example.com")).blocked, false);
    for (let i = 0; i < 98; i++) {
        assert.equal((await check("sender@example.com", `mailbox${i}@example.com`)).blocked, false);
    }
    assert.match((await check("sender@example.com", "last@example.com")).reason, /sender 100\/99.*offense #1/);
    assert.equal((await check("SENDER@example.com", "another@example.com")).reason, "sender temporarily blocked");
    assert.equal((await check("", "one@example.com")).blocked, false);
    assert.equal((await checkInboundRateLimit("SENDER@example.com", "another@example.com", { DB }, false)).blocked, true);
    assert.equal((await checkInboundRateLimit("different@example.com", "another@example.com", { DB }, false)).blocked, false);
    assert.equal(await DB.prepare("SELECT count FROM worker_rate_limits WHERE key = ?").bind("inbound_sender:different@example.com").first(), null);
});

test("inbound pair limit escalates bans, does not extend active bans, and expires offenses", async (t) => {
    const { DB, sqlite } = createD1(t);
    let now = MIN;
    t.mock.method(Date, "now", () => now);
    const check = () => checkInboundRateLimit("sender@example.com", "recipient@example.com", { DB });
    for (const [offense, duration] of [[1, 10 * MIN], [2, 60 * MIN], [3, DAY], [1, 10 * MIN]]) {
        for (let i = 0; i < 30; i++) assert.equal((await check()).blocked, false);
        assert.match((await check()).reason, new RegExp(`pair 31/30.*banned ${duration / 1000}s \\(offense #${offense}\\)`));
        now += duration - 1;
        assert.equal((await check()).reason, "sender temporarily blocked");
        now += 1;
        await cleanupExpiredRateLimits(DB);
    }
    assert.equal(sqlite.prepare("SELECT count(*) AS total FROM worker_rate_limits WHERE expires_at <= ?").get(now).total, 0);
});

test("cron imports an existing KV timestamp once, then reads and writes only D1", async (t) => {
    const { DB, sqlite } = createD1(t);
    sqlite.exec("CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT, updated_at TEXT)");
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
