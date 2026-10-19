import { Context } from "hono";
import { CONSTANTS } from '../constants.ts';
import { getDomains, getJsonSetting, isDomainOrSubdomain, saveSetting, generateSecureHexToken } from '../utils.ts';
import {
    createSnapshotBindingRecord,
    deleteSnapshotBinding,
    listSnapshotBindingRecords,
    snapshotBindKey,
    updateSnapshotBindingExpiry,
} from '../telegram_api/mail_snapshot.ts';
import type { SnapshotBinding } from '../telegram_api/mail_snapshot.ts';

export type TelegramBotEntry = {
    id: string;
    name: string;
    token: string;
    enabled: boolean;
    createdAt: string;
    /** 用户ID白名单（逗号分隔），留空表示不限制 */
    allowedChatIds?: string;
    /** 群组ID白名单（逗号分隔），留空表示不限制 */
    allowedGroupIds?: string;
    /** Telegram webhook secret_token，用于验证回调请求确实来自 Telegram */
    webhookSecret?: string;
};

export type BarkDeviceEntry = {
    id: string;
    name: string;
    keys: string;
    enabled: boolean;
};

export type BarkSettings = {
    devices: BarkDeviceEntry[];
    pushUrl: string;
};

export type SnapshotSettings = {
    ttlHours: number;
    /**
     * 绑定快照边缘缓存开关：默认关闭。
     * 关闭 = 每次打开都实时读取最新内容（新邮件秒级可见，更换链接秒级失效）；
     * 开启 = 按 boundCacheTtl 缓存（省额度、抗刷，但新邮件最多延迟所选时长）。
     */
    boundCacheEnabled?: boolean;
    /** 绑定快照边缘缓存时长（秒），前端提供 10/30/60/300 四档 */
    boundCacheTtl?: number;
};

export type { SnapshotBinding } from '../telegram_api/mail_snapshot.ts';

export const DEFAULT_BARK_PUSH_URL = "https://bark.ciaooo55.us.ci/push";
export const DEFAULT_SNAPSHOT_TTL_HOURS = 24;
/** 绑定快照边缘缓存默认关闭；开启时默认 10 秒 */
export const DEFAULT_BOUND_CACHE_ENABLED = false;
export const DEFAULT_BOUND_CACHE_TTL = 10;
/** 前端时间挡位（秒）：10秒 / 30秒 / 1分钟 / 5分钟 */
export const BOUND_CACHE_TTL_PRESETS = [10, 30, 60, 300];

const newId = () => generateSecureHexToken(8);

const maskTelegramToken = (token: string) => {
    const idx = token.indexOf(":");
    return idx > 0 ? `${token.slice(0, idx)}:***` : "***";
};

const maskBarkKeys = (keys: string) => {
    return keys.split(",").map(k => {
        const t = k.trim();
        return t.length > 4 ? `***${t.slice(-4)}` : "***";
    }).filter(Boolean).join(",");
};

async function listTelegramBots(c: Context<HonoCustomType>): Promise<Response> {
    const bots = await getJsonSetting<TelegramBotEntry[]>(c, CONSTANTS.TELEGRAM_BOTS_KEY) || [];
    const result = bots.map(b => ({
        id: b.id, name: b.name, enabled: b.enabled,
        createdAt: b.createdAt, maskedToken: maskTelegramToken(b.token || ""),
        allowedChatIds: b.allowedChatIds || "",
        allowedGroupIds: b.allowedGroupIds || "",
    }));
    // 若 KV 里没有配置，但系统已有默认配置，则显示默认的（脱敏）
    if (!result.length && c.env.TELEGRAM_BOT_TOKEN) {
        result.push({
            id: "env", name: "系统默认推送", enabled: true,
            createdAt: Date.now(), maskedToken: maskTelegramToken(c.env.TELEGRAM_BOT_TOKEN),
            allowedChatIds: "",
            allowedGroupIds: "",
        });
    }
    return c.json(result);
}

