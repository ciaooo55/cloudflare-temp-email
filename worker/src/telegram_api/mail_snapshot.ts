import type { Context } from "hono";
import type { TelegramSettings } from './settings.ts';
import { generateSecureHexToken } from '../utils.ts';
import { commonParseMail } from '../common.ts';

export const DEFAULT_SNAPSHOT_TTL = 86400; // 默认 24h，可在管理后台修改
export const SNAPSHOT_HTML_KV_PREFIX = "mailhtml:";

export type SnapshotBinding = {
    address: string;
    token: string;
    url: string;
    expiresAt: number;
    createdAt: number;
};

/** 永久有效绑定的 expiresAt 哨兵值：2100-01-01T00:00:00Z。所有 `expiresAt <= Date.now()` 的过期检查对它都返回 false。 */
export const SNAPSHOT_BINDING_PERMANENT_MS = 4102444800000;

export function isPermanentSnapshotBinding(expiresAt: number): boolean {
    return expiresAt >= SNAPSHOT_BINDING_PERMANENT_MS;
}

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

// Worker 环境没有 DOM，做正则消毒。快照链接 token 不可猜，但仍需纵深防御。
// 注意：创建时（buildSnapshotHtml）和读取时（/m/:token）都会调用，
// 存量快照（旧版消毒器生成）也能在读取时被新版规则过滤。
export function sanitizeSnapshotHtml(html: string): string {
    let content = html;
    // 1. 删除完整危险块（含内容）
    content = content.replace(/<(script|style|iframe|object|embed|form)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, "");
    // 2. 删除残留的危险开始标签（未闭合/自闭合）；svg/math 是常见 XSS 向量
    //    meta 一并处理，防止 meta refresh 钓鱼跳转（CSP 拦不住 meta refresh）
    content = content.replace(/<(script|style|iframe|object|embed|form|svg|math|meta|link|base)\b[^>]*>?/gi, "");
    // 3. 删除事件属性，兼容 <svg/onload=...> 这类斜杠分隔写法
    // eslint-disable-next-line no-useless-escape
    content = content.replace(/[\s\/]on\w+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, "");
    // 4. 中和 javascript:/vbscript:/data:text/html（含数字实体混淆）
    const deobfuscate = (s: string) => s
        .replace(/&#(\d+);/g, (_, d) => String.fromCharCode(parseInt(d, 10)))
        .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCharCode(parseInt(h, 16)));
    // eslint-disable-next-line no-useless-escape
    content = content.replace(/[\s\/](href|src)\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, (m, attr, val) => {
        const quote = (val[0] === '"' || val[0] === "'") ? val[0] : "";
        const inner = quote ? val.slice(1, -1) : val;
        // eslint-disable-next-line no-control-regex -- 故意剥离控制字符，中和混淆
        const norm = deobfuscate(inner).replace(/[\s\x00-\x1f]+/g, "").toLowerCase();
        if (norm.startsWith("javascript:") || norm.startsWith("vbscript:") || norm.startsWith("data:text/html")) {
            return ` ${attr}="#"`;
        }
        return m;
    });
    return content;
}

export function buildSnapshotHtml(html: string, text: string, subject: string, meta?: { sender?: string; recipient?: string; dateMs?: number }): string {
    let content = sanitizeSnapshotHtml(String(html || ""));
    if (!content) {
        content = `<pre style="white-space:pre-wrap;word-break:break-word;font-family:inherit;margin:0">${escapeHtml(String(text || ""))}</pre>`;
    }
    // 左上邮件元信息：来件邮箱、收件邮箱、中国时间
    let header = "";
    if (meta && (meta.sender || meta.recipient || meta.dateMs)) {
        const timeStr = meta.dateMs
            ? new Date(meta.dateMs).toLocaleString("zh-CN", { timeZone: "Asia/Shanghai", hour12: false })
            : "";
        header = `<div style="background:#f5f7fa;border:1px solid #e1e4e8;border-radius:8px;padding:10px 12px;margin-bottom:16px;font-size:13px;color:#586069;line-height:1.8">`
            + (meta.sender ? `<div>来件邮箱：${escapeHtml(String(meta.sender))}</div>` : "")
            + (meta.recipient ? `<div>收件邮箱：${escapeHtml(String(meta.recipient))}</div>` : "")
            + (timeStr ? `<div>时间：${escapeHtml(timeStr)}</div>` : "")
            + `</div>`;
    }
    return `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(String(subject || "邮件快照"))}</title><style>body{max-width:760px;margin:0 auto;padding:16px;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;font-size:15px;line-height:1.6;color:#222;word-wrap:break-word}img{max-width:100%;height:auto}a{color:#1a73e8}</style></head><body>${header}${content}</body></html>`;
}

