import { Context } from 'hono';
import { cleanup } from './common.ts'
import { CONSTANTS } from './constants.ts'
import { getJsonSetting } from './utils.ts';
import { CleanupSettings } from './models/index.ts';
import { executeCustomSqlCleanup } from './admin_api/cleanup_api.ts';
import { cleanupStaleRawMails } from './scheduled_raw_mails.ts';
import { cleanupExpiredRateLimits } from './rate_limits.ts';
import { cleanupWorkerStore, importStorePage } from './worker_store.ts';
import { CRON_COST, reserveUsage } from './usage_budget.ts';
import {
    SCHEDULED_TASK_RAW_MAILS, SCHEDULED_TASK_AUTO_CLEANUP,
    cleanupInterval, isTaskDueThisTick, markTaskRun,
} from './scheduled_tasks.ts';

function asPositiveInt(value: unknown, fallback: number): number {
    const n = Math.floor(Number(value));
    return Number.isFinite(n) && n > 0 ? n : fallback;
}

export async function scheduled(event: ScheduledEvent, env: Bindings, ctx: any) {
    if (!(await reserveUsage(env, "soft", CRON_COST).catch(() => false))) return;
    const now = event.scheduledTime;
    console.log("Scheduled event: ", event);
    try {
        await cleanupExpiredRateLimits(env.DB);
        await cleanupWorkerStore(env);
        if (env.KV && await reserveUsage(env, "soft", { reads: 40, writes: 12 })) {
            await importStorePage(env);
        }
    } catch (error) {
        console.error("[scheduled] rate limit cleanup failed:", error);
    }
    const settings: CleanupSettings = (await getJsonSetting<CleanupSettings>(
        { env: env, } as Context<HonoCustomType>,
        CONSTANTS.AUTO_CLEANUP_KEY
    )) ?? ({} as CleanupSettings);

    // 任务一：raw_mails 定时清理（替代原独立 dinshi worker），默认开启以保持原有行为
    const rawMailsEnabled = settings.enableRawMailsAutoCleanup !== false;
    const rawMailsInterval = cleanupInterval(settings.rawMailsIntervalMinutes, 10);
    const rawMailsOlderThan = asPositiveInt(settings.cleanRawMailsMinutes, 10);
    if (rawMailsEnabled && await isTaskDueThisTick(env, SCHEDULED_TASK_RAW_MAILS, rawMailsInterval, now)) {
        const deleted = await cleanupStaleRawMails(env, rawMailsOlderThan);
        await markTaskRun(env, SCHEDULED_TASK_RAW_MAILS, deleted, now);
    } else {
        console.log("[scheduled] raw_mails cleanup skipped (disabled or not due).");
    }

    // 任务二：自动清理批次（含自定义 SQL），按整批间隔执行
    const batchInterval = cleanupInterval(settings.autoCleanupIntervalMinutes, 60);
    if (!await isTaskDueThisTick(env, SCHEDULED_TASK_AUTO_CLEANUP, batchInterval, now)) {
        console.log("[scheduled] auto cleanup batch skipped (not due).");
        return;
    }
    await markTaskRun(env, SCHEDULED_TASK_AUTO_CLEANUP, undefined, now);
    if (settings.enableMailsAutoCleanup) {
        await cleanup(
            { env: env, } as Context<HonoCustomType>,
            "mails",
            settings.cleanMailsDays
        );
    }
    if (settings.enableUnknowMailsAutoCleanup) {
        await cleanup(
            { env: env, } as Context<HonoCustomType>,
            "mails_unknow",
            settings.cleanUnknowMailsDays
        );
    }
    if (settings.enableSendBoxAutoCleanup) {
        await cleanup(
            { env: env, } as Context<HonoCustomType>,
            "sendbox",
            settings.cleanSendBoxDays
        );
    }
    if (settings.enableInactiveAddressAutoCleanup) {
        await cleanup(
            { env: env, } as Context<HonoCustomType>,
            "inactiveAddress",
            settings.cleanInactiveAddressDays
        );
    }
    if (settings.enableAddressAutoCleanup) {
        await cleanup(
            { env: env, } as Context<HonoCustomType>,
            "addressCreated",
            settings.cleanAddressDays
        );
    }
    if (settings.enableEmptyAddressAutoCleanup) {
        await cleanup(
            { env: env, } as Context<HonoCustomType>,
            "emptyAddress",
            settings.cleanEmptyAddressDays
        );
    }
    // Execute custom SQL cleanup tasks
    if (settings.customSqlCleanupList && settings.customSqlCleanupList.length > 0) {
        for (const customSql of settings.customSqlCleanupList) {
            if (customSql.enabled && customSql.sql) {
                const result = await executeCustomSqlCleanup(
                    { env: env, } as Context<HonoCustomType>,
                    customSql
                );
                if (!result.success) {
                    console.error(`Custom SQL cleanup [${customSql.name}] failed: ${result.error}`);
                }
            }
        }
    }
}