async function createTelegramBot(c: Context<HonoCustomType>): Promise<Response> {
    const { name, token, allowedChatIds, allowedGroupIds } = await c.req.json<{
        name?: string; token?: string; allowedChatIds?: string; allowedGroupIds?: string;
    }>();
    if (!token || !token.trim()) {
        return c.json({ error: "token is required" }, 400);
    }
    const bots = await getJsonSetting<TelegramBotEntry[]>(c, CONSTANTS.TELEGRAM_BOTS_KEY) || [];
    const entry: TelegramBotEntry = {
        id: newId(),
        name: (name || "").trim() || `bot-${bots.length + 1}`,
        token: token.trim(),
        enabled: true,
        createdAt: new Date().toISOString(),
        allowedChatIds: (allowedChatIds || "").trim(),
        allowedGroupIds: (allowedGroupIds || "").trim(),
    };
    bots.push(entry);
    await saveSetting(c, CONSTANTS.TELEGRAM_BOTS_KEY, JSON.stringify(bots));
    return c.json({ success: true, id: entry.id });
}

async function updateTelegramBot(c: Context<HonoCustomType>): Promise<Response> {
    const id = c.req.param("id") || "";
    const { name, token, enabled, allowedChatIds, allowedGroupIds } = await c.req.json<{
        name?: string; token?: string; enabled?: boolean; allowedChatIds?: string; allowedGroupIds?: string;
    }>();
    const bots = await getJsonSetting<TelegramBotEntry[]>(c, CONSTANTS.TELEGRAM_BOTS_KEY) || [];
    const bot = bots.find(b => b.id === id);
    if (!bot) return c.json({ error: "bot not found" }, 404);
    if (typeof name === "string" && name.trim()) bot.name = name.trim();
    if (typeof token === "string" && token.trim()) bot.token = token.trim();
    if (typeof enabled === "boolean") bot.enabled = enabled;
    if (typeof allowedChatIds === "string") bot.allowedChatIds = allowedChatIds.trim();
    if (typeof allowedGroupIds === "string") bot.allowedGroupIds = allowedGroupIds.trim();
    await saveSetting(c, CONSTANTS.TELEGRAM_BOTS_KEY, JSON.stringify(bots));
    return c.json({ success: true });
}

async function deleteTelegramBot(c: Context<HonoCustomType>): Promise<Response> {
    const id = c.req.param("id") || "";
    const bots = await getJsonSetting<TelegramBotEntry[]>(c, CONSTANTS.TELEGRAM_BOTS_KEY) || [];
    const next = bots.filter(b => b.id !== id);
    if (next.length === bots.length) return c.json({ error: "bot not found" }, 404);
    await saveSetting(c, CONSTANTS.TELEGRAM_BOTS_KEY, JSON.stringify(next));
    return c.json({ success: true });
}

async function findBot(c: Context<HonoCustomType>, id: string): Promise<TelegramBotEntry | null> {
    const bots = await getJsonSetting<TelegramBotEntry[]>(c, CONSTANTS.TELEGRAM_BOTS_KEY) || [];
    const found = bots.find(b => b.id === id);
    if (found) return found;
    // 系统默认配置（环境变量）
    if (id === "env" && c.env.TELEGRAM_BOT_TOKEN) {
        return {
            id: "env", name: "系统默认推送", enabled: true,
            token: c.env.TELEGRAM_BOT_TOKEN, createdAt: Date.now(),
        };
    }
    return null;
}

async function testTelegramBot(c: Context<HonoCustomType>): Promise<Response> {
    const id = c.req.param("id") || "";
    const { chatId } = await c.req.json<{ chatId?: string }>().catch(() => ({} as { chatId?: string }));
    const bot = await findBot(c, id);
    if (!bot) return c.json({ ok: false, error: "bot not found" }, 404);
    try {
        const meRes = await fetch(`https://api.telegram.org/bot${bot.token}/getMe`);
        const meJson = await meRes.json<{ ok: boolean; result?: { username?: string }; description?: string }>().catch(() => null);
        if (!meRes.ok || !meJson?.ok) {
            return c.json({ ok: false, error: meJson?.description || `getMe failed: ${meRes.status}` });
        }
        const username = meJson.result?.username || "";
        let messageSent = false;
        if (chatId && String(chatId).trim()) {
            const sendRes = await fetch(`https://api.telegram.org/bot${bot.token}/sendMessage`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    chat_id: String(chatId).trim(),
                    text: `✅ 测试推送成功\nbot: @${username}\n时间: ${new Date().toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" })}`,
                }),
            });
            const sendJson = await sendRes.json<{ ok: boolean; description?: string }>().catch(() => null);
            if (!sendRes.ok || !sendJson?.ok) {
                return c.json({ ok: false, username, error: `token 有效，但发送测试消息失败: ${sendJson?.description || sendRes.status}` });
            }
            messageSent = true;
        }
        return c.json({ ok: true, username, messageSent });
    } catch (e) {
        return c.json({ ok: false, error: `请求 Telegram 失败: ${(e as Error).message}` });
    }
}

