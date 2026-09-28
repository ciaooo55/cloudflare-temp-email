import type { Context } from "hono";
import type { TelegramSettings } from "./settings";

const SNAPSHOT_TTL = 86400;
const ILINK_API = "https://ilinkai.weixin.qq.com";

export type VerificationInfo = { isVerification: boolean; code: string | null };

const VERIFICATION_KEYWORDS = "验证码|驗證碼|校验码|校驗碼|动态码|動態碼|认证码|認證碼|認証コード|確認コード|verification\\s*code|security\\s*code|auth(?:entication)?\\s*code|one[- ]time\\s*(?:code|password)|OTP|passcode";

export function extractVerificationCode(text: string): VerificationInfo {
    const plain = String(text || "").replace(/<[^>]*>/g, " ");
    if (!new RegExp(`(?:${VERIFICATION_KEYWORDS})`, "i").test(plain)) {
        return { isVerification: false, code: null };
    }
    const match = new RegExp(`(?:${VERIFICATION_KEYWORDS})[^A-Za-z0-9]{0,30}([A-Za-z0-9]{4,10})(?![A-Za-z0-9])`, "i").exec(plain);
    const code = match?.[1] && /\d/.test(match[1]) ? match[1] : null;
    return { isVerification: true, code };
}

function escapeHtml(value: string): string {
    return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export function buildSnapshotHtml(html: string, text: string, subject: string): string {
    let content = String(html || "")
        .replace(/<(script|style|iframe|object|embed|form)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, "")
        .replace(/\son\w+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, "")
        .replace(/\s(?:href|src)\s*=\s*(?:"\s*(?:javascript|vbscript):[^"]*"|'\s*(?:javascript|vbscript):[^']*'|\s*(?:javascript|vbscript):[^\s>]+)/gi, " href=\"#\"");
    if (!content) {
        content = `<pre style="white-space:pre-wrap;word-break:break-word;font-family:inherit;margin:0">${escapeHtml(String(text || ""))}</pre>`;
    }
    return `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(String(subject || "邮件快照"))}</title><style>body{max-width:760px;margin:0 auto;padding:16px;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;font-size:15px;line-height:1.6;color:#222;word-wrap:break-word}img{max-width:100%;height:auto}a{color:#1a73e8}</style></head><body>${content}</body></html>`;
}

export async function createMailSnapshot(c: Context<HonoCustomType>, settings: TelegramSettings | null | undefined, parsedEmailContext: ParsedEmailContext): Promise<string | null> {
    if (!c.env.KV) return null;
    const parsed = parsedEmailContext.parsedEmail;
    if (!parsed || (!parsed.html && !parsed.text)) return null;
    let origin = "";
    for (const value of [settings?.miniAppUrl, c.env.SNAPSHOT_BASE_URL]) {
        try {
            if (value) {
                origin = new URL(value).origin;
                if (origin) break;
            }
        } catch { /* invalid optional URL */ }
    }
    if (!origin) return null;
    const bytes = new Uint8Array(32);
    crypto.getRandomValues(bytes);
    const token = [...bytes].map(byte => byte.toString(16).padStart(2, "0")).join("");
    await c.env.KV.put(`mailhtml:${token}`, buildSnapshotHtml(parsed.html || "", parsed.text || "", parsed.subject || ""), { expirationTtl: SNAPSHOT_TTL });
    return `${origin}/m/${token}`;
}

export function buildCompactMailMessage(info: {
    chinese: boolean; subject: string; address: string; sender: string; createdAt: string; codeInfo: VerificationInfo; snapshotUrl: string;
}): { text: string; entities: { type: "url" | "pre"; offset: number; length: number }[] } {
    const lines = info.chinese
        ? ["📩 新邮件", "━━━━━━━━━━━━━━", `主题：${info.subject || "（无主题）"}`, `收件：${info.address}`, `发件：${info.sender || "未知"}`, `时间：${info.createdAt}`]
        : ["📩 New mail", `Subject: ${info.subject || "(no subject)"}`, `To: ${info.address}`, `From: ${info.sender || "unknown"}`, `Date: ${info.createdAt}`];
    let text = lines.join("\n");
    const entities: { type: "url" | "pre"; offset: number; length: number }[] = [];
    if (info.codeInfo.isVerification) {
        text += info.chinese ? "\n\n🔐 验证码\n" : "\n\n🔐 Verification code\n";
        if (info.codeInfo.code) {
            const offset = text.length;
            text += info.codeInfo.code;
            entities.push({ type: "pre", offset, length: info.codeInfo.code.length });
            text += info.chinese ? "\n👆 点按上方代码即可复制" : "\n👆 Tap the code above to copy";
        } else {
            text += info.chinese ? "⚠️ 未能自动识别，请点击下方链接查看" : "⚠️ Could not auto-detect, please open the link below";
        }
    }
    text += info.chinese ? "\n\n🔗 查看完整邮件\n" : "\n\n🔗 View full mail\n";
    const offset = text.length;
    text += info.snapshotUrl;
    entities.push({ type: "url", offset, length: info.snapshotUrl.length });
    return { text, entities };
}

export function buildWeChatMailText(info: { subject: string; address: string; sender: string; createdAt: string; codeInfo: VerificationInfo; snapshotUrl: string }): string {
    const lines = ["📩 新邮件", "━━━━━━━━━━━━━━", `主题：${info.subject || "（无主题）"}`, `收件：${info.address}`, `发件：${info.sender || "未知"}`, `时间：${info.createdAt}`];
    let text = lines.join("\n");
    if (info.codeInfo.isVerification) {
        text += `\n\n🔐 验证码\n${info.codeInfo.code ? `${info.codeInfo.code}\n（长按复制）` : "⚠️ 未能自动识别，请点击下方链接查看"}`;
    }
    return `${text}\n\n🔗 查看完整邮件：\n${info.snapshotUrl}`;
}

export async function pushWeChatMail(c: Context<HonoCustomType>, info: Parameters<typeof buildWeChatMailText>[0]): Promise<void> {
    const config = await c.env.KV?.get<{ botToken?: string; toUserId?: string; contextToken?: string }>("ilink:config", "json");
    if (!config?.botToken || !config.toUserId || !config.contextToken) return;
    const bytes = new Uint8Array(4);
    crypto.getRandomValues(bytes);
    const uin = btoa(String((bytes[0] * 16777216 + bytes[1] * 65536 + bytes[2] * 256 + bytes[3]) >>> 0));
    const send = async (contextToken: string | null) => {
        const response = await fetch(`${ILINK_API}/ilink/bot/sendmessage`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json", AuthorizationType: "ilink_bot_token",
                Authorization: `Bearer ${config.botToken}`, "X-WECHAT-UIN": uin,
                "iLink-App-Id": "bot", "iLink-App-ClientVersion": "131328"
            },
            body: JSON.stringify({ msg: {
                from_user_id: "", to_user_id: config.toUserId, client_id: `cfmail-${Date.now()}`,
                message_type: 2, message_state: 2, context_token: contextToken,
                item_list: [{ type: 1, text_item: { text: buildWeChatMailText(info) } }]
            }, base_info: { channel_version: "1.0.3" } })
        });
        return response.json<{ message_id?: string }>();
    };
    let result = await send(config.contextToken);
    if (!result.message_id) result = await send(null);
    if (!result.message_id) throw new Error("iLink sendmessage failed");
}
