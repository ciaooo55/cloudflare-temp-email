import { getAbuseSettings } from '../abuse_settings.ts';
import { cachedRateLimitBan, cacheRateLimitBan, withRateLimitTable } from '../rate_limits.ts';

const ACTIVE_BAN = 'SELECT blocked_until FROM worker_rate_limits WHERE key = ? AND blocked_until > ?';
const INCREMENT_COUNTER = `
    INSERT INTO worker_rate_limits (key, count, window_start, expires_at)
    SELECT ?1, 1, ?2, ?3 WHERE NOT EXISTS (${ACTIVE_BAN})
    ON CONFLICT(key) DO UPDATE SET
        count = CASE WHEN window_start <= ?6 THEN 1 ELSE count + 1 END,
        window_start = CASE WHEN window_start <= ?6 THEN excluded.window_start ELSE window_start END,
        expires_at = CASE WHEN window_start <= ?6 THEN excluded.expires_at ELSE expires_at END
    RETURNING count
`;
const RECORD_BAN = `
    INSERT INTO worker_rate_limits (key, count, window_start, expires_at, blocked_until)
    SELECT ?1, 1, ?2, ?3, ?3 WHERE NOT EXISTS (${ACTIVE_BAN})
        AND EXISTS (SELECT 1 FROM worker_rate_limits WHERE (key = ?6 AND count > ?7) OR (key = ?8 AND count > ?9))
    ON CONFLICT(key) DO UPDATE SET count = count + 1, window_start = excluded.window_start,
        expires_at = excluded.expires_at, blocked_until = excluded.blocked_until
    RETURNING blocked_until
`;

/** SMTP envelope sender + normalized mailbox; empty senders (delivery reports) are exempt. */
export async function checkInboundRateLimit(
    sender: string, recipient: string, env: Bindings, record = true
): Promise<{ blocked: boolean; reason?: string }> {
    if (!env.DB) return { blocked: false };
    const s = sender.toLowerCase().trim();
    if (!s) return { blocked: false };
    const settings = await getAbuseSettings(env);
    if (!settings.inboundEnabled) return { blocked: false };
    const now = Date.now();
    const banKey = `inbound_ban:${s}`;
    if (cachedRateLimitBan(env.DB, banKey, now)) return { blocked: true, reason: 'sender temporarily blocked' };
    if (!record) {
        const active = await withRateLimitTable(env.DB, () => env.DB.prepare(ACTIVE_BAN)
            .bind(banKey, now).first<{ blocked_until: number }>());
        if (!active) return { blocked: false };
        cacheRateLimitBan(env.DB, banKey, active.blocked_until);
        return { blocked: true, reason: 'sender temporarily blocked' };
    }
    const r = recipient.toLowerCase().trim();
    const windowMs = settings.inboundWindowMinutes * 60_000;
    const pairKey = `inbound_pair:${windowMs}:${JSON.stringify([s, r])}`;
    const senderKey = `inbound_sender:${windowMs}:${s}`;
    const until = now + settings.inboundBanMinutes * 60_000;
    const [pair, senderTotal, ban] = await withRateLimitTable(env.DB, () => env.DB.batch<{
        count: number; blocked_until?: number;
    }>([
        env.DB.prepare(INCREMENT_COUNTER).bind(pairKey, now, now + windowMs, banKey, now, now - windowMs),
        env.DB.prepare(INCREMENT_COUNTER).bind(senderKey, now, now + windowMs, banKey, now, now - windowMs),
        env.DB.prepare(RECORD_BAN).bind(
            banKey, now, until, banKey, now, pairKey, settings.inboundPairLimit, senderKey, settings.inboundSenderLimit
        ),
    ]));
    if (!pair.results.length) return { blocked: true, reason: 'sender temporarily blocked' };
    if (ban.results[0]?.blocked_until) {
        cacheRateLimitBan(env.DB, banKey, ban.results[0].blocked_until!);
        return { blocked: true, reason: `inbound rate limit exceeded (pair ${pair.results[0].count}/${settings.inboundPairLimit}, sender ${senderTotal.results[0].count}/${settings.inboundSenderLimit})` };
    }
    return { blocked: false };
}
