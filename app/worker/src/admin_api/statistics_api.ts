import { Context } from 'hono'
import { MAIL_STATISTICS_START_KEY } from '../mail_statistics.ts';

const DAY = 86_400_000;
const PAGE_SIZE = 20;
const CACHE_MS = 60_000;
const mailboxCounts = `WITH counts AS (
    SELECT address, SUM(received) AS received, SUM(sent) AS sent FROM (
        SELECT name AS address, 0 AS received, 0 AS sent FROM address
        UNION ALL
        SELECT address, received, sent FROM mailbox_activity_day WHERE day >= ? AND day < ?
    ) WHERE address IS NOT NULL AND address != '' GROUP BY address
)`;
type MailboxRow = { address: string; received: number; sent: number };
const cache = new WeakMap<D1Database, { day: string; pages: Map<string, { expires: number; data: Promise<Awaited<ReturnType<typeof readStatistics>>> }> }>();

export async function readStatistics(DB: D1Database, offset = 0, sort = 'received', now = Date.now()) {
    const today = new Date(now).toISOString().slice(0, 10);
    const start = new Date(now - 6 * DAY).toISOString().slice(0, 10);
    const end = new Date(now + DAY).toISOString().slice(0, 10);
    const order = sort === 'sent' ? 'sent DESC, received DESC, address' : 'received DESC, sent DESC, address';
    const [daily, summary, mailboxes] = await DB.batch([
        DB.prepare(`SELECT day, SUM(received) AS received, SUM(sent) AS sent
            FROM mailbox_activity_day WHERE day >= ? AND day < ? GROUP BY day ORDER BY day`).bind(start, end),
        DB.prepare(`${mailboxCounts} SELECT count(*) AS count,
            (SELECT address FROM counts ORDER BY received DESC, address LIMIT 1) AS most_address,
            (SELECT received FROM counts ORDER BY received DESC, address LIMIT 1) AS most_count,
            (SELECT address FROM counts ORDER BY received, address LIMIT 1) AS least_address,
            (SELECT received FROM counts ORDER BY received, address LIMIT 1) AS least_count,
            (SELECT value FROM settings WHERE key = ?) AS started_at FROM counts`).bind(start, end, MAIL_STATISTICS_START_KEY),
        DB.prepare(`${mailboxCounts} SELECT * FROM counts ORDER BY ${order} LIMIT ? OFFSET ?`).bind(start, end, PAGE_SIZE, offset),
    ]);
    const rows = mailboxes.results as MailboxRow[];
    const info = summary.results[0];
    const startedAt = info?.started_at as string | undefined;
    if (!startedAt) throw new Error('Mail statistics have not been initialized');
    const days = Array.from({ length: 7 }, (_, index) => {
        const day = new Date(now - (6 - index) * DAY).toISOString().slice(0, 10);
        const row = daily.results.find(row => row.day === day);
        const available = day >= startedAt.slice(0, 10);
        return { day, received: available ? Number(row?.received ?? 0) : null, sent: available ? Number(row?.sent ?? 0) : null };
    });
    return {
        mailCount: days.reduce((sum, day) => sum + (day.received ?? 0), 0),
        addressCount: Number(info?.count ?? 0),
        sendMailCount: days.reduce((sum, day) => sum + (day.sent ?? 0), 0),
        period: { start, end: today, timezone: 'UTC', startedAt }, days, cacheSeconds: CACHE_MS / 1000,
        mailboxes: {
            results: rows.map(({ address, received, sent }) => ({ address, received, sent })),
            offset, limit: PAGE_SIZE, sort: sort === 'sent' ? 'sent' : 'received',
            most: info?.most_address ? { address: info.most_address, count: info.most_count } : null,
            least: info?.least_address ? { address: info.least_address, count: info.least_count } : null,
        },
    };
}

const get = async (c: Context<HonoCustomType>) => {
    const offsetInput = Number(c.req.query('offset') || 0);
    const offset = Number.isSafeInteger(offsetInput) && offsetInput >= 0 ? offsetInput : 0;
    const sort = c.req.query('sort') === 'sent' ? 'sent' : 'received';
    const now = Date.now();
    const day = new Date(now).toISOString().slice(0, 10);
    let state = cache.get(c.env.DB);
    if (!state || state.day !== day) {
        state = { day, pages: new Map() };
        cache.set(c.env.DB, state);
    }
    const key = `${offset}:${sort}`;
    let entry = state.pages.get(key);
    if (!entry || entry.expires <= now) {
        if (state.pages.size >= 20) state.pages.delete(state.pages.keys().next().value!);
        const data = readStatistics(c.env.DB, offset, sort, now);
        entry = { expires: now + CACHE_MS, data };
        state.pages.set(key, entry);
        data.catch(() => { if (state.pages.get(key)?.data === data) state.pages.delete(key); });
    }
    c.header('Cache-Control', 'no-store');
    return c.json(await entry.data);
};

export default { get };
