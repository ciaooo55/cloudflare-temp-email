import assert from "node:assert/strict";
import { test } from "node:test";
import {
    isTaskDue, getTaskRunInfo, markTaskRun, isTaskDueThisTick,
    SCHEDULED_TASK_RAW_MAILS,
} from "./scheduled_tasks.ts";

const MIN = 60_000;

test("isTaskDue: 从未执行过则到点", () => {
    assert.equal(isTaskDue(undefined, 3, 1_000_000), true);
});

test("isTaskDue: 间隔内未到点，间隔外到点", () => {
    const now = 1_000_000;
    assert.equal(isTaskDue(now - 2 * MIN, 3, now), false);
    assert.equal(isTaskDue(now - 3 * MIN, 3, now), true);
    assert.equal(isTaskDue(now - 10 * MIN, 3, now), true);
});

test("KV 不可用时降级为每轮都执行", async () => {
    assert.equal(await isTaskDueThisTick({}, SCHEDULED_TASK_RAW_MAILS, 60), true);
    assert.equal(await getTaskRunInfo({}, SCHEDULED_TASK_RAW_MAILS), null);
    await markTaskRun({}, SCHEDULED_TASK_RAW_MAILS, 1); // 不抛错
});

test("KV 读写 last_run 并按间隔门控", async () => {
    const store = {};
    const env = {
        KV: {
            get: async (k) => (store[k] ? JSON.parse(store[k]) : null),
            put: async (k, v) => { store[k] = v; },
        },
    };
    assert.equal(await isTaskDueThisTick(env, SCHEDULED_TASK_RAW_MAILS, 3), true);
    await markTaskRun(env, SCHEDULED_TASK_RAW_MAILS, 5);
    assert.equal(await isTaskDueThisTick(env, SCHEDULED_TASK_RAW_MAILS, 3), false);
    const info = await getTaskRunInfo(env, SCHEDULED_TASK_RAW_MAILS);
    assert.equal(info.affected, 5);
    assert.ok(info.at > 0);
});
