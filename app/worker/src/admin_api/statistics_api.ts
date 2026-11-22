import { Context } from 'hono'

const DAY = 86_400_000;
const PAGE_SIZE = 20;
const CACHE_MS = 60_000;
const knownAddresses = `SELECT name AS address FROM address UNION SELECT address FROM raw_mails UNION SELECT address FROM sendbox`;
type MailboxRow = { address: string; received: number; sent: number; most_address: string; most_count: number; least_address: string; least_count: number };
const cache = new WeakMap<D1Database, { day: string; pages: Map<string, { expires: number; data: Promise<Awaited<ReturnType<typeof readStatistics>>> }> }>();

export async function readStatistics(DB: D1Database, offset = 0, sort = 'received', now = Date.now()) {
    const today = new Date(now).toISOString().slice(0, 10);
    const start = new Date(now - 6 * DAY).toISOString().slice(0, 10);
    const end = new Date(now + DAY).toISOString().slice(0, 10);
    const order = sort === 'sent' ? 'sent DESC, received DESC, address' : 'received DESC, sent DESC, address';
    const [mailCount, addressCount, sendMailCount, daily, mailboxes] = await DB.batch([
        DB.prepare('SELECT count(*) AS count FROM raw_mails'),
        DB.prepare(`SELECT count(*) AS count FROM (${knownAddresses}) WHERE address IS NOT NULL AND address != ''`),
        DB.prepare('SELECT count(*) AS count FROM sendbox'),
        DB.prepare(`SELECT day, SUM(received) AS received, SUM(sent) AS sent FROM (
            SELECT substr(created_at, 1, 10) AS day, count(*) AS received, 0 AS sent FROM raw_mails
                WHERE created_at >= ? AND created_at < ? GROUP BY day
            UNION ALL
            SELECT substr(created_at, 1, 10) AS day, 0 AS received, count(*) AS sent FROM sendbox
                WHERE created_at >= ? AND created_at < ? GROUP BY day
        ) GROUP BY day ORDER BY day`).bind(start, end, start, end),
        DB.prepare(`WITH incoming AS (
            SELECT address, count(*) AS received FROM raw_mails WHERE created_at >= ? AND created_at < ? GROUP BY address
        ), outgoing AS (
            SELECT address, count(*) AS sent FROM sendbox WHERE created_at >= ? AND created_at < ? GROUP BY address
        ), counts AS (
            SELECT m.address, COALESCE(i.received, 0) AS received, COALESCE(o.sent, 0) AS sent
            FROM (${knownAddresses}) m
            LEFT JOIN incoming i ON i.address = m.address LEFT JOIN outgoing o ON o.address = m.address
            WHERE m.address IS NOT NULL AND m.address != ''
        ) SELECT *,
            first_value(address) OVER (ORDER BY received DESC, address) AS most_address,
            first_value(received) OVER (ORDER BY received DESC, address) AS most_count,
            first_value(address) OVER (ORDER BY received, address) AS least_address,
            first_value(received) OVER (ORDER BY received, address) AS least_count
        FROM counts ORDER BY ${order} LIMIT ? OFFSET ?`).bind(start, end, start, end, PAGE_SIZE, offset),
    ]);
    const rows = mailboxes.results as MailboxRow[];
    const first = rows[0];
    const days = Array.from({ length: 7 }, (_, index) => {
        const day = new Date(now - (6 - index) * DAY).toISOString().slice(0, 10);
        const row = daily.results.find(row => row.day === day);
        return { day, received: Number(row?.received ?? 0), sent: Number(row?.sent ?? 0) };
    });
    return {
        mailCount: Number(mailCount.results[0]?.count ?? 0),
        addressCount: Number(addressCount.results[0]?.count ?? 0),
        sendMailCount: Number(sendMailCount.results[0]?.count ?? 0),
        period: { start, end: today, timezone: 'UTC' }, days, cacheSeconds: CACHE_MS / 1000,
        mailboxes: {
            results: rows.map(({ address, received, sent }) => ({ address, received, sent })),
            offset, limit: PAGE_SIZE, sort: sort === 'sent' ? 'sent' : 'received',
            most: first ? { address: first.most_address, count: first.most_count } : null,
            least: first ? { address: first.least_address, count: first.least_count } : null,
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
        data.catch(() => state.pages.delete(key));
    }
    c.header('Cache-Control', 'no-store');
    return c.json(await entry.data);
};

export default { get };
