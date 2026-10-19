import assert from "node:assert/strict";
import { test } from "node:test";
import { cleanupStaleRawMails } from "./scheduled_raw_mails.ts";

const makeEnv = (changes = 5, fail = false) => {
    let seenSql = "";
    return {
        seen: () => seenSql,
        env: {
            DB: {
                prepare: (sql) => {
                    seenSql = sql;
                    return {
                        run: async () => {
                            if (fail) throw new Error("d1 down");
                            return { meta: { changes } };
                        },
                    };
                },
            },
        },
    };
};

test("dinshi 合并: 执行原 SQL 并返回删除数", async () => {
    const { env, seen } = makeEnv(7);
    const deleted = await cleanupStaleRawMails(env);
    assert.equal(deleted, 7);
    assert.match(seen(), /DELETE FROM raw_mails/);
    assert.match(seen(), /created_at < datetime\('now', '-10 minutes'\)/);
});

test("dinshi 合并: DB 不可用/执行失败时返回 0 不抛错", async () => {
    assert.equal(await cleanupStaleRawMails({}), 0);
    const { env } = makeEnv(0, true);
    assert.equal(await cleanupStaleRawMails(env), 0);
});

test("dinshi 网页配置: cleanRawMailsMinutes 参数拼入 SQL", async () => {
    const { env, seen } = makeEnv(3);
    const deleted = await cleanupStaleRawMails(env, 30);
    assert.equal(deleted, 3);
    assert.match(seen(), /datetime\('now', '-30 minutes'\)/);
});

test("dinshi 网页配置: 非法 minutes 参数回退到默认 10", async () => {
    const { env, seen } = makeEnv(1);
    await cleanupStaleRawMails(env, 0);
    assert.match(seen(), /datetime\('now', '-10 minutes'\)/);
    await cleanupStaleRawMails(env, "abc");
    assert.match(seen(), /datetime\('now', '-10 minutes'\)/);
});
