import assert from "node:assert/strict";
import { test } from "node:test";
import { createD1 } from "../test-loader/d1.mjs";
import {
    cleanupInterval, isTaskDue, getTaskRunInfo, markTaskRun, isTaskDueThisTick,
    SCHEDULED_TASK_RAW_MAILS,
} from "./scheduled_tasks.ts";

const MIN = 60_000;

test("cleanup intervals clamp legacy settings and use elapsed time", () => {
    for (const interval of [1, 2, 3, 4, "4"]) assert.equal(cleanupInterval(interval, 10), 5);
    assert.equal(cleanupInterval(undefined, 10), 10);
    const interval = cleanupInterval(7, 10);
    assert.equal(isTaskDue(MIN, interval, 6 * MIN), false);
    assert.equal(isTaskDue(MIN, interval, 11 * MIN), true);
});

test("isTaskDue: 从未执行过则到点", () => {
    assert.equal(isTaskDue(undefined, 3, 1_000_000), true);
});

test("isTaskDue: 间隔内未到点，间隔外到点", () => {
    const now = 1_000_000;
    assert.equal(isTaskDue(now - 2 * MIN, 3, now), false);
    assert.equal(isTaskDue(now - 3 * MIN, 3, now), true);
    assert.equal(isTaskDue(now - 10 * MIN, 3, now), true);
});

test("无 D1 时取不到执行记录", async () => {
    assert.equal(await isTaskDueThisTick({}, SCHEDULED_TASK_RAW_MAILS, 60), true);
    assert.equal(await getTaskRunInfo({}, SCHEDULED_TASK_RAW_MAILS), null);
    await markTaskRun({}, SCHEDULED_TASK_RAW_MAILS, 1); // 不抛错
});

test("无 KV 时在 D1 读写 last_run 并按间隔门控", async () => {
    const DB = createD1();
    DB.sqlite.exec("CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT, updated_at TEXT)");
    const env = { DB };
    assert.equal(await isTaskDueThisTick(env, SCHEDULED_TASK_RAW_MAILS, 3), true);
    await markTaskRun(env, SCHEDULED_TASK_RAW_MAILS, 5);
    assert.equal(await isTaskDueThisTick(env, SCHEDULED_TASK_RAW_MAILS, 3), false);
    const info = await getTaskRunInfo(env, SCHEDULED_TASK_RAW_MAILS);
    assert.equal(info.affected, 5);
    assert.ok(info.at > 0);
});
