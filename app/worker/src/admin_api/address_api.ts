import { Context } from 'hono'
import { Jwt } from 'hono/utils/jwt'

import i18n from '../i18n/index.ts'
import { handleListQuery } from '../common.ts'

const listAddresses = async (c: Context<HonoCustomType>) => {
    const { limit, offset, query, sort_by, sort_order, include_received } = c.req.query();
    if (include_received === '1') {
        const mailboxNames = `(SELECT name FROM address UNION SELECT address AS name FROM raw_mails UNION SELECT address AS name FROM sendbox)`;
        const filter = query ? ' WHERE instr(lower(n.name), lower(?)) > 0' : '';
        return await handleListQuery(c,
            `SELECT a.id, n.name, a.source_meta, a.created_at,`
            + ` COALESCE((SELECT MAX(created_at) FROM raw_mails WHERE address = n.name), a.updated_at) AS updated_at,`
            + ` (SELECT COUNT(*) FROM raw_mails WHERE address = n.name) AS mail_count,`
            + ` (SELECT COUNT(*) FROM sendbox WHERE address = n.name) AS send_count`
            + ` FROM ${mailboxNames} n LEFT JOIN address a ON a.name = n.name${filter}`,
            `SELECT COUNT(*) AS count FROM ${mailboxNames} n${filter}`,
            query ? [query] : [], limit, offset, 'n.name ASC'
        );
    }
    const allowedSortColumns: Record<string, string> = {
        'id': 'a.id',
        'name': 'a.name',
        'created_at': 'a.created_at',
        'updated_at': 'a.updated_at',
        'source_meta': 'a.source_meta',
        'mail_count': 'mail_count',
        'send_count': 'send_count',
    };
    const sortColumn = Object.hasOwn(allowedSortColumns, sort_by) ? allowedSortColumns[sort_by] : 'a.id';
    const sortDirection = sort_order === 'ascend' ? 'asc' : 'desc';
    const orderBy = `${sortColumn} ${sortDirection}`;
    if (query) {
        // D1 caps LIKE pattern length at 50 bytes; fall back to instr() for
        // longer queries to avoid "LIKE or GLOB pattern too complex" (#956).
        const useInstr = new TextEncoder().encode(query).length + 2 > 50;
        const whereClause = useInstr ? `instr(name, ?) > 0` : `name like ?`;
        const param = useInstr ? query : `%${query}%`;
        return await handleListQuery(c,
            `SELECT a.*,`
            + ` (SELECT COUNT(*) FROM raw_mails WHERE address = a.name) AS mail_count,`
            + ` (SELECT COUNT(*) FROM sendbox WHERE address = a.name) AS send_count`
            + ` FROM address a`
            + ` where ${whereClause}`,
            `SELECT count(*) as count FROM address where ${whereClause}`,
            [param], limit, offset, orderBy, ['password']
        );
    }
    return await handleListQuery(c,
        `SELECT a.*,`
        + ` (SELECT COUNT(*) FROM raw_mails WHERE address = a.name) AS mail_count,`
        + ` (SELECT COUNT(*) FROM sendbox WHERE address = a.name) AS send_count`
        + ` FROM address a`,
        `SELECT count(*) as count FROM address`,
        [], limit, offset, orderBy, ['password']
    );
};


const deleteAddress = async (c: Context<HonoCustomType>) => {
    const msgs = i18n.getMessagesByContext(c);
    const { id } = c.req.param();
    // single batch runs as one transaction: rows keyed by address name are
    // deleted first and the address row last, so the name subqueries still
    // resolve and a failed statement rolls back the whole deletion
    const results = await c.env.DB.batch([
        c.env.DB.prepare(
            `DELETE FROM raw_mails WHERE address IN`
            + ` (select name from address where id = ?) `
        ).bind(id),
        c.env.DB.prepare(
            `DELETE FROM address_sender WHERE address IN`
            + ` (select name from address where id = ?) `
        ).bind(id),
        c.env.DB.prepare(
            `DELETE FROM sendbox WHERE address IN`
            + ` (select name from address where id = ?) `
        ).bind(id),
        c.env.DB.prepare(
            `DELETE FROM address WHERE id = ? `
        ).bind(id),
    ]);
    const success = results.every((result) => result.success);
    if (!success) {
        return c.text(msgs.OperationFailedMsg, 500)
    }
    return c.json({ success })
};

const clearInbox = async (c: Context<HonoCustomType>) => {
    const msgs = i18n.getMessagesByContext(c);
    const { id } = c.req.param();
    const { success: mailSuccess } = await c.env.DB.prepare(
        `DELETE FROM raw_mails WHERE address IN`
        + ` (select name from address where id = ?) `
    ).bind(id).run();
    if (!mailSuccess) {
        return c.text(msgs.OperationFailedMsg, 500)
    }
    return c.json({ success: mailSuccess });
};

const clearSentItems = async (c: Context<HonoCustomType>) => {
    const msgs = i18n.getMessagesByContext(c);
    const { id } = c.req.param();
    const { success: sendboxSuccess } = await c.env.DB.prepare(
        `DELETE FROM sendbox WHERE address IN`
        + ` (select name from address where id = ?) `
    ).bind(id).run();
    if (!sendboxSuccess) {
        return c.text(msgs.OperationFailedMsg, 500)
    }
    return c.json({ success: sendboxSuccess });
};

const showPassword = async (c: Context<HonoCustomType>) => {
    const { id } = c.req.param();
    const name = await c.env.DB.prepare(
        `SELECT name FROM address WHERE id = ? `
    ).bind(id).first("name");
    const jwt = await Jwt.sign({
        address: name,
        address_id: id
    }, c.env.JWT_SECRET, "HS256")
    return c.json({ jwt });
};

const resetPassword = async (c: Context<HonoCustomType>) => {
    const msgs = i18n.getMessagesByContext(c);
    const { id } = c.req.param();
    const { password } = await c.req.json();
    // NOTE: Keep the admin API field as password, but the value is a frontend SHA-256 hash.
    if (!getBooleanValue(c.env.ENABLE_ADDRESS_PASSWORD)) {
        return c.text(msgs.PasswordChangeDisabledMsg, 403);
    }
    if (!password) {
        return c.text(msgs.NewPasswordRequiredMsg, 400);
    }
    const { success } = await c.env.DB.prepare(
        `UPDATE address SET password = ?, updated_at = datetime('now') WHERE id = ?`
    ).bind(password, id).run();
    if (!success) {
        return c.text(msgs.FailedUpdatePasswordMsg, 500);
    }
    return c.json({ success: true });
};

export default {
    listAddresses, deleteAddress, clearInbox, clearSentItems,
    showPassword, resetPassword
};