async function setTelegramBotWebhook(c: Context<HonoCustomType>): Promise<Response> {
    const id = c.req.param("id") || "";
    const bot = await findBot(c, id);
    if (!bot) return c.json({ ok: false, error: "bot not found" }, 404);
    try {
        // Security: generate a secret token for webhook verification
        // Telegram will send it in X-Telegram-Bot-Api-Secret-Token header
        const webhookSecret = generateSecureHexToken(32);
        const webhookUrl = `https://${new URL(c.req.url).host}/telegram/webhook/${id}`;
        const res = await fetch(`https://api.telegram.org/bot${bot.token}/setWebhook`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ url: webhookUrl, secret_token: webhookSecret }),
        });
        const json = await res.json<{ ok: boolean; description?: string }>().catch(() => null);
        if (!res.ok || !json?.ok) {
            return c.json({ ok: false, error: json?.description || `setWebhook failed: ${res.status}` });
        }
        // Save the secret for verification on incoming webhook calls
        const bots = await getJsonSetting<TelegramBotEntry[]>(c, CONSTANTS.TELEGRAM_BOTS_KEY) || [];
        const idx = bots.findIndex(b => b.id === id);
        if (idx >= 0) {
            bots[idx].webhookSecret = webhookSecret;
            await c.env.KV.put(CONSTANTS.TELEGRAM_BOTS_KEY, JSON.stringify(bots));
        }
        return c.json({ ok: true, webhookUrl });
    } catch (e) {
        return c.json({ ok: false, error: `请求 Telegram 失败: ${(e as Error).message}` });
    }
}

async function getBark(c: Context<HonoCustomType>): Promise<Response> {
    const settings = await getJsonSetting<BarkSettings>(c, CONSTANTS.BARK_SETTINGS_KEY);
    // 一个设备一行：id 保持稳定，前端回传编辑时 saveBark 才能按 id 找回旧 keys；
    // 多个 key 合并脱敏显示（如 ***1111,***2222），不要拆成 id#0/id#1 的多行
    const devices = (settings?.devices || []).map(d => ({
        id: d.id, name: d.name, enabled: d.enabled,
        maskedKeys: maskBarkKeys(d.keys || ""),
    }));
    // 若 KV 里没有配置，但系统已有默认配置，则显示默认的（脱敏）
    if (!devices.length && c.env.BARK_DEVICE_KEYS) {
        devices.push({
            id: "env", name: "系统默认推送",
            enabled: true, maskedKeys: maskBarkKeys(c.env.BARK_DEVICE_KEYS),
        });
    }
    return c.json({ devices, pushUrl: settings?.pushUrl || DEFAULT_BARK_PUSH_URL });
}

async function saveBark(c: Context<HonoCustomType>): Promise<Response> {
    const body = await c.req.json<{ devices?: BarkDeviceEntry[]; pushUrl?: string }>();
    const prev = await getJsonSetting<BarkSettings>(c, CONSTANTS.BARK_SETTINGS_KEY);
    const prevMap = new Map((prev?.devices || []).map(d => [d.id, d]));
    const devices: BarkDeviceEntry[] = (body.devices || []).map(d => {
        const old = d.id ? prevMap.get(d.id) : undefined;
        return {
            id: d.id || newId(),
            name: (d.name || "").trim() || "device",
            keys: (typeof d.keys === "string" && d.keys.trim()) ? d.keys.trim() : (old?.keys || ""),
            enabled: typeof d.enabled === "boolean" ? d.enabled : true,
        };
    }).filter(d => d.keys);
    const pushUrl = (body.pushUrl || "").trim() || DEFAULT_BARK_PUSH_URL;
    await saveSetting(c, CONSTANTS.BARK_SETTINGS_KEY, JSON.stringify({ devices, pushUrl }));
    return c.json({ success: true });
}

