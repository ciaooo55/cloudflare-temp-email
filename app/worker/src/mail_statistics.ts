import { reserveUsage } from './usage_budget.ts';

export const MAIL_STATISTICS_START_KEY = 'mail_statistics_started_at';
export const MAIL_STATISTICS_SCHEMA = `CREATE TABLE IF NOT EXISTS mailbox_activity_day (
    day TEXT NOT NULL, address TEXT NOT NULL,
    received INTEGER NOT NULL DEFAULT 0, sent INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (day, address)
) WITHOUT ROWID`;

export async function initializeMailStatistics(DB: D1Database) {
    const trigger = (table: string, field: 'received' | 'sent') => DB.prepare(`
        CREATE TRIGGER IF NOT EXISTS count_${table}_activity AFTER INSERT ON ${table}
        WHEN NEW.address IS NOT NULL AND NEW.address != '' BEGIN
            INSERT INTO mailbox_activity_day (day, address, ${field})
            VALUES (date('now'), NEW.address, 1)
            ON CONFLICT (day, address) DO UPDATE SET ${field} = ${field} + 1;
        END`);
    await DB.batch([
        DB.prepare(MAIL_STATISTICS_SCHEMA),
        trigger('raw_mails', 'received'),
        trigger('sendbox', 'sent'),
        DB.prepare(`INSERT INTO settings (key, value) VALUES (?, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
            ON CONFLICT (key) DO NOTHING`).bind(MAIL_STATISTICS_START_KEY),
    ]);
}

export async function cleanupMailStatistics(env: Bindings, now = Date.now()) {
    const start = new Date(now - 6 * 86_400_000).toISOString().slice(0, 10);
    if (!await env.DB.prepare('SELECT 1 FROM mailbox_activity_day WHERE day < ? LIMIT 1').bind(start).first()) return;
    if (!await reserveUsage(env, 'soft', { reads: 160, writes: 65 }, false, now)) return;
    await env.DB.prepare(`DELETE FROM mailbox_activity_day WHERE (day, address) IN (
        SELECT day, address FROM mailbox_activity_day WHERE day < ? ORDER BY day, address LIMIT 64
    )`).bind(start).run();
}
