/**
 * 合并自独立 dinshi worker：定时删除 D1 中 N 分钟前的 raw_mails。
 * 保留 dinshi 原有逻辑：无条件执行，只删 raw_mails，不碰 KV 快照和其他表。
 * 执行间隔与"多少分钟前"均由管理端网页配置（默认每 10 分钟执行、删除 10 分钟前的数据）。
 */
export async function cleanupStaleRawMails(env: Bindings, olderThanMinutes = 10): Promise<number> {
    if (!env.DB) {
        console.error("[scheduled] cleanupStaleRawMails skipped: DB not available");
        return 0;
    }
    const minutes = Math.max(1, Math.floor(Number(olderThanMinutes) || 10));
    try {
        const result = await env.DB.prepare(
            `DELETE FROM raw_mails WHERE created_at < datetime('now', '-${minutes} minutes')`
        ).run();
        const deleted = (result as unknown as { meta?: { changes?: number } })?.meta?.changes ?? 0;
        console.log("[scheduled] cleanupStaleRawMails deleted:", deleted);
        return deleted;
    } catch (e) {
        console.error("[scheduled] cleanupStaleRawMails failed:", e);
        return 0;
    }
}