async function testBark(c: Context<HonoCustomType>): Promise<Response> {
    const { deviceId } = await c.req.json<{ deviceId?: string }>().catch(() => ({} as { deviceId?: string }));
    const settings = await getJsonSetting<BarkSettings>(c, CONSTANTS.BARK_SETTINGS_KEY);
    const pushUrl = settings?.pushUrl?.trim() || DEFAULT_BARK_PUSH_URL;
    let devices: Array<{ id: string; name: string; enabled: boolean; keys: string }> = [];
    // 网页配置的设备：一个设备一项，keys 保持原样（可含逗号），id 不拆分
    for (const d of (settings?.devices || [])) {
        if (!d.enabled || !d.keys) continue;
        devices.push({ id: d.id, name: d.name, enabled: true, keys: d.keys });
    }
    // 系统默认配置（环境变量）
    if (c.env.BARK_DEVICE_KEYS) {
        devices.push({ id: "env", name: "系统默认推送", enabled: true, keys: c.env.BARK_DEVICE_KEYS });
    }
    if (deviceId) {
        const one = devices.find(d => d.id === deviceId);
        if (!one) return c.json({ ok: false, error: "device not found" }, 404);
        devices = [one];
    }
    const keys = [...new Set(devices.flatMap(d => d.keys.split(",")).map(k => k.trim()).filter(Boolean))];
    if (!keys.length) return c.json({ ok: false, error: "没有可用的 Bark 设备" });
    try {
        const params = new URLSearchParams({
            device_keys: keys.join(","),
            title: "✅ 测试推送",
            body: `来自临时邮箱管理后台\n时间: ${new Date().toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" })}`,
            level: "timeSensitive", group: "temp-mail", isArchive: "1",
        });
        const res = await fetch(`${pushUrl.replace(/\/+$/, "").replace(/\/push$/, "")}/push?${params}`, {
            signal: AbortSignal.timeout(15000),
        });
        if (!res.ok) return c.json({ ok: false, error: `Bark 服务返回 ${res.status}` });
        return c.json({ ok: true, devices: devices.length });
    } catch (e) {
        return c.json({ ok: false, error: `请求 Bark 服务失败: ${(e as Error).message}` });
    }
}

async function getSnapshot(c: Context<HonoCustomType>): Promise<Response> {
    const settings = await getJsonSetting<SnapshotSettings>(c, CONSTANTS.SNAPSHOT_SETTINGS_KEY);
    return c.json({
        ttlHours: settings?.ttlHours || DEFAULT_SNAPSHOT_TTL_HOURS,
        boundCacheEnabled: settings?.boundCacheEnabled === true,
        boundCacheTtl: normalizeBoundCacheTtl(settings?.boundCacheTtl),
        boundCacheTtlPresets: BOUND_CACHE_TTL_PRESETS,
        // 快照绑定允许的域名：历史 22 个收信域名 + Worker 配置的 DOMAINS 的并集，
        // 前端从这里取，不再各自硬编码
        allowedDomains: getSnapshotAllowedDomains(c),
    });
}

async function saveSnapshot(c: Context<HonoCustomType>): Promise<Response> {
    const { ttlHours, boundCacheEnabled, boundCacheTtl } = await c.req.json<{
        ttlHours?: number; boundCacheEnabled?: boolean; boundCacheTtl?: number;
    }>();
    const hours = Math.max(1, Math.min(24 * 365, Math.floor(Number(ttlHours) || DEFAULT_SNAPSHOT_TTL_HOURS)));
    const prev = await getJsonSetting<SnapshotSettings>(c, CONSTANTS.SNAPSHOT_SETTINGS_KEY);
    const enabled = typeof boundCacheEnabled === "boolean"
        ? boundCacheEnabled
        : (prev?.boundCacheEnabled === true);
    const ttl = boundCacheTtl !== undefined
        ? normalizeBoundCacheTtl(boundCacheTtl)
        : normalizeBoundCacheTtl(prev?.boundCacheTtl);
    await saveSetting(c, CONSTANTS.SNAPSHOT_SETTINGS_KEY, JSON.stringify({
        ttlHours: hours, boundCacheEnabled: enabled, boundCacheTtl: ttl,
    }));
    return c.json({ success: true, ttlHours: hours, boundCacheEnabled: enabled, boundCacheTtl: ttl });
}

