import { Context } from 'hono'

const get = async (c: Context<HonoCustomType>) => {
    const [
        mailCountRes,
        addressCountRes,
        sendMailCountRes,
    ] = await c.env.DB.batch([
        c.env.DB.prepare(`SELECT count(*) as count FROM raw_mails`),
        c.env.DB.prepare(`SELECT count(*) as count FROM (SELECT name FROM address UNION SELECT address FROM raw_mails UNION SELECT address FROM sendbox)`),
        c.env.DB.prepare(`SELECT count(*) as count FROM sendbox`),
    ]);
    const mailCount = mailCountRes.results?.[0]?.count as number | undefined;
    const addressCount = addressCountRes.results?.[0]?.count as number | undefined;
    const sendMailCount = sendMailCountRes.results?.[0]?.count as number | undefined;
    return c.json({
        mailCount,
        addressCount,
        sendMailCount,
    });
};

export default { get };
