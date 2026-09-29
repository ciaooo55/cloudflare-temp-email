import { Context, Hono } from 'hono'
import { ServerResponse } from 'node:http'
import { Writable } from 'node:stream'

import { newTelegramBot, initTelegramBotCommands, sendMailNotifications } from './telegram'
import settings from './settings'
import miniapp from './miniapp'
import i18n from '../i18n'
import { CONSTANTS } from '../constants'
import { getJsonSetting } from '../utils'
import type { TelegramBotEntry } from '../admin_api/notify_settings'

export const api = new Hono<HonoCustomType>();
export { sendMailNotifications }

const hasTelegramBot = async (c: Context<HonoCustomType>) => {
    if (c.env.TELEGRAM_BOT_TOKEN) return true;
    try {
        const bots = await getJsonSetting<TelegramBotEntry[]>(c, CONSTANTS.TELEGRAM_BOTS_KEY) || [];
        return bots.some(b => b.enabled !== false && b.token);
    } catch {
        return false;
    }
};

api.use("/telegram/*", async (c, next) => {
    const msgs = i18n.getMessagesbyContext(c);
    if (!c.env.KV) {
        return c.text(msgs.KVNotAvailableMsg, 400);
    }
    if (!(await hasTelegramBot(c))) {
        return c.text(msgs.TgBotTokenRequiredMsg, 400);
    }
    return await next();
});

api.use("/admin/telegram/*", async (c, next) => {
    const msgs = i18n.getMessagesbyContext(c);
    if (!c.env.KV) {
        return c.text(msgs.KVNotAvailableMsg, 400);
    }
    if (!(await hasTelegramBot(c))) {
        return c.text(msgs.TgBotTokenRequiredMsg, 400);
    }
    return await next();
});

api.post("/telegram/webhook/:botId", async (c) => {
    const botId = c.req.param("botId");
    const bots = await getJsonSetting<TelegramBotEntry[]>(c, CONSTANTS.TELEGRAM_BOTS_KEY) || [];
    const bot = bots.find(b => b.id === botId);
    if (!bot?.token) {
        return c.text("bot not found", 404);
    }
    // Security: verify the request actually came from Telegram
    // Telegram sends the secret_token in X-Telegram-Bot-Api-Secret-Token header
    if (bot.webhookSecret) {
        const providedSecret = c.req.header("X-Telegram-Bot-Api-Secret-Token");
        if (providedSecret !== bot.webhookSecret) {
            return c.text("unauthorized", 401);
        }
    }
    const tgBot = newTelegramBot(c, bot.token);
    let body = null;
    const res = new Writable();
    Object.assign(res, {
        headersSent: false,
        setHeader: (name: string, value: string) => c.header(name, value),
        end: (data: any) => body = data,
    });
    const reqJson = await c.req.json().catch(() => null);
    if (!reqJson) {
        return c.text("invalid json", 400);
    }
    await tgBot.handleUpdate(reqJson, res as ServerResponse);
    return c.body(body);
});

api.post("/telegram/webhook", async (c) => {
    // Security: verify the request actually came from Telegram (system default bot)
    const storedSecret = await c.env.KV.get("telegram:webhook-secret:default");
    if (storedSecret) {
        const providedSecret = c.req.header("X-Telegram-Bot-Api-Secret-Token");
        if (providedSecret !== storedSecret) {
            return c.text("unauthorized", 401);
        }
    }
    const token = c.env.TELEGRAM_BOT_TOKEN;
    const bot = newTelegramBot(c, token);
    let body = null;
    const res = new Writable();
    Object.assign(res, {
        headersSent: false,
        setHeader: (name: string, value: string) => c.header(name, value),
        end: (data: any) => body = data,
    });
    const reqJson = await c.req.json().catch(() => null);
    if (!reqJson) {
        return c.text("invalid json", 400);
    }
    await bot.handleUpdate(reqJson, res as ServerResponse);
    return c.body(body);
});

api.post("/admin/telegram/init", async (c) => {
    const domain = new URL(c.req.url).host;
    const token = c.env.TELEGRAM_BOT_TOKEN;
    const webhookUrl = `https://${domain}/telegram/webhook`;
    console.log(`setting webhook to ${webhookUrl}`);
    // Security: generate a secret token for webhook verification
    const secretBytes = new Uint8Array(32);
    crypto.getRandomValues(secretBytes);
    const webhookSecret = [...secretBytes].map(b => b.toString(16).padStart(2, "0")).join("");
    const bot = newTelegramBot(c, token);
    await bot.telegram.setWebhook(webhookUrl, { secret_token: webhookSecret })
    await c.env.KV.put("telegram:webhook-secret:default", webhookSecret);
    await initTelegramBotCommands(c, bot);
    return c.json({
        message: "webhook set successfully",
    });
});

api.get("/admin/telegram/status", async (c) => {
    const token = c.env.TELEGRAM_BOT_TOKEN;
    const bot = newTelegramBot(c, token);
    const info = await bot.telegram.getWebhookInfo()
    const commands = await bot.telegram.getMyCommands()
    return c.json({ info, commands });
});

api.get("/admin/telegram/settings", settings.getTelegramSettings);
api.post("/admin/telegram/settings", settings.saveTelegramSettings);
api.post("/telegram/get_bind_address", miniapp.getTelegramBindAddress);
api.post("/telegram/new_address", miniapp.newTelegramAddress);
api.post("/telegram/bind_address", miniapp.bindAddress);
api.post("/telegram/unbind_address", miniapp.unbindAddress);
api.post("/telegram/get_mail", miniapp.getMail);