function snapshotOrigin(c: Context<HonoCustomType>): string | null {
    for (const value of [c.env.SNAPSHOT_BASE_URL]) {
        try {
            if (value) {
                const origin = new URL(value).origin;
                if (origin) return origin;
            }
        } catch { /* invalid optional URL */ }
    }
    try {
        return new URL(c.req.url).origin;
    } catch {
        return null;
    }
}

async function listSnapshotBindings(c: Context<HonoCustomType>): Promise<Response> {
    return c.json(await listSnapshotBindingRecords(c));
}

async function createSnapshotBinding(c: Context<HonoCustomType>): Promise<Response> {
    const { address, durationHours } = await c.req.json<{ address?: string; durationHours?: number }>();
    const addr = (address || "").trim().toLowerCase();
    if (!addr || !addr.includes("@")) return c.json({ error: "请填写有效的邮箱地址" }, 400);
    // durationHours <= 0 表示永久有效；缺省 168 小时；上限 365 天
    const raw = Number(durationHours);
    const hours = Number.isFinite(raw) && raw <= 0 ? 0 : Math.max(1, Math.min(24 * 365, Math.floor(raw) || 168));
    if (!c.env.KV) return c.json({ error: "KV not available" }, 400);
    const origin = snapshotOrigin(c);
    if (!origin) return c.json({ error: "无法确定快照访问地址" }, 400);
    // 只要域名在允许列表中即可绑定（任意地址都能收到发到本 Worker 的邮件，不要求地址已存在）
    const domain = (addr.split("@")[1] || "").toLowerCase();
    const allowedDomains = getSnapshotAllowedDomains(c);
    const domainOk = allowedDomains.some(d => isDomainOrSubdomain(domain, d));
    if (!domainOk) return c.json({ error: `域名 ${domain} 不在允许列表中` }, 400);
    const binding = await createSnapshotBindingRecord(c, addr, hours, origin);
    return c.json({ success: true, binding });
}

// 快照绑定允许的域名：历史收信域名（与线上行为一致，支持子域名）
// 加上 Worker 配置的 DOMAINS，取并集，避免配置新增域名后无法绑定
const SNAPSHOT_LEGACY_DOMAINS = [
    'bbb99.us.ci', 'ca555.de5.net', 'ciaoo.de5.net', 'free555.de5.net',
    'free55.de5.net', 'free5.us.ci', 'kkk88.ccwu.cc', 'yyy22.de5.net',
    '1111122222.dpdns.org', 'ciaooo11.ccwu.cc', 'ciaooo22.ccwu.cc', 'ciaooo33.us.ci',
    'ciaooo55.ccwu.cc', 'ciaooo55.de5.net', 'ciaooo55.dpdns.org', 'ciaooo55.us.ci',
    'ciaooo66.ccwu.cc', 'ciaooo77.us.ci', 'ciaooo88.ccwu.cc', 'looo.cloud',
    'ciaooo66.dpdns.org', 'ciaooo77.dpdns.org',
];

function getSnapshotAllowedDomains(c: Context<HonoCustomType>): string[] {
    const set = new Set<string>();
    for (const d of SNAPSHOT_LEGACY_DOMAINS) set.add(d.toLowerCase());
    for (const d of getDomains(c)) set.add(d.toLowerCase());
    return [...set];
}


