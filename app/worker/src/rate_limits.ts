const SCHEMA = [
    `CREATE TABLE IF NOT EXISTS worker_rate_limits (
        key TEXT PRIMARY KEY,
        count INTEGER NOT NULL,
        window_start INTEGER NOT NULL,
        expires_at INTEGER NOT NULL,
        blocked_until INTEGER NOT NULL DEFAULT 0
    )`,
    "CREATE INDEX IF NOT EXISTS idx_worker_rate_limits_expires ON worker_rate_limits(expires_at)",
];

function isMissingRateLimitTable(error: unknown): boolean {
    return error instanceof Error && error.message.includes("no such table: worker_rate_limits");
}

export async function withRateLimitTable<T>(db: D1Database, query: () => Promise<T>): Promise<T> {
    try {
        return await query();
    } catch (error) {
        if (!isMissingRateLimitTable(error)) throw error;
        await db.batch(SCHEMA.map(sql => db.prepare(sql)));
        return query();
    }
}

export async function consumeRateLimit(
    db: D1Database, key: string, limit: number, now: number, resetBefore: number, expiresAt: number
): Promise<boolean> {
    const row = await withRateLimitTable(db, () => db.prepare(
        `INSERT INTO worker_rate_limits (key, count, window_start, expires_at) VALUES (?, 1, ?, ?)
        ON CONFLICT(key) DO UPDATE SET
            count = CASE WHEN window_start < ? THEN 1 ELSE count + 1 END,
            window_start = CASE WHEN window_start < ? THEN excluded.window_start ELSE window_start END,
            expires_at = excluded.expires_at
        WHERE window_start < ? OR count < ?
        RETURNING count`
    ).bind(key, now, expiresAt, resetBefore, resetBefore, resetBefore, limit).first());
    return row !== null;
}

export async function cleanupExpiredRateLimits(db: D1Database, now = Date.now()): Promise<void> {
    try {
        await db.prepare(
            `DELETE FROM worker_rate_limits WHERE key IN (
                SELECT key FROM worker_rate_limits WHERE expires_at <= ? ORDER BY expires_at LIMIT 1000
            )`
        ).bind(now).run();
    } catch (error) {
        if (!isMissingRateLimitTable(error)) throw error;
    }
}
