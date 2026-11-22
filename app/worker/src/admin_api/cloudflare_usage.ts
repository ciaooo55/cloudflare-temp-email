import type { Context } from 'hono';
import { checkIsAdmin, deleteSetting, saveSetting } from '../utils.ts';

const SETTING = 'cloudflare_d1_analytics';
const API = 'https://api.cloudflare.com/client/v4/graphql';
const QUERY = `query D1DailyUsage($account: string, $day: Date) {
    viewer { accounts(filter: { accountTag: $account }) {
        d1AnalyticsAdaptiveGroups(limit: 1, filter: { date_geq: $day, date_leq: $day }) {
            sum { rowsRead rowsWritten }
        }
    } }
}`;
const encoder = new TextEncoder();
type Config = { accountId: string; sealedToken: string; iv: string };
type Totals = { rowsRead: number; rowsWritten: number };
type Usage = { day: string; totals: Totals | null; fetchedAt: string };
const cache = new WeakMap<D1Database, { config: string; at: number; usage: Usage }>();
const utcDay = (date: Date) => date.toISOString().slice(0, 10);

async function encryptionKey(secret: string) {
    if (!secret) throw new Error('Analytics encryption key unavailable');
    const material = await crypto.subtle.digest('SHA-256', encoder.encode(`${SETTING}:v1:${secret}`));
    return crypto.subtle.importKey('raw', material, 'AES-GCM', false, ['encrypt', 'decrypt']);
}

async function seal(accountId: string, token: string, secret: string): Promise<Config> {
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const bytes = await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: encoder.encode(accountId) },
        await encryptionKey(secret), encoder.encode(token));
    return { accountId, iv: btoa(String.fromCharCode(...iv)), sealedToken: btoa(String.fromCharCode(...new Uint8Array(bytes))) };
}

async function unseal(config: Config, secret: string) {
    const iv = Uint8Array.from(atob(config.iv), char => char.charCodeAt(0));
    const bytes = Uint8Array.from(atob(config.sealedToken), char => char.charCodeAt(0));
    const plaintext = await crypto.subtle.decrypt({ name: 'AES-GCM', iv, additionalData: encoder.encode(config.accountId) },
        await encryptionKey(secret), bytes);
    return new TextDecoder().decode(plaintext);
}

async function query(accountId: string, token: string): Promise<Usage> {
    const now = new Date();
    const day = utcDay(now);
    const response = await fetch(API, {
        method: 'POST', redirect: 'manual', signal: AbortSignal.timeout(5_000),
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: QUERY, variables: { account: accountId, day } })
    });
    if (!response.ok) throw new Error('Analytics request failed');
    const body = await response.json<{
        errors?: unknown[] | null;
        data?: { viewer?: { accounts?: { d1AnalyticsAdaptiveGroups?: { sum?: Totals }[] }[] } };
    }>();
    const groups = body?.data?.viewer?.accounts?.[0]?.d1AnalyticsAdaptiveGroups;
    if (body?.errors?.length || !Array.isArray(groups) || groups.length > 1) throw new Error('Analytics data unavailable');
    if (!groups.length) return { day, totals: null, fetchedAt: new Date().toISOString() };
    const totals = groups[0]?.sum;
    if (!totals || !Number.isSafeInteger(totals.rowsRead) || totals.rowsRead < 0
        || !Number.isSafeInteger(totals.rowsWritten) || totals.rowsWritten < 0) throw new Error('Invalid analytics data');
    return { day, totals: { rowsRead: totals.rowsRead, rowsWritten: totals.rowsWritten }, fetchedAt: new Date().toISOString() };
}

const get = async (c: Context<HonoCustomType>) => {
    c.header('Cache-Control', 'no-store');
    if (!checkIsAdmin(c)) return c.json({ state: 'locked' });
    let accountId: string | undefined;
    try {
        const value = await c.env.DB.prepare('SELECT value FROM settings WHERE key = ?').bind(SETTING).first<string>('value');
        if (value === null) return c.json({ state: 'unconfigured' });
        const config = JSON.parse(value) as Config;
        accountId = config.accountId;
        const now = new Date();
        const previous = cache.get(c.env.DB);
        if (previous?.config === value && previous.usage.day === utcDay(now)
            && now.getTime() - previous.at < 60_000) return c.json({ state: 'connected', accountId, usage: previous.usage });
        const usage = await query(accountId, await unseal(config, c.env.JWT_SECRET));
        cache.set(c.env.DB, { config: value, at: now.getTime(), usage });
        return c.json({ state: 'connected', accountId, usage });
    } catch {
        return c.json({ state: 'unavailable', accountId });
    }
};

const save = async (c: Context<HonoCustomType>) => {
    c.header('Cache-Control', 'no-store');
    if (!checkIsAdmin(c)) return c.json({ error: 'Admin password required' }, 403);
    const input = await c.req.json<Partial<{ accountId: string; token: string }>>().catch(() => null);
    const accountId = typeof input?.accountId === 'string' ? input.accountId.trim().toLowerCase() : '';
    const token = typeof input?.token === 'string' ? input.token.trim() : '';
    if (!/^[a-f0-9]{32}$/.test(accountId) || !/^[A-Za-z0-9_-]{40,80}$/.test(token)) {
        return c.json({ error: 'Invalid account ID or API token' }, 400);
    }
    let usage: Usage;
    try { usage = await query(accountId, token); }
    catch { return c.json({ error: 'Cloudflare Analytics could not be verified' }, 422); }
    try {
        const config = JSON.stringify(await seal(accountId, token, c.env.JWT_SECRET));
        await saveSetting(c, SETTING, config);
        cache.set(c.env.DB, { config, at: Date.now(), usage });
        return c.json({ state: 'connected', accountId, usage });
    } catch {
        return c.json({ error: 'Could not save Analytics settings' }, 503);
    }
};

const remove = async (c: Context<HonoCustomType>) => {
    c.header('Cache-Control', 'no-store');
    if (!checkIsAdmin(c)) return c.json({ error: 'Admin password required' }, 403);
    await deleteSetting(c, SETTING);
    cache.delete(c.env.DB);
    return c.json({ state: 'unconfigured' });
};

export default { get, save, remove };