async function invalidateSnapshotBinding(c: Context<HonoCustomType>): Promise<Response> {
    const address = c.req.param("address") || "";
    const addr = decodeURIComponent(address);
    // 先查到旧 token 再删，保证 D1/KV/反向索引清干净（KV 边缘缓存可能导致直接删时反查不到 token）
    let token: string | undefined;
    try {
        const b = await c.env.KV.get<SnapshotBinding>(snapshotBindKey(addr), { type: "json" });
        token = b?.token;
    } catch { /* ignore */ }
    await deleteSnapshotBinding(c, addr, token);
    return c.json({ success: true });
}

/** 批量删除绑定 */
async function batchDeleteSnapshotBindings(c: Context<HonoCustomType>): Promise<Response> {
    const { addresses } = await c.req.json<{ addresses?: string[] }>();
    const list = [...new Set((addresses || []).map(a => (a || "").trim().toLowerCase()).filter(a => a.includes("@")))];
    if (!list.length) return c.json({ error: "请提供邮箱地址" }, 400);
    if (!c.env.KV) return c.json({ error: "KV not available" }, 400);
    let deleted = 0;
    const failed: string[] = [];
    for (const addr of list) {
        try {
            let token: string | undefined;
            try {
                const b = await c.env.KV.get<SnapshotBinding>(snapshotBindKey(addr), { type: "json" });
                token = b?.token;
            } catch { /* ignore */ }
            await deleteSnapshotBinding(c, addr, token);
            deleted++;
        } catch {
            failed.push(addr);
        }
    }
    return c.json({ success: true, deleted, failed });
}

/** 批量调整有效期：只改 expiresAt，不更换链接；durationHours <= 0 为永久有效 */
async function batchExtendSnapshotBindings(c: Context<HonoCustomType>): Promise<Response> {
    const { addresses, durationHours } = await c.req.json<{ addresses?: string[]; durationHours?: number }>();
    const list = [...new Set((addresses || []).map(a => (a || "").trim().toLowerCase()).filter(a => a.includes("@")))];
    if (!list.length) return c.json({ error: "请提供邮箱地址" }, 400);
    if (!c.env.KV) return c.json({ error: "KV not available" }, 400);
    const raw = Number(durationHours);
    const hours = Number.isFinite(raw) && raw <= 0 ? 0 : Math.max(1, Math.min(24 * 365, Math.floor(raw) || 168));
    let updated = 0;
    const failed: string[] = [];
    const bindings: SnapshotBinding[] = [];
    for (const addr of list) {
        try {
            const b = await updateSnapshotBindingExpiry(c, addr, hours);
            if (b) {
                updated++;
                bindings.push(b);
            } else {
                failed.push(addr);
            }
        } catch {
            failed.push(addr);
        }
    }
    return c.json({ success: true, updated, failed, bindings });
}

/** 批量更换链接：为每个地址生成新 token（旧链接立即失效） */
async function batchReplaceSnapshotBindings(c: Context<HonoCustomType>): Promise<Response> {
    const { addresses, durationHours } = await c.req.json<{ addresses?: string[]; durationHours?: number }>();
    const list = [...new Set((addresses || []).map(a => (a || "").trim().toLowerCase()).filter(a => a.includes("@")))];
    if (!list.length) return c.json({ error: "请提供邮箱地址" }, 400);
    if (!c.env.KV) return c.json({ error: "KV not available" }, 400);
    const raw = Number(durationHours);
    const hours = Number.isFinite(raw) && raw <= 0 ? 0 : Math.max(1, Math.min(24 * 365, Math.floor(raw) || 168));
    const origin = snapshotOrigin(c);
    if (!origin) return c.json({ error: "无法确定快照访问地址" }, 400);
    const allowedDomains = getSnapshotAllowedDomains(c);
    let replaced = 0;
    const failed: string[] = [];
    const bindings: SnapshotBinding[] = [];
    for (const addr of list) {
        try {
            const domain = (addr.split("@")[1] || "").toLowerCase();
            if (!allowedDomains.some(d => isDomainOrSubdomain(domain, d))) {
                failed.push(addr);
                continue;
            }
            const b = await createSnapshotBindingRecord(c, addr, hours, origin);
            replaced++;
            bindings.push(b);
        } catch {
            failed.push(addr);
        }
    }
    return c.json({ success: true, replaced, failed, bindings });
}

