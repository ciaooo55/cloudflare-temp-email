import { Hono } from 'hono'

import utils, { requireTurnstile, getPasswords, getAdminPasswords, hashPassword } from '../utils.ts';
import i18n from '../i18n/index.ts';
import { ErrorCode } from '../error_codes.ts';

const api = new Hono<HonoCustomType>()

api.post('/open_api/site_login', async (c) => {
    const { password, cf_token } = await c.req.json().catch(() => ({}));
    const msgs = i18n.getMessagesByContext(c);
    const turnstileError = await requireTurnstile(c, cf_token, msgs);
    if (turnstileError) return turnstileError;
    const passwords = getPasswords(c);
    const hashedPasswords = await Promise.all(passwords.map(p => hashPassword(p)));
    if (!hashedPasswords.length || !password || !hashedPasswords.includes(password)) {
        return c.json({ code: ErrorCode.AUTH_SITE_PASSWORD_INVALID, message: msgs.CustomAuthPasswordMsg }, 401)
    }
    return c.json({ success: true })
})

api.post('/open_api/admin_login', async (c) => {
    const { password, cf_token } = await c.req.json().catch(() => ({}));
    const msgs = i18n.getMessagesByContext(c);
    const turnstileError = await requireTurnstile(c, cf_token, msgs);
    if (turnstileError) return turnstileError;
    const adminPasswords = getAdminPasswords(c);
    const hashedPasswords = await Promise.all(adminPasswords.map(p => hashPassword(p)));
    if (!hashedPasswords.length || !password || !hashedPasswords.includes(password)) {
        return c.json({ code: ErrorCode.AUTH_ADMIN_CREDENTIAL_INVALID, message: msgs.NeedAdminPasswordMsg }, 401)
    }
    return c.json({ success: true })
})

export { api }
