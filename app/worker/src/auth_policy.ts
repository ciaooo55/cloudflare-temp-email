import type { Context } from 'hono';

import i18n from './i18n/index.ts';
import { matchesSecret } from './secret_compare.ts';
import { checkIsAdmin, getBooleanValue, getEnvStringList, getPasswords } from './utils.ts';

export async function limitAuthentication(c: Context<HonoCustomType>, scope: 'admin' | 'site' | 'mailbox', kind: 'login' | 'header') {
    const ip = c.req.header('cf-connecting-ip');
    const limiter = kind === 'login' ? c.env.AUTH_LOGIN_RATE_LIMITER : c.env.AUTH_HEADER_RATE_LIMITER;
    if (!limiter || !ip) return null;
    const { success } = await limiter.limit({ key: `auth:${scope}:${ip}` });
    if (success) return null;
    c.header('Retry-After', '60');
    return c.text('Too many authentication attempts', 429);
}

export function requireSitePassword(c: Context<HonoCustomType>) {
    const passwords = getPasswords(c);
    if (!passwords.length || matchesSecret(c.req.header('x-custom-auth'), passwords)) return null;
    return c.json({ code: 'AUTH_SITE_PASSWORD_INVALID',
        message: i18n.getMessagesByContext(c).CustomAuthPasswordMsg }, 401);
}

export function requireAdminPolicy(c: Context<HonoCustomType>) {
    const msgs = i18n.getMessagesByContext(c);
    const ipWhitelist = getEnvStringList(c.env.ADMIN_API_IP_WHITELIST)
        .filter(ip => typeof ip === 'string').map(ip => ip.trim()).filter(Boolean);
    const ip = c.req.header('cf-connecting-ip')?.trim();
    if (ipWhitelist.length && (!ip || !ipWhitelist.includes(ip))) {
        return c.text(msgs.AdminApiIpNotAllowedMsg, 403);
    }
    if (checkIsAdmin(c) || getBooleanValue(c.env.DISABLE_ADMIN_PASSWORD_CHECK)) return null;
    return c.json({ code: 'AUTH_ADMIN_CREDENTIAL_INVALID', message: msgs.NeedAdminPasswordMsg }, 401);
}
