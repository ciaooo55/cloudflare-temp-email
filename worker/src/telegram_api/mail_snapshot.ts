import type { Context } from "hono";
import type { TelegramSettings } from "./settings";

const SNAPSHOT_TTL = 86400;

export type VerificationInfo = { isVerification: boolean; code: string | null; verifyLink?: string | null };

const VERIFICATION_KEYWORDS = "验证码|驗證碼|校验码|校驗碼|动态码|動態碼|认证码|認證碼|确认码|確認碼|安全码|安全碼|認証コード|確認コード|confirmation\\s*code|login\\s*code|verification\\s*code|security\\s*code|auth(?:entication)?\\s*code|one[- ]time\\s*(?:code|password)|OTP|passcode|password\\s*reset\\s*code|one[- ]time\\s*pin|(?:2fa|two[- ]factor(?:\\s*authentication)?)\\s*code|apple\\s*id\\s*code|apple\\s*id\\s*代码|(?:whatsapp|instagram|facebook)\\s*code|一次性密码|一次性密碼|动态密码|動態密碼|动态口令|動態口令";

function normalizeVerificationText(value: string): string {
    return value
        .replace(/&#(?:(\d+)|[xX]([0-9a-fA-F]+));?/g, (match, decimal, hexadecimal) => {
            const codePoint = decimal ? Number(decimal) : parseInt(hexadecimal, 16);
            return codePoint >= 32 && codePoint <= 0x10ffff ? String.fromCodePoint(codePoint) : match;
        })
        .replace(/[０-９]/g, digit => String.fromCharCode(digit.charCodeAt(0) - 0xff10 + 0x30))
        .replace(/[٠-٩]/g, digit => String.fromCharCode(digit.charCodeAt(0) - 0x660 + 0x30))
        .replace(/[۰-۹]/g, digit => String.fromCharCode(digit.charCodeAt(0) - 0x6f0 + 0x30))
        .replace(/\b(\d(?:\s\d){3,9})\b/g, value => value.replace(/\s+/g, ""))
        .replace(/\b(\d{3}) (\d{3})\b/g, "$1$2")
        .replace(/\b(\d{4}) (\d{4})\b/g, "$1$2")
        .replace(/\b(\d{3})-(\d{3})\b/g, "$1$2");
}

export function extractVerificationCode(text: string): VerificationInfo {
    const plain = normalizeVerificationText(String(text || "").replace(/<[^>]*>/g, " "));
    if (!new RegExp(`(?:${VERIFICATION_KEYWORDS})`, "i").test(plain)) {
        return { isVerification: false, code: null };
    }
    const beforeKeyword = new RegExp(`(?:${VERIFICATION_KEYWORDS})(?:[^A-Za-z0-9]|\\bis\\b|\\bare\\b){0,30}(?:G-|FB-)?([A-Za-z0-9]{4,10})(?![A-Za-z0-9])`, "gi");
    let match: RegExpExecArray | null;
    while ((match = beforeKeyword.exec(plain))) {
        if (/\d/.test(match[1])) return { isVerification: true, code: match[1] };
        beforeKeyword.lastIndex = match.index + 1;
    }
    const afterPunctuation = new RegExp(`(?:${VERIFICATION_KEYWORDS})[\\s\\S]{0,60}?(?:\\bis\\b|\\bare\\b|[:：])\\s*(?:G-|FB-)?([A-Za-z0-9]{4,10})(?![A-Za-z0-9])`, "gi");
    while ((match = afterPunctuation.exec(plain))) {
        if (/\d/.test(match[1])) return { isVerification: true, code: match[1] };
        afterPunctuation.lastIndex = match.index + 1;
    }
    const afterKeyword = new RegExp(`([A-Za-z0-9]{4,10})[^A-Za-z0-9]{0,30}(?:${VERIFICATION_KEYWORDS})(?![A-Za-z0-9])`, "gi");
    while ((match = afterKeyword.exec(plain))) {
        if (/\d/.test(match[1])) return { isVerification: true, code: match[1] };
        afterKeyword.lastIndex = match.index + 1;
    }
    const isYourCode = new RegExp(`([A-Za-z0-9]{4,10})(?![A-Za-z0-9])\\s+is\\s+your\\s+(?:[A-Za-z]+\\s+){0,2}(?:${VERIFICATION_KEYWORDS})(?![A-Za-z0-9])`, "gi");
    while ((match = isYourCode.exec(plain))) {
        if (/\d/.test(match[1])) return { isVerification: true, code: match[1] };
        isYourCode.lastIndex = match.index + 1;
    }
    return { isVerification: true, code: null };
}

export function extractVerificationLink(html: string, text: string): string | null {
    const excluded = /(unsub|optout|退訂|退订|preference)/i;
    const linkKeyword = /(verif|confirm|activate|验证|驗證|确认|確認|激活|auth|token|otp)/i;
    const links: { url: string; anchor: string }[] = [];
    for (const match of String(html || "").matchAll(/<a\b[^>]*href\s*=\s*["']([^"']+)["'][^>]*>([\s\S]{0,200}?)<\/a\s*>/gi)) {
        links.push({ url: match[1], anchor: match[2].replace(/<[^>]*>/g, " ") });
        if (links.length >= 60) break;
    }
    const candidate = links.find(link => /^https?:\/\//i.test(link.url) && !excluded.test(link.url) && (linkKeyword.test(link.url) || linkKeyword.test(link.anchor)));
    if (candidate) return candidate.url;
    for (const match of String(text || "").matchAll(/https?:\/\/[^\s<>"']+/gi)) {
        const url = match[0].replace(/[.,;!?)\]]+$/, "");
        if (!excluded.test(url) && linkKeyword.test(url)) return url;
    }
    return null;
}

export function extractVerificationCodeWithSubject(subject: string, body: string, html: string, text: string): VerificationInfo {
    const info = extractVerificationCode(subject ? `${subject}\n${body}` : body);
    if (info.isVerification && !info.code) info.verifyLink = extractVerificationLink(html, text);
    return info;
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
    for (const value of [c.env.SNAPSHOT_BASE_URL, settings?.miniAppUrl]) {
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
        } else if (info.codeInfo.verifyLink) {
            text += info.chinese ? "\n🔗 验证链接\n" : "\n🔗 Verification link\n";
            const offset = text.length;
            text += info.codeInfo.verifyLink;
            entities.push({ type: "url", offset, length: info.codeInfo.verifyLink.length });
        } else {
            text += info.chinese ? "⚠️ 未能自动识别，请点击下方链接查看" : "⚠️ Could not auto-detect, please open the link below";
        }
    }
    text += info.chinese ? "\n\n🔗 查看完整邮件\n" : "\n\n🔗 View full mail\n";
    const offset = text.length;
    text += info.snapshotUrl;
    entities.push({ type: "url", offset, length: info.snapshotUrl.length });
    text += "\n\n🐶🐶🐶🐶🐶🐶🐶🐶";
    return { text, entities };
}
