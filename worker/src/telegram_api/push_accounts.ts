import type { Context } from "hono";

export type TelegramPushAccount = { kind: "tg"; id: string; token: string; targets: string[] };
export type WeChatPushAccount = { kind: "wx"; id: string; botToken: string; toUserId: string; contextToken: string | null };

export async function getPushAccounts(c: Context<HonoCustomType>): Promise<(TelegramPushAccount | WeChatPushAccount)[]> {
    let config: unknown;
    try {
        config = await c.env.KV?.get("push:accounts", "json");
    } catch {
        return [];
    }
    if (!Array.isArray(config)) return [];

    const accounts: (TelegramPushAccount | WeChatPushAccount)[] = [];
    for (const entry of config) {
        if (!entry || typeof entry !== "object" || entry.enabled === false) continue;
        if (entry.type === "telegram" && typeof entry.token === "string" && entry.token) {
            const targets = Array.isArray(entry.targets)
                ? entry.targets.filter((target: unknown) => target != null).map(String)
                : entry.target != null ? [String(entry.target)] : [];
            accounts.push({ kind: "tg", id: typeof entry.id === "string" && entry.id ? entry.id : `tg-${accounts.length}`,
                token: entry.token, targets });
        } else if (entry.type === "wechat" && typeof entry.botToken === "string" && entry.botToken
            && typeof entry.toUserId === "string" && entry.toUserId) {
            accounts.push({ kind: "wx", id: typeof entry.id === "string" && entry.id ? entry.id : `wx-${accounts.length}`,
                botToken: entry.botToken, toUserId: entry.toUserId,
                contextToken: typeof entry.contextToken === "string" ? entry.contextToken : null });
        }
    }
    return accounts;
}
