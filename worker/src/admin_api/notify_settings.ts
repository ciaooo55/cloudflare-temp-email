import { Context } from "hono";
import { CONSTANTS } from "../constants";
import { getJsonSetting, saveSetting } from "../utils";
import {
    createSnapshotBindingRecord,
    deleteSnapshotBinding,
    getSnapshotBinding,
    listSnapshotBindingRecords,
} from "../telegram_api/mail_snapshot";

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
};

export type { SnapshotBinding } from "../telegram_api/mail_snapshot";

export const DEFAULT_BARK_PUSH_URL = "https://bark.ciaooo55.us.ci/push";
export const DEFAULT_SNAPSHOT_TTL_HOURS = 24;

const newId = () => {
    const bytes = new Uint8Array(8);
    crypto.getRandomValues(bytes);
    return [...bytes].map(b => b.toString(16).padStart(2, "0")).join("");
};

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
        const webhookUrl = `https://${new URL(c.req.url).host}/telegram/webhook/${id}`;
        const res = await fetch(`https://api.telegram.org/bot${bot.token}/setWebhook`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ url: webhookUrl }),
        });
        const json = await res.json<{ ok: boolean; description?: string }>().catch(() => null);
        if (!res.ok || !json?.ok) {
            return c.json({ ok: false, error: json?.description || `setWebhook failed: ${res.status}` });
        }
        return c.json({ ok: true, webhookUrl });
    } catch (e) {
        return c.json({ ok: false, error: `请求 Telegram 失败: ${(e as Error).message}` });
    }
}

async function getBark(c: Context<HonoCustomType>): Promise<Response> {
    const settings = await getJsonSetting<BarkSettings>(c, CONSTANTS.BARK_SETTINGS_KEY);
    const devices = (settings?.devices || []).flatMap(d => {
        // 网页配置的设备若 keys 含逗号，拆成一行一个
        const keys = (d.keys || "").split(",").map(k => k.trim()).filter(Boolean);
        if (keys.length <= 1) {
            return [{ id: d.id, name: d.name, enabled: d.enabled, maskedKeys: maskBarkKeys(d.keys || "") }];
        }
        return keys.map((k, i) => ({
            id: `${d.id}#${i}`, name: i === 0 ? d.name : `${d.name} ${i + 1}`,
            enabled: d.enabled, maskedKeys: maskBarkKeys(k),
        }));
    });
    // 若 KV 里没有配置，但系统已有默认配置，则显示默认的（脱敏），多个 Key 拆成一行一个
    if (!devices.length && c.env.BARK_DEVICE_KEYS) {
        const envKeys = c.env.BARK_DEVICE_KEYS.split(",").map(k => k.trim()).filter(Boolean);
        envKeys.forEach((k, i) => {
            devices.push({
                id: `env#${i}`, name: i === 0 ? "系统默认推送" : `系统默认推送 ${i + 1}`,
                enabled: true, maskedKeys: maskBarkKeys(k),
            });
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
    // 网页配置的设备，拆分多 Key
    for (const d of (settings?.devices || [])) {
        if (!d.enabled || !d.keys) continue;
        const keys = d.keys.split(",").map(k => k.trim()).filter(Boolean);
        keys.forEach((k, i) => {
            devices.push({ id: keys.length > 1 ? `${d.id}#${i}` : d.id, name: d.name, enabled: true, keys: k });
        });
    }
    // 系统默认配置（环境变量），多个 Key 拆成一行一个
    if (c.env.BARK_DEVICE_KEYS) {
        const envKeys = c.env.BARK_DEVICE_KEYS.split(",").map(k => k.trim()).filter(Boolean);
        envKeys.forEach((k, i) => {
            devices.push({ id: `env#${i}`, name: "系统默认推送", enabled: true, keys: k });
        });
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
    return c.json({ ttlHours: settings?.ttlHours || DEFAULT_SNAPSHOT_TTL_HOURS });
}

async function saveSnapshot(c: Context<HonoCustomType>): Promise<Response> {
    const { ttlHours } = await c.req.json<{ ttlHours?: number }>();
    const hours = Math.max(1, Math.min(24 * 365, Math.floor(Number(ttlHours) || DEFAULT_SNAPSHOT_TTL_HOURS)));
    await saveSetting(c, CONSTANTS.SNAPSHOT_SETTINGS_KEY, JSON.stringify({ ttlHours: hours }));
    return c.json({ success: true, ttlHours: hours });
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
    const hours = Math.max(1, Math.min(24 * 365, Math.floor(Number(durationHours) || 168)));
    if (!c.env.KV) return c.json({ error: "KV not available" }, 400);
    const origin = snapshotOrigin(c);
    if (!origin) return c.json({ error: "无法确定快照访问地址" }, 400);
    // 地址必须存在
    if (c.env.DB) {
        const exists = await c.env.DB.prepare(`SELECT id FROM address WHERE name = ?`).bind(addr).first("id").catch(() => null);
        if (!exists) return c.json({ error: "该邮箱地址不存在，请先创建" }, 400);
    }
    const binding = await createSnapshotBindingRecord(c, addr, hours, origin);
    return c.json({ success: true, binding });
}

async function invalidateSnapshotBinding(c: Context<HonoCustomType>): Promise<Response> {
    const address = c.req.param("address") || "";
    await deleteSnapshotBinding(c, decodeURIComponent(address));
    return c.json({ success: true });
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
};
