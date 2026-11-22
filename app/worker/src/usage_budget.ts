export const USAGE_BUDGET_SCHEMA = `
CREATE TABLE IF NOT EXISTS worker_usage_day (
    day TEXT PRIMARY KEY, row_reads INTEGER NOT NULL, row_writes INTEGER NOT NULL, inbound_emails INTEGER NOT NULL
);
`;

// Includes the atomic mailbox/day counter trigger.
export const MAIL_CORE_COST = { reads: 28, writes: 12 };
export const MAIL_FULL_COST = { reads: 60, writes: 17 };
export const API_WRITE_COST = { reads: 104, writes: 15 };
const API_READ_COST = { reads: 50, writes: 2 };
const SNAPSHOT_READ_COST = { reads: 52, writes: 4 };
export const CRON_COST = { reads: 122, writes: 5 };
const inboundSchemaReady = new WeakSet<D1Database>();

type Cost = { reads: number; writes: number };
type DailyUsage = { row_reads: number; row_writes: number; inbound_emails: number };
const FREE = { reads: 5_000_000, writes: 100_000 };

function bounded(value: unknown, fallback: number, max: number) {
    if (value === undefined || (typeof value === "string" && !value.trim())) return fallback;
    const number = Number(value);
    return Number.isSafeInteger(number) && number >= 0 ? Math.min(number, max) : fallback;
}

export function usageLimits(env: Bindings) {
    const hard = {
        reads: bounded(env.D1_DAILY_READ_HARD_LIMIT, 4_750_000, FREE.reads),
        writes: bounded(env.D1_DAILY_WRITE_HARD_LIMIT, 95_000, FREE.writes),
    };
    const soft = {
        reads: Math.min(hard.reads, bounded(env.D1_DAILY_READ_SOFT_LIMIT, 4_000_000, FREE.reads)),
        writes: Math.min(hard.writes, bounded(env.D1_DAILY_WRITE_SOFT_LIMIT, 80_000, FREE.writes)),
    };
    return { soft, hard };
}

const utcDay = (now: number) => new Date(now).toISOString().slice(0, 10);

export async function reserveUsage(env: Bindings, tier: "soft" | "hard", cost: Cost, inbound = false, now = Date.now()) {
    const limit = usageLimits(env)[tier];
    const reads = cost.reads + 1;
    const writes = cost.writes + 1;
    if (reads > limit.reads || writes > limit.writes) return false;
    const row = await env.DB.prepare(`
        INSERT INTO worker_usage_day (day, row_reads, row_writes, inbound_emails) VALUES (?, ?, ?, ?)
        ON CONFLICT(day) DO UPDATE SET
            row_reads = row_reads + excluded.row_reads,
            row_writes = row_writes + excluded.row_writes,
            inbound_emails = inbound_emails + excluded.inbound_emails
        WHERE row_reads + excluded.row_reads <= ? AND row_writes + excluded.row_writes <= ?
        RETURNING day
    `).bind(utcDay(now), reads, writes, Number(inbound), limit.reads, limit.writes).first();
    return row !== null;
}

export async function reserveInboundUsage(env: Bindings, now = Date.now()) {
    if (!inboundSchemaReady.has(env.DB)) {
        const count = await env.DB.prepare(`SELECT COUNT(*) AS n FROM sqlite_schema
            WHERE type = 'table' AND name IN ('worker_usage_day', 'worker_store', 'worker_store_chunk', 'worker_store_import')`)
            .first<number>("n");
        if (count !== 4) return "receive-only";
        inboundSchemaReady.add(env.DB);
    }
    if (await reserveUsage(env, "soft", MAIL_FULL_COST, true, now)) return "full";
    if (await reserveUsage(env, "hard", MAIL_CORE_COST, true, now)) return "receive-only";
    return "paused";
}

type ReadLease = { day: string; remaining: number };
const readLeases = new WeakMap<D1Database, ReadLease>();
const snapshotReadLeases = new WeakMap<D1Database, ReadLease>();
const READ_LEASE_SIZE = 16;

export async function reserveReadUsage(env: Bindings, now = Date.now(), snapshot = false) {
    const day = utcDay(now);
    const leases = snapshot ? snapshotReadLeases : readLeases;
    const cost = snapshot ? SNAPSHOT_READ_COST : API_READ_COST;
    const lease = leases.get(env.DB);
    if (lease?.day === day && lease.remaining > 0) {
        lease.remaining--;
        return true;
    }
    if (await reserveUsage(env, "soft", {
        reads: cost.reads * READ_LEASE_SIZE, writes: cost.writes * READ_LEASE_SIZE,
    }, false, now)) {
        leases.set(env.DB, { day, remaining: READ_LEASE_SIZE - 1 });
        return true;
    }
    return false;
}

export async function reserveHttpUsage(env: Bindings, readOnly: boolean, snapshot = false) {
    try {
        return await (readOnly ? reserveReadUsage(env, Date.now(), snapshot) : reserveUsage(env, "soft", API_WRITE_COST));
    } catch (error) {
        return error instanceof Error && /\bno such table: worker_usage_day\b/.test(error.message);
    }
}

export async function getUsageStatus(env: Bindings, now = Date.now()) {
    const day = utcDay(now);
    const yesterday = utcDay(now - 86_400_000);
    const { results } = await env.DB.prepare("SELECT day, row_reads, row_writes, inbound_emails FROM worker_usage_day WHERE day IN (?, ?)")
        .bind(day, yesterday).all<DailyUsage & { day: string }>();
    const days = [day, yesterday].map(date => {
        const row = results.find(row => row.day === date);
        return { day: date, recorded: !!row, usage: {
            row_reads: row?.row_reads ?? 0,
            row_writes: row?.row_writes ?? 0,
            inbound_emails: row?.inbound_emails ?? 0,
        } };
    });
    return { day, ...usageLimits(env), free: FREE, usage: days[0].usage, days };
}

export function quotaRetryAfter(now = Date.now()) {
    return Math.ceil((86_400_000 - (now % 86_400_000)) / 1000);
}
