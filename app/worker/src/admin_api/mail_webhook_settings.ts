import { Context } from "hono";
import { CONSTANTS } from '../constants.ts';
import { WebhookSettings, RawMailRow } from '../models/index.ts';
import i18n from '../i18n/index.ts';
import { sendTestWebhook } from '../utils/webhook.ts';

async function getWebhookSettings(c: Context<HonoCustomType>): Promise<Response> {
    const settings = await c.env.KV.get<WebhookSettings>(
        CONSTANTS.WEBHOOK_KV_ADMIN_MAIL_SETTINGS_KEY, "json"
    ) || new WebhookSettings();
    return c.json(settings);
}

async function saveWebhookSettings(c: Context<HonoCustomType>): Promise<Response> {
    const msgs = i18n.getMessagesByContext(c);
    const settings = await c.req.json<WebhookSettings>().catch(() => null);
    if (!settings || typeof settings !== "object" || Array.isArray(settings)) {
        return c.text(msgs.InvalidRequestBodyMsg, 400);
    }
    // headers 存的是 JSON 字符串：保存时就校验，配错了立刻报错，
    // 避免之后每封邮件的 webhook 都因解析失败而静默丢失
    if (typeof settings.headers === "string" && settings.headers.trim()) {
        try {
            const parsed = JSON.parse(settings.headers);
            if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
                return c.text("headers must be a JSON object", 400);
            }
        } catch {
            return c.text("headers is not valid JSON", 400);
        }
    }
    await c.env.KV.put(
        CONSTANTS.WEBHOOK_KV_ADMIN_MAIL_SETTINGS_KEY,
        JSON.stringify(settings));
    return c.json({ success: true })
}

async function testWebhookSettings(c: Context<HonoCustomType>): Promise<Response> {
    const msgs = i18n.getMessagesByContext(c);
    const settings = await c.req.json<WebhookSettings & { mail_id?: number }>().catch(() => null);
    if (!settings || typeof settings !== "object" || Array.isArray(settings)) {
        return c.text(msgs.InvalidRequestBodyMsg, 400);
    }
    const requestedMailId = settings.mail_id;
    if (requestedMailId !== undefined && (!Number.isSafeInteger(requestedMailId) || requestedMailId <= 0)) {
        return c.text(msgs.InvalidMailIdMsg, 400);
    }
    const mailRow = requestedMailId !== undefined ? await c.env.DB.prepare(
        `SELECT * FROM raw_mails WHERE id = ?`
    ).bind(requestedMailId).first<RawMailRow>() : await c.env.DB.prepare(
        `SELECT * FROM raw_mails ORDER BY RANDOM() LIMIT 1`
    ).first<RawMailRow>();
    if (requestedMailId !== undefined && !mailRow) {
        return c.text(msgs.MailNotFoundMsg, 404);
    }
    const err = await sendTestWebhook(c, settings, mailRow, "admin@test.com");
    if (err) return err;
    return c.json({ success: true });
}

export default {
    getWebhookSettings,
    saveWebhookSettings,
    testWebhookSettings,
}
