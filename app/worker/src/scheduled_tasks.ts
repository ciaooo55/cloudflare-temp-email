import type { ScheduledTaskRunInfo } from './models/index.ts';

// 定时任务 ID（对应 settings key `scheduled:last_run:<id>`）
export const SCHEDULED_TASK_RAW_MAILS = 'raw_mails';
export const SCHEDULED_TASK_AUTO_CLEANUP = 'auto_cleanup';

const LAST_RUN_PREFIX = 'scheduled:last_run:';

// 纯函数：判断任务本轮是否到点执行（便于单测）
export function isTaskDue(lastRunAt: number | undefined, intervalMinutes: number, now = Date.now()): boolean {
    if (!lastRunAt) return true;
    return now - lastRunAt >= intervalMinutes * 60_000;
}

export async function getTaskRunInfo(env: Bindings, task: string): Promise<ScheduledTaskRunInfo | null> {
    try {
        const key = LAST_RUN_PREFIX + task;
        if (env.DB) {
            const value = await env.DB.prepare(
                "SELECT value FROM settings WHERE key = ?"
            ).bind(key).first<string>("value");
            if (value !== null) return JSON.parse(value);
        }
        const legacy = await env.KV?.get<ScheduledTaskRunInfo>(key, "json") ?? null;
        if (env.DB && legacy) {
            await env.DB.prepare(
                "INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO NOTHING"
            ).bind(key, JSON.stringify(legacy)).run();
        }
        return legacy;
    } catch (e) {
        console.error("[scheduled] getTaskRunInfo failed:", e);
        return null;
    }
}

export async function markTaskRun(env: Bindings, task: string, affected?: number): Promise<void> {
    try {
        const key = LAST_RUN_PREFIX + task;
        const value = JSON.stringify({ at: Date.now(), affected });
        if (env.DB) {
            await env.DB.prepare(
                "INSERT INTO settings (key, value) VALUES (?, ?) "
                + "ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP"
            ).bind(key, value).run();
        } else {
            await env.KV?.put(key, value);
        }
    } catch (e) {
        console.error("[scheduled] markTaskRun failed:", e);
    }
}

export async function isTaskDueThisTick(env: Bindings, task: string, intervalMinutes: number): Promise<boolean> {
    const info = await getTaskRunInfo(env, task);
    return isTaskDue(info?.at, intervalMinutes);
}
