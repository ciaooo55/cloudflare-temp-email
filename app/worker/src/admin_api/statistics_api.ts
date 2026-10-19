import { Context } from 'hono'

const get = async (c: Context<HonoCustomType>) => {
    const [
        mailCountRes,
        addressCountRes,
        activeAddressCount7daysRes,
        activeAddressCount30daysRes,
        sendMailCountRes,
        userCountRes,
    ] = await c.env.DB.batch([
        c.env.DB.prepare(`SELECT count(*) as count FROM raw_mails`),
        c.env.DB.prepare(`SELECT count(*) as count FROM address`),
        c.env.DB.prepare(`SELECT count(*) as count FROM address where updated_at > datetime('now', '-7 day')`),
        c.env.DB.prepare(`SELECT count(*) as count FROM address where updated_at > datetime('now', '-30 day')`),
        c.env.DB.prepare(`SELECT count(*) as count FROM sendbox`),
        c.env.DB.prepare(`SELECT count(*) as count FROM users`),
    ]);
    const mailCount = mailCountRes.results?.[0]?.count as number | undefined;
    const addressCount = addressCountRes.results?.[0]?.count as number | undefined;
    const activeAddressCount7days = activeAddressCount7daysRes.results?.[0]?.count as number | undefined;
    const activeAddressCount30days = activeAddressCount30daysRes.results?.[0]?.count as number | undefined;
    const sendMailCount = sendMailCountRes.results?.[0]?.count as number | undefined;
    const userCount = userCountRes.results?.[0]?.count as number | undefined;
    return c.json({
        mailCount,
        addressCount,
        activeAddressCount7days,
        activeAddressCount30days,
        userCount,
        sendMailCount,
    });
};

export default { get };
