import { workerStore } from "../worker_store.ts";
import { Context } from "hono";
import { CONSTANTS } from '../constants.ts';
import { AdminWebhookSettings } from '../models/index.ts';

async function getWebhookSettings(c: Context<HonoCustomType>): Promise<Response> {
    const settings = await workerStore(c.env).get<AdminWebhookSettings>(CONSTANTS.WEBHOOK_KV_SETTINGS_KEY, "json");
    return c.json(settings || new AdminWebhookSettings(false, []));
}

async function saveWebhookSettings(c: Context<HonoCustomType>): Promise<Response> {
    const settings = await c.req.json<AdminWebhookSettings>();
    await workerStore(c.env).put(CONSTANTS.WEBHOOK_KV_SETTINGS_KEY, JSON.stringify(settings));
    return c.json({ success: true })
}

export default {
    getWebhookSettings,
    saveWebhookSettings,
}
