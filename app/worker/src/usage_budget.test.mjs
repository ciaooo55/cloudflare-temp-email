import assert from "node:assert/strict";
import { test } from "node:test";
import { createD1 } from "../test-loader/d1.mjs";
import { getUsageStatus, quotaRetryAfter, reserveHttpUsage, reserveInboundUsage, reserveReadUsage, usageLimits, USAGE_BUDGET_SCHEMA } from "./usage_budget.ts";
import { WORKER_STORE_SCHEMA } from "./worker_store.ts";

const now = Date.UTC(2026, 0, 1, 23, 59, 59);

test("soft exhaustion keeps inbound storage available until the hard budget, then resets at UTC midnight", async () => {
    const DB = createD1();
    DB.sqlite.exec(USAGE_BUDGET_SCHEMA + WORKER_STORE_SCHEMA);
    const env = { DB, D1_DAILY_WRITE_SOFT_LIMIT: "15", D1_DAILY_WRITE_HARD_LIMIT: "35" };
    assert.equal(await reserveInboundUsage(env, now), "full");
    assert.equal(await reserveReadUsage(env, now), false);
    assert.equal(await reserveInboundUsage(env, now), "receive-only");
    assert.equal(await reserveInboundUsage(env, now), "receive-only");
    assert.equal(await reserveInboundUsage(env, now), "paused");
    assert.deepEqual({ ...(await getUsageStatus(env, now)).usage }, { row_reads: 107, row_writes: 35, inbound_emails: 3 });
    assert.equal(quotaRetryAfter(now), 1);
    assert.equal(await reserveInboundUsage(env, now + 1000), "full");
});

test("a read lease is reserved in one operation and limits are capped by the Free plan", async () => {
    const DB = createD1();
    DB.sqlite.exec(USAGE_BUDGET_SCHEMA);
    const env = { DB, D1_DAILY_READ_HARD_LIMIT: "6000000", D1_DAILY_READ_SOFT_LIMIT: "9000000", D1_DAILY_WRITE_SOFT_LIMIT: "33" };
    assert.equal(usageLimits(env).soft.reads, 5_000_000);
    for (let i = 0; i < 16; i++) assert.equal(await reserveReadUsage(env, now), true);
    assert.equal(await reserveReadUsage(env, now), false);
    assert.equal((await getUsageStatus(env, now)).usage.row_writes, 33);
});

test("fresh databases allow settings and admin login until budgeting is initialized", async () => {
    const DB = createD1();
    const env = { DB, D1_DAILY_WRITE_SOFT_LIMIT: "40" };
    assert.equal(await reserveHttpUsage(env, true), true);
    assert.equal(await reserveHttpUsage(env, false), true);
    assert.equal(await reserveInboundUsage(env), "receive-only");

    DB.sqlite.exec(USAGE_BUDGET_SCHEMA);
    assert.equal(await reserveHttpUsage(env, true), true);
    assert.equal(await reserveHttpUsage(env, false), false);
});

test('snapshot reads reserve their counter writes separately from ordinary API read leases', async () => {
    const DB = createD1();
    DB.sqlite.exec(USAGE_BUDGET_SCHEMA);
    const env = { DB, D1_DAILY_WRITE_SOFT_LIMIT: '98' };
    for (let i = 0; i < 16; i++) {
        assert.equal(await reserveReadUsage(env, now), true);
        assert.equal(await reserveReadUsage(env, now, true), true);
    }
    assert.equal((await getUsageStatus(env, now)).usage.row_writes, 98);
    assert.equal(await reserveReadUsage(env, now), false);
    assert.equal(await reserveReadUsage(env, now, true), false);
});

test("an unrelated D1 error does not disable HTTP budgeting", async () => {
    const DB = { prepare() { throw new Error("D1 unavailable"); } };
    assert.equal(await reserveHttpUsage({ DB }, true), false);
    assert.equal(await reserveHttpUsage({ DB }, false), false);
});
