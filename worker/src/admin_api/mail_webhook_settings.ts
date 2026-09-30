import { Context } from "hono";
import { CONSTANTS } from '../constants.ts';
import { WebhookSettings, RawMailRow } from '../models/index.ts';
import { commonParseMail, sendWebhook } from '../common.ts';
import { resolveRawEmail } from '../gzip.ts';
import i18n from '../i18n/index.ts';
import { getWebhookAttachments } from '../utils/webhook.ts';

async function getWebhookSettings(c: Context<HonoCustomType>): Promise<Response> {
    const settings = await c.env.KV.get<WebhookSettings>(
        CONSTANTS.WEBHOOK_KV_ADMIN_MAIL_SETTINGS_KEY, "json"
    ) || new WebhookSettings();
    return c.json(settings);
}

async function saveWebhookSettings(c: Context<HonoCustomType>): Promise<Response> {
    const msgs = i18n.getMessagesbyContext(c);
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
    const msgs = i18n.getMessagesbyContext(c);
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
    const mailId = mailRow?.id;
    if (requestedMailId !== undefined && !mailRow) {
        return c.text(msgs.MailNotFoundMsg, 404);
    }
    const raw = mailRow ? await resolveRawEmail(mailRow) : "";
    const parsedEmailContext: ParsedEmailContext = { rawEmail: raw };
    const parsedEmail = await commonParseMail(parsedEmailContext);
    const res = await sendWebhook(settings, {
        attachments: await getWebhookAttachments(c.env, mailRow, parsedEmail?.attachments),
        id: mailId || "0",
        url: c.env.FRONTEND_URL ? `${c.env.FRONTEND_URL}?mail_id=${mailId}` : "",
        from: parsedEmail?.sender || "test@test.com",
        to: "admin@test.com",
        subject: parsedEmail?.subject || "test subject",
        raw: raw || "test raw email",
        parsedText: parsedEmail?.text || "test parsed text",
        parsedHtml: parsedEmail?.html || "test parsed html",
        aiExtract: null,
        aiExtractType: "",
        aiExtractResult: "",
        aiExtractResultText: ""
    });
    if (!res.success) {
        return c.text(res.message || "send webhook error", 400);
    }
    return c.json({ success: true });
}

export default {
    getWebhookSettings,
    saveWebhookSettings,
    testWebhookSettings,
}
