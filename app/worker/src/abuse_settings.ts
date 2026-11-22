import type { Context } from 'hono';

const ABUSE_SETTINGS_KEY = 'abuse_protection_settings';
export const DEFAULT_ABUSE_SETTINGS = {
    inboundEnabled: true,
    inboundWindowMinutes: 10,
    inboundPairLimit: 10,
    inboundSenderLimit: 100,
    inboundBanMinutes: 10,
    snapshotEnabled: true,
    snapshotWindowSeconds: 60,
    snapshotLimit: 60,
    snapshotBanMinutes: 10,
};
export type AbuseSettings = typeof DEFAULT_ABUSE_SETTINGS;

const ranges: Partial<Record<keyof AbuseSettings, number>> = {
    inboundWindowMinutes: 1440, inboundPairLimit: 10000, inboundSenderLimit: 100000,
    inboundBanMinutes: 10080, snapshotWindowSeconds: 3600, snapshotLimit: 10000,
    snapshotBanMinutes: 10080,
};
const cache = new WeakMap<D1Database, { settings: AbuseSettings; expiresAt: number }>();

export async function getAbuseSettings(env: Bindings): Promise<AbuseSettings> {
    const cached = cache.get(env.DB);
    if (cached && cached.expiresAt > Date.now()) return cached.settings;
    const value = await env.DB.prepare('SELECT value FROM settings WHERE key = ?')
        .bind(ABUSE_SETTINGS_KEY).first<string>('value');
    const stored = (value ? JSON.parse(value) : null) ?? {};
    const settings = { ...DEFAULT_ABUSE_SETTINGS };
    for (const key of Object.keys(settings) as (keyof AbuseSettings)[]) {
        const value = stored[key];
        if (typeof settings[key] === 'boolean' ? typeof value === 'boolean'
            : Number.isSafeInteger(value) && value >= 1 && value <= ranges[key]!) {
            Object.assign(settings, { [key]: value });
        }
    }
    cache.set(env.DB, { settings, expiresAt: Date.now() + 30_000 });
    return settings;
}

export async function getAbuseSettingsResponse(c: Context<HonoCustomType>) {
    return c.json(await getAbuseSettings(c.env));
}

export async function saveAbuseSettings(c: Context<HonoCustomType>) {
    const input = await c.req.json().catch(() => null);
    if (!input || typeof input !== 'object' || Array.isArray(input)) {
        return c.json({ message: 'Invalid protection settings' }, 400);
    }
    const settings = { ...DEFAULT_ABUSE_SETTINGS };
    for (const key of Object.keys(settings) as (keyof AbuseSettings)[]) {
        const value = input[key];
        if (typeof settings[key] === 'boolean' ? typeof value !== 'boolean'
            : !Number.isSafeInteger(value) || value < 1 || value > ranges[key]!) {
            return c.json({ message: `Invalid ${key}${ranges[key] ? ` (1-${ranges[key]})` : ''}` }, 400);
        }
        Object.assign(settings, { [key]: value });
    }
    await c.env.DB.prepare(`INSERT INTO settings (key, value) VALUES (?, ?)
        ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')`)
        .bind(ABUSE_SETTINGS_KEY, JSON.stringify(settings)).run();
    cache.delete(c.env.DB);
    return c.json({ success: true });
}
