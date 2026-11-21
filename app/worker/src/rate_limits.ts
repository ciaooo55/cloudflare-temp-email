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

const bans = new WeakMap<D1Database, Map<string, number>>();

export function cacheRateLimitBan(db: D1Database, key: string, until: number) {
    let entries = bans.get(db);
    if (!entries) { entries = new Map(); bans.set(db, entries); }
    if (entries.size >= 1024) entries.delete(entries.keys().next().value!);
    entries.set(key, until);
}

export function cachedRateLimitBan(db: D1Database, key: string, now: number): number {
    const entries = bans.get(db);
    const until = entries?.get(key) || 0;
    if (until > now) return until;
    entries?.delete(key);
    return 0;
}

export async function checkSnapshotRateLimit(
    db: D1Database, ip: string, limit: number, windowMs: number, banMs: number, now = Date.now()
): Promise<number> {
    const key = `snapshot_ip:${windowMs}:${ip}`;
    const cached = cachedRateLimitBan(db, key, now);
    if (cached) return Math.ceil((cached - now) / 1000);
    // Conditional UPSERT leaves an active ban untouched, including its expiry index.
    const row = await withRateLimitTable(db, () => db.prepare(`
        INSERT INTO worker_rate_limits (key, count, window_start, expires_at, blocked_until)
        VALUES (?1, 1, ?2, ?2 + ?3, 0)
        ON CONFLICT(key) DO UPDATE SET
            count = CASE WHEN blocked_until > 0 OR window_start <= ?2 - ?3 THEN 1 ELSE count + 1 END,
            window_start = CASE WHEN blocked_until > 0 OR window_start <= ?2 - ?3 THEN ?2 ELSE window_start END,
            expires_at = CASE
                WHEN blocked_until > 0 OR window_start <= ?2 - ?3 THEN ?2 + ?3
                WHEN count >= ?4 THEN ?2 + ?5 ELSE expires_at END,
            blocked_until = CASE
                WHEN blocked_until > 0 OR window_start <= ?2 - ?3 THEN 0
                WHEN count >= ?4 THEN ?2 + ?5 ELSE 0 END
        WHERE blocked_until <= ?2
        RETURNING blocked_until
    `).bind(key, now, windowMs, limit, banMs).first<{ blocked_until: number }>());
    const until = row?.blocked_until ?? await db.prepare(
        'SELECT blocked_until FROM worker_rate_limits WHERE key = ?'
    ).bind(key).first<number>('blocked_until') ?? 0;
    if (until > now) {
        cacheRateLimitBan(db, key, until);
        return Math.ceil((until - now) / 1000);
    }
    return 0;
}

export async function activeRateLimitBan(db: D1Database, key: string, now = Date.now()): Promise<number> {
    const cached = cachedRateLimitBan(db, key, now);
    if (cached) return cached;
    const until = await withRateLimitTable(db, () => db.prepare(
        'SELECT blocked_until FROM worker_rate_limits WHERE key = ? AND blocked_until > ?'
    ).bind(key, now).first<number>('blocked_until')) || 0;
    if (until) cacheRateLimitBan(db, key, until);
    return until;
}

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
