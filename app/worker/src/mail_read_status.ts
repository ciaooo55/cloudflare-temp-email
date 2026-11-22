import type { Context } from 'hono';
import { getBooleanValue } from './utils.ts';

export async function updateMailReadStatus(c: Context<HonoCustomType>, address?: string) {
    if (!getBooleanValue(c.env.ENABLE_MAIL_READ_STATUS)) {
        return c.json({ error: 'Mail read status is disabled' }, 403);
    }
    const { isUnread } = await c.req.json<{ isUnread?: boolean }>().catch(() => ({ isUnread: undefined }));
    if (typeof isUnread !== 'boolean') {
        return c.json({ error: 'isUnread must be a boolean' }, 400);
    }
    const value = isUnread ? 1 : 0;
    const params = [value, c.req.param('id')];
    if (address !== undefined) params.push(address);
    params.push(value);
    const { success } = await c.env.DB.prepare(
        'UPDATE raw_mails SET is_unread = ? WHERE id = ?'
        + (address !== undefined ? ' AND address = ?' : '')
        + ' AND COALESCE(is_unread, 0) != ?'
    ).bind(...params).run();
    return c.json({ success });
}
