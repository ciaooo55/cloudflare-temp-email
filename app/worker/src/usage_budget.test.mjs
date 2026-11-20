import assert from "node:assert/strict";
import { test } from "node:test";
import { createD1 } from "../test-loader/d1.mjs";
import { getUsageStatus, quotaRetryAfter, reserveInboundUsage, reserveReadUsage, usageLimits, USAGE_BUDGET_SCHEMA } from "./usage_budget.ts";

const now = Date.UTC(2026, 0, 1, 23, 59, 59);

test("soft exhaustion keeps inbound storage available until the hard budget, then resets at UTC midnight", async () => {
    const DB = createD1();
    DB.sqlite.exec(USAGE_BUDGET_SCHEMA);
    const env = { DB, D1_DAILY_WRITE_SOFT_LIMIT: "15", D1_DAILY_WRITE_HARD_LIMIT: "27" };
    assert.equal(await reserveInboundUsage(env, now), "full");
    assert.equal(await reserveReadUsage(env, now), false);
    assert.equal(await reserveInboundUsage(env, now), "receive-only");
    assert.equal(await reserveInboundUsage(env, now), "receive-only");
    assert.equal(await reserveInboundUsage(env, now), "paused");
    assert.deepEqual({ ...(await getUsageStatus(env, now)).usage }, { row_reads: 107, row_writes: 27, inbound_emails: 3 });
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
