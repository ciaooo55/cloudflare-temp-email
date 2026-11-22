import assert from "node:assert/strict";
import { test } from "node:test";
import { createD1 } from "../test-loader/d1.mjs";
import { USAGE_BUDGET_SCHEMA } from "./usage_budget.ts";
import { cleanupStaleRawMails } from "./scheduled_raw_mails.ts";

function makeEnv(count = 0) {
    const DB = createD1();
    DB.sqlite.exec(USAGE_BUDGET_SCHEMA + `
        CREATE TABLE raw_mails (id INTEGER PRIMARY KEY, created_at TEXT);
        CREATE INDEX idx_raw_mails_created_at ON raw_mails(created_at);
    `);
    const insert = DB.sqlite.prepare("INSERT INTO raw_mails(created_at) VALUES (datetime('now', '-20 minutes'))");
    for (let i = 0; i < count; i++) insert.run();
    DB.sqlite.exec("INSERT INTO raw_mails(created_at) VALUES (datetime('now'))");
    return { DB };
}

test("raw cleanup removes only expired rows and handles an empty backlog", async () => {
    const env = makeEnv(7);
    assert.deepEqual(await cleanupStaleRawMails(env), { success: true, deleted: 7, complete: true });
    assert.deepEqual(await cleanupStaleRawMails(env), { success: true, deleted: 0, complete: true });
    assert.equal(env.DB.sqlite.prepare("SELECT count(*) AS n FROM raw_mails").get().n, 1);
});

test("raw cleanup caps each tick and resumes the backlog on the next invocation", async () => {
    const env = makeEnv(350);
    assert.deepEqual(await cleanupStaleRawMails(env), { success: true, deleted: 300, complete: false });
    assert.deepEqual(await cleanupStaleRawMails(env), { success: true, deleted: 50, complete: true });
    const usage = env.DB.sqlite.prepare("SELECT row_reads, row_writes FROM worker_usage_day").get();
    assert.equal(usage.row_reads, 350 * 2 + 4 * 3);
    assert.equal(usage.row_writes, 350 * 4 + 4);
});

test("empty expiration queues do not reserve usage or write the budget ledger", async () => {
    const env = makeEnv();
    for (let tick = 0; tick < 10; tick++) {
        assert.deepEqual(await cleanupStaleRawMails(env), { success: true, deleted: 0, complete: true });
    }
    assert.equal(env.DB.sqlite.prepare('SELECT count(*) AS n FROM worker_usage_day').get().n, 0);
});

test("small expiration queues reserve only their bounded deletion cost", async () => {
    const env = { ...makeEnv(1), D1_DAILY_WRITE_SOFT_LIMIT: 10 };
    assert.deepEqual(await cleanupStaleRawMails(env), { success: true, deleted: 1, complete: true });
    assert.equal(env.DB.sqlite.prepare('SELECT row_writes FROM worker_usage_day').get().row_writes, 5);
});

test("raw cleanup reserves before each batch and stops when the budget is unavailable", async () => {
    const env = { ...makeEnv(350), D1_DAILY_WRITE_SOFT_LIMIT: 500 };
    assert.deepEqual(await cleanupStaleRawMails(env), { success: false, deleted: 100, complete: false });
    assert.equal(env.DB.sqlite.prepare("SELECT count(*) AS n FROM raw_mails").get().n, 251);
    const denied = { ...makeEnv(1), D1_DAILY_WRITE_SOFT_LIMIT: 0 };
    assert.deepEqual(await cleanupStaleRawMails(denied), { success: false, deleted: 0, complete: false });
});

test("raw cleanup reports database and statement failures", async t => {
    t.mock.method(console, "error", () => {});
    assert.deepEqual(await cleanupStaleRawMails({}), { success: false, deleted: 0, complete: false });
    const env = makeEnv(1);
    env.DB.sqlite.exec("DROP TABLE raw_mails");
    assert.deepEqual(await cleanupStaleRawMails(env), { success: false, deleted: 0, complete: false });
    const failed = makeEnv(1);
    const prepare = failed.DB.prepare;
    failed.DB.prepare = sql => sql.startsWith("DELETE FROM raw_mails")
        ? { bind: () => ({ run: async () => ({ success: false }) }) } : prepare(sql);
    assert.equal((await cleanupStaleRawMails(failed)).success, false);
});

test("raw cleanup preserves retention settings and invalid-value defaults", async () => {
    for (const minutes of [30, 0, "abc"]) {
        const env = makeEnv(3);
        const result = await cleanupStaleRawMails(env, minutes);
        assert.equal(result.deleted, minutes === 30 ? 0 : 3);
    }
});

test("raw cleanup uses the created_at index with a bounded id subquery", async () => {
    const env = makeEnv(1);
    const prepare = env.DB.prepare;
    let sql;
    env.DB.prepare = query => {
        if (query.startsWith("DELETE FROM raw_mails")) sql = query;
        return prepare(query);
    };
    await cleanupStaleRawMails(env);
    const plan = env.DB.sqlite.prepare("EXPLAIN QUERY PLAN " + sql).all("-10 minutes", 100);
    assert.ok(plan.some(row => row.detail.includes("idx_raw_mails_created_at")));
    assert.match(sql, /WHERE id IN/);
    assert.match(sql, /LIMIT \?/);
});
