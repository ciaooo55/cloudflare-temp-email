import { Context } from 'hono';
import { cleanup } from './common.ts'
import { CONSTANTS } from './constants.ts'
import type { CleanupSettings } from './models/index.ts';
import { executeCustomSqlCleanup } from './admin_api/cleanup_api.ts';
import { cleanupStaleRawMails } from './scheduled_raw_mails.ts';
import { cleanupExpiredRateLimits } from './rate_limits.ts';
import { cleanupWorkerStore, importStorePage } from './worker_store.ts';
import { CRON_COST, reserveUsage } from './usage_budget.ts';
import { cleanupMailStatistics } from './mail_statistics.ts';
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
    let settings: CleanupSettings;
    try {
        const row = await env.DB.prepare('SELECT value FROM settings WHERE key = ?')
            .bind(CONSTANTS.AUTO_CLEANUP_KEY).first<{ value: string }>();
        const parsed = row === null ? {} : JSON.parse(row.value);
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
            throw new Error('Invalid cleanup settings');
        }
        settings = parsed;
    } catch (error) {
        console.error('[scheduled] cleanup settings unavailable:', error);
        return;
    }
    try {
        await cleanupMailStatistics(env, now);
    } catch (error) {
        console.error('[scheduled] mail statistics cleanup failed:', error);
    }
    try {
        await cleanupExpiredRateLimits(env.DB);
        await cleanupWorkerStore(env);
        if (env.KV && await reserveUsage(env, "soft", { reads: 40, writes: 12 })) {
            await importStorePage(env);
        }
    } catch (error) {
        console.error("[scheduled] rate limit cleanup failed:", error);
    }

    // 任务一：raw_mails 定时清理（替代原独立 dinshi worker），默认开启以保持原有行为
    const rawMailsEnabled = settings.enableRawMailsAutoCleanup !== false;
    const rawMailsInterval = cleanupInterval(settings.rawMailsIntervalMinutes, 10);
    const rawMailsOlderThan = asPositiveInt(settings.cleanRawMailsMinutes, 10);
    if (rawMailsEnabled && await isTaskDueThisTick(env, SCHEDULED_TASK_RAW_MAILS, rawMailsInterval, now)) {
        const result = await cleanupStaleRawMails(env, rawMailsOlderThan);
        if (result.success && result.complete) {
            await markTaskRun(env, SCHEDULED_TASK_RAW_MAILS, result.deleted, now);
        }
    } else {
        console.log("[scheduled] raw_mails cleanup skipped (disabled or not due).");
    }

    // 任务二：自动清理批次（含自定义 SQL），按整批间隔执行
    const batchInterval = cleanupInterval(settings.autoCleanupIntervalMinutes, 60);
    if (!await isTaskDueThisTick(env, SCHEDULED_TASK_AUTO_CLEANUP, batchInterval, now)) {
        console.log("[scheduled] auto cleanup batch skipped (not due).");
        return;
    }
    let successful = true;
    const runCleanup = async (cleanType: string, days: number) => {
        try {
            await cleanup({ env } as Context<HonoCustomType>, cleanType, days);
        } catch (error) {
            successful = false;
            console.error(`[scheduled] ${cleanType} cleanup failed:`, error);
        }
    };
    if (settings.enableMailsAutoCleanup) {
        await runCleanup(
            "mails",
            settings.cleanMailsDays
        );
    }
    if (settings.enableUnknowMailsAutoCleanup) {
        await runCleanup(
            "mails_unknow",
            settings.cleanUnknowMailsDays
        );
    }
    if (settings.enableSendBoxAutoCleanup) {
        await runCleanup(
            "sendbox",
            settings.cleanSendBoxDays
        );
    }
    if (settings.enableInactiveAddressAutoCleanup) {
        await runCleanup(
            "inactiveAddress",
            settings.cleanInactiveAddressDays
        );
    }
    if (settings.enableAddressAutoCleanup) {
        await runCleanup(
            "addressCreated",
            settings.cleanAddressDays
        );
    }
    if (settings.enableEmptyAddressAutoCleanup) {
        await runCleanup(
            "emptyAddress",
            settings.cleanEmptyAddressDays
        );
    }
    // Execute custom SQL cleanup tasks
    if (settings.customSqlCleanupList && settings.customSqlCleanupList.length > 0) {
        for (const customSql of settings.customSqlCleanupList) {
            if (customSql.enabled && customSql.sql) {
                try {
                    const result = await executeCustomSqlCleanup(
                        { env: env, } as Context<HonoCustomType>,
                        customSql
                    );
                    if (!result.success) {
                        successful = false;
                        console.error(`Custom SQL cleanup [${customSql.name}] failed: ${result.error}`);
                    }
                } catch (error) {
                    successful = false;
                    console.error(`[scheduled] custom cleanup ${customSql.name} failed:`, error);
                }
            }
        }
    }
    if (successful) await markTaskRun(env, SCHEDULED_TASK_AUTO_CLEANUP, undefined, now);
}