export async function createMailSnapshot(c: Context<HonoCustomType>, settings: TelegramSettings | null | undefined, parsedEmailContext: ParsedEmailContext, ttlSeconds: number = DEFAULT_SNAPSHOT_TTL, address?: string): Promise<string | null> {
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
    const token = generateSecureHexToken(32);
    await c.env.KV.put(`${SNAPSHOT_HTML_KV_PREFIX}${token}`, buildSnapshotHtml(parsed.html || "", parsed.text || "", parsed.subject || "", {
        sender: parsed?.sender || "",
        recipient: address || parsedEmailContext.address || "",
        dateMs: Date.now(),
    }), { expirationTtl: ttlSeconds });
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

/**
 * 快照-邮箱绑定：新邮件覆盖写入同一个快照地址。
 * 绑定有效返回快照 URL；绑定不存在或已过期返回 null（过期会自动清理）。
 */
export async function refreshBoundSnapshot(
    c: Context<HonoCustomType>,
    address: string,
    parsedEmailContext: ParsedEmailContext,
    ttlSeconds: number = DEFAULT_SNAPSHOT_TTL
): Promise<string | null> {
    if (!c.env.KV) return null;
    const addr = address.toLowerCase();
    let binding: SnapshotBinding | null = null;
    // 优先读 D1：无 30 秒边缘缓存，建完绑定立即发邮件也能找到；D1 miss 再回退 KV
    if (c.env.DB) {
        try {
            const row = await c.env.DB.prepare(
                "SELECT token, url, expires_at, created_at FROM snapshot_bindings WHERE address = ?"
            ).bind(addr).first<{ token: string; url: string; expires_at: number; created_at: number }>();
            if (row) {
                binding = { address: addr, token: row.token, url: row.url, expiresAt: row.expires_at, createdAt: row.created_at };
            }
        } catch { /* ignore, fallback to KV */ }
    }
    if (!binding) {
        try {
            binding = await c.env.KV.get<SnapshotBinding>(`snapshot-bind:${addr}`, { type: "json", cacheTtl: SNAPSHOT_KV_EDGE_TTL });
        } catch {
            return null;
        }
    }
    if (!binding) return null;
    if (binding.expiresAt <= Date.now()) {
        // 过期：清理绑定与快照（反向索引留删除标记，各 PoP 的旧链接直接 404）
        try {
            await deleteSnapshotBinding(c, addr, binding.token);
        } catch { /* ignore */ }
        return null;
    }
    const parsed = parsedEmailContext.parsedEmail;
    // parsedEmail 可能为空（email/index.ts 里 commonParseMail 失败时不会赋值）：
    // 此时自己解析一次，保证快照一定写入，不静默跳过
    let html = parsed?.html || "";
    let text = parsed?.text || "";
    let subject = parsed?.subject || "";
    if (!html && !text) {
        try {
            const reparsed = await commonParseMail(parsedEmailContext);
            if (reparsed) {
                html = reparsed.html || "";
                text = reparsed.text || "";
                subject = reparsed.subject || subject;
                parsedEmailContext.parsedEmail = reparsed;
            }
        } catch { /* ignore, 下面会直接返回 */ }
    }
    if (!html && !text) return binding.url;
    // 永久绑定：内容 KV 不设过期；普通绑定按剩余时长设置
    const htmlKvOpts = isPermanentSnapshotBinding(binding.expiresAt)
        ? {}
        : { expirationTtl: Math.max(60, Math.floor((binding.expiresAt - Date.now()) / 1000)) };
    const finalParsed = parsedEmailContext.parsedEmail;
    const sender = finalParsed?.sender || "";
    const snapshotHtml = buildSnapshotHtml(html, text, subject, { sender, recipient: addr, dateMs: Date.now() });
    // 绑定快照内容同时写入 D1：KV 读取有 30 秒边缘缓存强制下限，
    // 新邮件到达后 /m/ 必须秒级可见，D1 无此限制。D1 写入失败则删行，
    // 保证 /m/ 回退到 KV（KV 里是新内容，不会读到 D1 的旧行）。
    if (c.env.DB) {
        try {
            await c.env.DB.prepare(
                "INSERT INTO bound_snapshot_html (token, html, updated_at) VALUES (?, ?, ?) " +
                "ON CONFLICT(token) DO UPDATE SET html=excluded.html, updated_at=excluded.updated_at"
            ).bind(binding.token, snapshotHtml, Date.now()).run();
        } catch (e) {
            console.error("bound snapshot D1 write failed", e);
            try {
                await c.env.DB.prepare("DELETE FROM bound_snapshot_html WHERE token = ?").bind(binding.token).run();
            } catch { /* ignore */ }
        }
    }
    try {
        await c.env.KV.put(
            `${SNAPSHOT_HTML_KV_PREFIX}${binding.token}`,
            snapshotHtml,
            htmlKvOpts
        );
        // 内容已更新，清除边缘缓存保证及时刷新（否则 10 秒内看到的还是旧邮件）
        if (binding.url) {
            try {
                await caches.default.delete(new Request(binding.url, { method: 'GET' }));
            } catch { /* ignore */ }
        }
    } catch (e) {
        console.error("refresh bound snapshot failed", e);
        return null;
    }
    return binding.url;
}

export const snapshotBindKey = (address: string) => `snapshot-bind:${address.toLowerCase()}`;
export const snapshotBindRevKey = (token: string) => `snapshot-bindrev:${token}`;
/**
 * 绑定删除标记：deleteSnapshotBinding 不再直接删除反向索引，而是写入该标记（短 TTL）。
 * 原因：/m/:token 路由按 PoP 独立缓存页面，删除时的 caches.default.delete() 到不了
 * 用户所在的 PoP；若反向索引直接消失，路由会把“已删除的绑定 token”当成一次性快照，
 * 继续 serving 边缘缓存里的旧页面。保留删除标记后，各 PoP 看到标记一律直接 404。
 */
export const SNAPSHOT_BIND_DELETED = "__deleted__";
export const SNAPSHOT_BIND_TOMBSTONE_TTL = 120;
/** 快照相关 KV 读取的边缘缓存 TTL（秒）：KV.get 默认边缘缓存 60 秒，
 * 会导致更换链接/新邮件最多延迟 60 秒才可见；取文档允许的最小值 30。 */
export const SNAPSHOT_KV_EDGE_TTL = 30;

/** 读取邮箱的固定快照绑定；过期则清理并返回 null */
export async function getSnapshotBinding(c: Context<HonoCustomType>, address: string): Promise<SnapshotBinding | null> {
    if (!c.env.KV) return null;
    // 优先读 D1（无边缘缓存），通知里的链接一定是最新；D1 miss 回退 KV
    if (c.env.DB) {
        try {
            const row = await c.env.DB.prepare(
                "SELECT token, url, expires_at, created_at FROM snapshot_bindings WHERE address = ?"
            ).bind(address.toLowerCase()).first<{ token: string; url: string; expires_at: number; created_at: number }>();
            if (row) {
                const binding: SnapshotBinding = { address: address.toLowerCase(), token: row.token, url: row.url, expiresAt: row.expires_at, createdAt: row.created_at };
                if (binding.expiresAt <= Date.now()) {
                    await deleteSnapshotBinding(c, address, binding.token).catch(() => {});
                    return null;
                }
                return binding;
            }
        } catch { /* ignore, fallback to KV */ }
    }
    try {
        const binding = await c.env.KV.get<SnapshotBinding>(snapshotBindKey(address), { type: "json", cacheTtl: SNAPSHOT_KV_EDGE_TTL });
        if (!binding) return null;
        if (binding.expiresAt <= Date.now()) {
            await deleteSnapshotBinding(c, address, binding.token).catch(() => {});
            return null;
        }
        return binding;
    } catch {
        return null;
    }
}

/** 删除绑定：正向绑定 + 快照 HTML 删除，反向索引写入删除标记（短 TTL，见上）。
 * 更换/失效链接后，旧 token 在各 PoP 一律 404，不会再命中边缘缓存里的旧页面。 */
export async function deleteSnapshotBinding(c: Context<HonoCustomType>, address: string, token?: string): Promise<void> {
    if (!c.env.KV) return;
    // 需要 binding.url 来清除边缘缓存：token 直传时先经反向索引找到地址再读 binding
    let binding: SnapshotBinding | null = null;
    if (token) {
        try {
            const addr = await c.env.KV.get(snapshotBindRevKey(token), { cacheTtl: SNAPSHOT_KV_EDGE_TTL });
            if (addr && addr !== SNAPSHOT_BIND_DELETED) binding = await c.env.KV.get<SnapshotBinding>(snapshotBindKey(addr), { type: "json", cacheTtl: SNAPSHOT_KV_EDGE_TTL });
        } catch { /* ignore */ }
    } else {
        try {
            binding = await c.env.KV.get<SnapshotBinding>(snapshotBindKey(address), { type: "json", cacheTtl: SNAPSHOT_KV_EDGE_TTL });
        } catch { /* ignore */ }
    }
    const t = token || binding?.token;
    // D1 中的绑定快照内容一并清理，避免 /m/ 从 D1 读到已删除绑定的旧内容
    if (t && c.env.DB) {
        try {
            await c.env.DB.prepare("DELETE FROM bound_snapshot_html WHERE token = ?").bind(t).run();
        } catch { /* ignore */ }
    }
    // D1 绑定元数据也删
    if (c.env.DB) {
        try {
            await c.env.DB.prepare("DELETE FROM snapshot_bindings WHERE address = ?").bind(address.toLowerCase()).run();
        } catch { /* ignore */ }
    }
    await Promise.allSettled([
        c.env.KV.delete(snapshotBindKey(address)),
        t ? c.env.KV.put(snapshotBindRevKey(t), SNAPSHOT_BIND_DELETED, { expirationTtl: SNAPSHOT_BIND_TOMBSTONE_TTL }) : Promise.resolve(),
        t ? c.env.KV.delete(`${SNAPSHOT_HTML_KV_PREFIX}${t}`) : Promise.resolve(),
    ]);
    // 清除边缘缓存，保证旧链接立即失效（防刷缓存不影响删除语义）
    if (binding?.url) {
        try {
            await caches.default.delete(new Request(binding.url, { method: 'GET' }));
        } catch { /* ignore */ }
    }
}

/** 列出全部有效绑定；顺手清理过期项 */
export async function listSnapshotBindingRecords(c: Context<HonoCustomType>): Promise<SnapshotBinding[]> {
    if (!c.env.KV) return [];
    const { keys } = await c.env.KV.list({ prefix: "snapshot-bind:" });
    const bindings: SnapshotBinding[] = [];
    for (const k of keys) {
        const b = await c.env.KV.get<SnapshotBinding>(k.name, "json");
        if (!b) continue;
        if (b.expiresAt <= Date.now()) {
            await deleteSnapshotBinding(c, b.address, b.token).catch(() => {});
            continue;
        }
        bindings.push(b);
    }
    bindings.sort((a, b) => b.createdAt - a.createdAt);
    return bindings;
}

/**
 * 创建固定快照绑定：同一邮箱重新绑定时先销毁旧绑定，保证旧链接立即失效；
 * 占位 HTML 按绑定时长存活（不是普通快照 TTL）。
 */
export async function createSnapshotBindingRecord(
    c: Context<HonoCustomType>,
    address: string,
    hours: number,
    origin: string
): Promise<SnapshotBinding> {
    const addr = address.trim().toLowerCase();
    const token = generateSecureHexToken(32);
    const now = Date.now();
    // hours <= 0 表示永久有效：KV 不设过期（key 一直存活到手动删除），expiresAt 用哨兵值
    const permanent = hours <= 0;
    const binding: SnapshotBinding = {
        address: addr, token,
        url: `${origin}/m/${token}`,
        expiresAt: permanent ? SNAPSHOT_BINDING_PERMANENT_MS : now + hours * 3600 * 1000,
        createdAt: now,
    };
    // 重新绑定：先销毁旧绑定，保证旧链接立即失效
    // 优先从 D1 读旧 token（无边缘缓存），D1 miss 才回退 KV
    try {
        let oldToken: string | null = null;
        if (c.env.DB) {
            try {
                const row = await c.env.DB.prepare(
                    "SELECT token FROM snapshot_bindings WHERE address = ?"
                ).bind(addr).first<{ token: string }>();
                if (row?.token) oldToken = row.token;
            } catch { /* ignore, fallback to KV */ }
        }
        if (!oldToken) {
            const oldBinding = await c.env.KV.get<SnapshotBinding>(snapshotBindKey(addr), { type: "json" });
            if (oldBinding?.token) oldToken = oldBinding.token;
        }
        if (oldToken) {
            await deleteSnapshotBinding(c, addr, oldToken).catch(() => {});
        } else {
            await deleteSnapshotBinding(c, addr).catch(() => {});
        }
    } catch {
        await deleteSnapshotBinding(c, addr).catch(() => {});
    }
    const expiration = Math.floor(binding.expiresAt / 1000);
    // 永久有效：KV 不设过期时间，key 存活到手动删除为止
    const kvOpts = permanent ? {} : { expiration };
    const htmlOpts = permanent ? {} : { expirationTtl: hours * 3600 };
    await Promise.all([
        c.env.KV.put(snapshotBindKey(addr), JSON.stringify(binding), kvOpts),
        c.env.KV.put(snapshotBindRevKey(token), addr, kvOpts),
        c.env.KV.put(`${SNAPSHOT_HTML_KV_PREFIX}${token}`,
            buildSnapshotHtml("", `该快照已绑定 ${addr}，等待第一封新邮件到达后显示最新内容。`, "快照已绑定"),
            htmlOpts),
    ]);
    // D1 也写一份：refreshBoundSnapshot 优先读 D1（无 30 秒边缘缓存），建完立即发邮件也能找到绑定
    if (c.env.DB) {
        try {
            await c.env.DB.prepare(
                "INSERT INTO snapshot_bindings (address, token, url, expires_at, created_at) VALUES (?, ?, ?, ?, ?) " +
                "ON CONFLICT(address) DO UPDATE SET token=excluded.token, url=excluded.url, expires_at=excluded.expires_at, created_at=excluded.created_at"
            ).bind(addr, token, binding.url, binding.expiresAt, binding.createdAt).run();
        } catch { /* ignore, KV 为主 */ }
    }
    return binding;
}

/**
 * 只调整绑定有效期，不更换 token/链接。
 * hours <= 0 表示改为永久有效。绑定不存在或已过期返回 null。
 */
export async function updateSnapshotBindingExpiry(
    c: Context<HonoCustomType>,
    address: string,
    hours: number
): Promise<SnapshotBinding | null> {
    const addr = address.trim().toLowerCase();
    // 先读现有绑定（D1 优先，KV 回退），不存在或已过期则不处理
    let binding: SnapshotBinding | null = null;
    if (c.env.DB) {
        try {
            const row = await c.env.DB.prepare(
                "SELECT token, url, expires_at, created_at FROM snapshot_bindings WHERE address = ?"
            ).bind(addr).first<{ token: string; url: string; expires_at: number; created_at: number }>();
            if (row) binding = { address: addr, token: row.token, url: row.url, expiresAt: row.expires_at, createdAt: row.created_at };
        } catch { /* ignore, fallback to KV */ }
    }
    if (!binding) {
        try {
            binding = await c.env.KV.get<SnapshotBinding>(snapshotBindKey(addr), { type: "json" });
        } catch { /* ignore */ }
    }
    if (!binding || binding.expiresAt <= Date.now()) return null;
    const permanent = hours <= 0;
    binding.expiresAt = permanent ? SNAPSHOT_BINDING_PERMANENT_MS : Date.now() + hours * 3600 * 1000;
    const kvOpts = permanent ? {} : { expiration: Math.floor(binding.expiresAt / 1000) };
    await Promise.all([
        c.env.KV.put(snapshotBindKey(addr), JSON.stringify(binding), kvOpts),
        c.env.KV.put(snapshotBindRevKey(binding.token), addr, kvOpts),
    ]);
    if (c.env.DB) {
        try {
            await c.env.DB.prepare(
                "UPDATE snapshot_bindings SET expires_at = ? WHERE address = ?"
            ).bind(binding.expiresAt, addr).run();
        } catch { /* ignore, KV 为主 */ }
    }
    return binding;
}