export async function getSnapshotTtlSeconds(c: Context<HonoCustomType>): Promise<number> {
    try {
        const s = await getJsonSetting<SnapshotSettings>(c, CONSTANTS.SNAPSHOT_SETTINGS_KEY);
        const hours = s?.ttlHours || DEFAULT_SNAPSHOT_TTL_HOURS;
        return Math.max(3600, Math.min(24 * 365 * 3600, Math.floor(hours) * 3600));
    } catch {
        return DEFAULT_SNAPSHOT_TTL_HOURS * 3600;
    }
}

/** 归一化绑定快照缓存时长：非法值回退默认 10 秒，钳制在 5~600 秒 */
export function normalizeBoundCacheTtl(value: unknown): number {
    const n = Math.floor(Number(value));
    if (!Number.isFinite(n) || n <= 0) return DEFAULT_BOUND_CACHE_TTL;
    return Math.max(5, Math.min(600, n));
}

export type BoundSnapshotCacheConfig = {
    /** 边缘缓存开关，默认 false（关闭=实时读取） */
    enabled: boolean;
    /** 缓存时长（秒），默认 10 */
    ttlSeconds: number;
};

/**
 * 读取绑定快照边缘缓存配置（D1 settings，无边缘缓存，网页改完即时生效）。
 * 默认关闭：每次打开都实时读 KV，新邮件秒级可见、更换链接秒级失效。
 */
export async function getBoundSnapshotCacheConfig(c: Context<HonoCustomType>): Promise<BoundSnapshotCacheConfig> {
    try {
        const s = await getJsonSetting<SnapshotSettings>(c, CONSTANTS.SNAPSHOT_SETTINGS_KEY);
        return {
            enabled: s?.boundCacheEnabled === true,
            ttlSeconds: normalizeBoundCacheTtl(s?.boundCacheTtl),
        };
    } catch {
        return { enabled: DEFAULT_BOUND_CACHE_ENABLED, ttlSeconds: DEFAULT_BOUND_CACHE_TTL };
    }
}

/** 绑定快照的 Cache-Control：关闭=不缓存（实时），开启=按挡位缓存 */
export function boundSnapshotCacheControl(cfg: BoundSnapshotCacheConfig): string {
    return cfg.enabled ? `public, max-age=${cfg.ttlSeconds}` : "no-store";
}

export type WebPushBot = {
    token: string;
    allowedChatIds: string;
    allowedGroupIds: string;
};

export async function getWebPushConfig(c: Context<HonoCustomType>): Promise<{
    telegramBots: WebPushBot[];
    telegramTokens: string[];
    barkKeys: string[];
    barkPushUrl: string;
}> {
    const [bots, bark] = await Promise.all([
        getJsonSetting<TelegramBotEntry[]>(c, CONSTANTS.TELEGRAM_BOTS_KEY).catch(() => null),
        getJsonSetting<BarkSettings>(c, CONSTANTS.BARK_SETTINGS_KEY).catch(() => null),
    ]);
    const telegramBots: WebPushBot[] = (bots || [])
        .filter(b => b.enabled && b.token)
        .map(b => ({
            token: b.token,
            allowedChatIds: b.allowedChatIds || "",
            allowedGroupIds: b.allowedGroupIds || "",
        }));
    return {
        telegramBots,
        telegramTokens: telegramBots.map(b => b.token),
        barkKeys: (bark?.devices || []).filter(d => d.enabled && d.keys)
            .flatMap(d => d.keys.split(",")).map(k => k.trim()).filter(Boolean),
        barkPushUrl: bark?.pushUrl?.trim() || DEFAULT_BARK_PUSH_URL,
    };
}

export default {
    listTelegramBots,
    createTelegramBot,
    updateTelegramBot,
    deleteTelegramBot,
    testTelegramBot,
    setTelegramBotWebhook,
    getBark,
    saveBark,
    testBark,
    getSnapshot,
    saveSnapshot,
    listSnapshotBindings,
    createSnapshotBinding,
    invalidateSnapshotBinding,
    batchDeleteSnapshotBindings,
    batchExtendSnapshotBindings,
    batchReplaceSnapshotBindings,
};
