/**
 * Inbound mail rate limiting (anti mail-bomb).
 *
 * Two dimensions, both per fixed 1-minute bucket:
 *   1. sender + recipient pair: 30/min  (same sender hammering one address)
 *   2. sender across all recipients: 99/min (same sender blasting many addresses)
 *
 * Graduated bans on violation:
 *   offense #1 -> 10 min ban
 *   offense #2 -> 1 hour ban
 *   offense #3+ -> 24 hour ban
 *
 * Offense counter resets 24h after the last offense.
 *
 * Sender identity = SMTP envelope sender (message.from), NOT the From header
 * (trivially spoofed). Empty envelope sender (bounces) is exempt.
 */

import { withRateLimitTable } from '../rate_limits.ts';

const PAIR_LIMIT = 30;
const SENDER_LIMIT = 99;
const OFFENSE_TTL_MS = 86_400_000;
const BAN_DURATIONS_MS = [600_000, 3_600_000, OFFENSE_TTL_MS];
const COUNTER_TTL_MS = 120_000;

const ACTIVE_BAN = "SELECT 1 FROM worker_rate_limits WHERE key = ? AND blocked_until > ?";
const INCREMENT_COUNTER = `
    INSERT INTO worker_rate_limits (key, count, window_start, expires_at)
    SELECT ?, 1, ?, ? WHERE NOT EXISTS (${ACTIVE_BAN})
    ON CONFLICT(key) DO UPDATE SET
        count = CASE WHEN window_start = excluded.window_start THEN count + 1 ELSE 1 END,
        window_start = excluded.window_start,
        expires_at = excluded.expires_at
    RETURNING count
`;
const RECORD_OFFENSE = `
    INSERT INTO worker_rate_limits (key, count, window_start, expires_at, blocked_until)
    SELECT ?, 1, ?, ?, ? WHERE NOT EXISTS (${ACTIVE_BAN})
        AND EXISTS (
            SELECT 1 FROM worker_rate_limits WHERE (key = ? AND count > ?) OR (key = ? AND count > ?)
        )
    ON CONFLICT(key) DO UPDATE SET
        count = CASE WHEN expires_at <= excluded.window_start THEN 1 ELSE count + 1 END,
        window_start = excluded.window_start,
        expires_at = excluded.expires_at,
        blocked_until = CASE
            WHEN expires_at <= excluded.window_start THEN excluded.blocked_until
            WHEN count = 1 THEN excluded.window_start + ?
            ELSE excluded.window_start + ?
        END
    RETURNING count, blocked_until
`;

export async function checkInboundRateLimit(
    sender: string, recipient: string, env: Bindings
): Promise<{ blocked: boolean; reason?: string }> {
    if (!env.DB) return { blocked: false };
    const s = sender.toLowerCase().trim().slice(0, 200);
    if (!s) return { blocked: false }; // bounce / empty envelope sender: exempt
    const r = recipient.toLowerCase().trim().slice(0, 200);

    const now = Date.now();
    const bucket = Math.floor(now / 60_000) * 60_000;
    const pairKey = `inbound_pair:${JSON.stringify([s, r])}`;
    const senderKey = `inbound_sender:${s}`;
    const banKey = `inbound_ban:${s}`;
    const [pair, senderTotal, offenseResult] = await withRateLimitTable(env.DB, () => env.DB.batch<{
        count: number;
        blocked_until?: number;
    }>([
        env.DB.prepare(INCREMENT_COUNTER).bind(pairKey, bucket, now + COUNTER_TTL_MS, banKey, now),
        env.DB.prepare(INCREMENT_COUNTER).bind(senderKey, bucket, now + COUNTER_TTL_MS, banKey, now),
        env.DB.prepare(RECORD_OFFENSE).bind(
            banKey, now, now + OFFENSE_TTL_MS, now + BAN_DURATIONS_MS[0], banKey, now,
            pairKey, PAIR_LIMIT, senderKey, SENDER_LIMIT, BAN_DURATIONS_MS[1], BAN_DURATIONS_MS[2]
        ),
    ]));
    if (!pair.results.length) {
        return { blocked: true, reason: "sender temporarily blocked" };
    }

    const offense = offenseResult.results[0];
    if (offense?.blocked_until) {
        const banSecs = (offense.blocked_until - now) / 1000;
        const reason =
            `inbound rate limit exceeded (pair ${pair.results[0].count}/${PAIR_LIMIT}, ` +
            `sender ${senderTotal.results[0].count}/${SENDER_LIMIT}), banned ${banSecs}s (offense #${offense.count})`;
        console.warn(`[inbound-rl] ${reason} sender=${s}`);
        return { blocked: true, reason };
    }

    return { blocked: false };
}
