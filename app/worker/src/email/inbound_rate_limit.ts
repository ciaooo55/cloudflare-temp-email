/**
 * Inbound mail rate limiting (anti mail-bomb).
 *
 * Two dimensions, both per 1-minute sliding bucket:
 *   1. sender + recipient pair: 30/min  (same sender hammering one address)
 *   2. sender across all recipients: 99/min (same sender blasting many addresses)
 *
 * Graduated bans on violation:
 *   offense #1 -> 10 min ban
 *   offense #2 -> 1 hour ban
 *   offense #3+ -> 24 hour ban
 *
 * Offense counter resets after 24h of clean behavior (KV TTL, refreshed on
 * each offense). Temp bans are separate KV keys with TTL = ban duration.
 *
 * Sender identity = SMTP envelope sender (message.from), NOT the From header
 * (trivially spoofed). Empty envelope sender (bounces) is exempt.
 */

const PAIR_LIMIT = 30;
const SENDER_LIMIT = 99;
const OFFENSE_TTL_SECS = 24 * 3600;
const BAN_DURATIONS_SECS = [10 * 60, 3600, 24 * 3600];
const COUNTER_TTL_SECS = 120; // minute bucket + boundary slack

const banKey = (sender: string) => `inbound_ban|${sender}`;
const offenseKey = (sender: string) => `inbound_offense|${sender}`;
const counterKey = (dim: string, id: string) =>
    `inbound_rl|${dim}|${id}|${Math.floor(Date.now() / 60000)}`;

async function incrCounter(env: Bindings, key: string): Promise<number> {
    const cur = parseInt((await env.KV.get(key)) || "0", 10) || 0;
    const next = cur + 1;
    await env.KV.put(key, next.toString(), { expirationTtl: COUNTER_TTL_SECS });
    return next;
}

export async function checkInboundRateLimit(
    sender: string, recipient: string, env: Bindings
): Promise<{ blocked: boolean; reason?: string }> {
    if (!env.KV) return { blocked: false };
    const s = sender.toLowerCase().trim().slice(0, 200);
    if (!s) return { blocked: false }; // bounce / empty envelope sender: exempt
    const r = recipient.toLowerCase().trim().slice(0, 200);

    // 1. temp ban check (1 KV read)
    if (await env.KV.get(banKey(s))) {
        return { blocked: true, reason: "sender temporarily blocked" };
    }

    // 2. increment both counters
    const [pairCount, senderCount] = await Promise.all([
        incrCounter(env, counterKey("pair", `${s}|${r}`)),
        incrCounter(env, counterKey("sender", s)),
    ]);

    // 3. threshold check -> graduated ban
    if (pairCount > PAIR_LIMIT || senderCount > SENDER_LIMIT) {
        const oKey = offenseKey(s);
        const offense = (parseInt((await env.KV.get(oKey)) || "0", 10) || 0) + 1;
        await env.KV.put(oKey, offense.toString(), { expirationTtl: OFFENSE_TTL_SECS });
        const banSecs = BAN_DURATIONS_SECS[Math.min(offense - 1, BAN_DURATIONS_SECS.length - 1)];
        await env.KV.put(banKey(s), "1", { expirationTtl: banSecs });
        const reason =
            `inbound rate limit exceeded (pair ${pairCount}/${PAIR_LIMIT}, ` +
            `sender ${senderCount}/${SENDER_LIMIT}), banned ${banSecs}s (offense #${offense})`;
        console.warn(`[inbound-rl] ${reason} sender=${s}`);
        return { blocked: true, reason };
    }

    return { blocked: false };
}
