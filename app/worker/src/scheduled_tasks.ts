import type { ScheduledTaskRunInfo } from './models/index.ts';

// 定时任务 ID（对应 KV key `scheduled:last_run:<id>`）
export const SCHEDULED_TASK_RAW_MAILS = 'raw_mails';
export const SCHEDULED_TASK_AUTO_CLEANUP = 'auto_cleanup';

const LAST_RUN_KV_PREFIX = 'scheduled:last_run:';

// 纯函数：判断任务本轮是否到点执行（便于单测）
export function isTaskDue(lastRunAt: number | undefined, intervalMinutes: number, now = Date.now()): boolean {
    if (!lastRunAt) return true;
    return now - lastRunAt >= intervalMinutes * 60_000;
}

export async function getTaskRunInfo(env: Bindings, task: string): Promise<ScheduledTaskRunInfo | null> {
    try {
        if (!env.KV) return null;
        return await env.KV.get<ScheduledTaskRunInfo>(LAST_RUN_KV_PREFIX + task, "json");
    } catch (e) {
        console.error("[scheduled] getTaskRunInfo failed:", e);
        return null;
    }
}

export async function markTaskRun(env: Bindings, task: string, affected?: number): Promise<void> {
    try {
        if (!env.KV) return;
        await env.KV.put(LAST_RUN_KV_PREFIX + task, JSON.stringify({ at: Date.now(), affected }));
    } catch (e) {
        console.error("[scheduled] markTaskRun failed:", e);
    }
}

// KV 不可用时降级为"每轮都执行"（与旧逻辑一致，避免静默跳过清理）
export async function isTaskDueThisTick(env: Bindings, task: string, intervalMinutes: number): Promise<boolean> {
    if (!env.KV) return true;
    const info = await getTaskRunInfo(env, task);
    return isTaskDue(info?.at, intervalMinutes);
}
