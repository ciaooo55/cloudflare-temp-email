/**
 * Unified per-domain send & push routing configuration.
 *
 * All three send channels are kept (Cloudflare send_email binding, Resend,
 * SMTP via worker-mailer), but each can now have MULTIPLE named configs and
 * every domain can pick its own ordered channel chain:
 *
 *   SEND_ROUTES (JSON string or object, plain var - NO secrets inside):
 *   {
 *     "domains": {
 *       "a.com": {
 *         "send": [
 *           { "provider": "resend", "key": "RESEND_TOKEN_1" },
 *           { "provider": "cf" }
 *         ],
 *         "push": {
 *           "telegram": ["TELEGRAM_BOT_TOKEN", "TELEGRAM_BOT_TOKEN_2"],
 *           "bark": ["BARK_DEVICE_KEYS", "BARK_DEVICE_KEYS_2"]
 *         }
 *       },
 *       "b.com": {
 *         "send": [{ "provider": "smtp", "config": "SMTP_1" }]
 *       },
 *       "*": { "send": [{ "provider": "resend", "key": "RESEND_TOKEN_1" }] }
 *     }
 *   }
 *
 * Secrets referenced by NAME (set via `wrangler secret put` or Dashboard):
 * - RESEND_TOKEN_1 / RESEND_TOKEN_2 ...  Resend API keys
 * - TELEGRAM_BOT_TOKEN / TELEGRAM_BOT_TOKEN_2 ...  Telegram bot tokens
 * - BARK_DEVICE_KEYS / BARK_DEVICE_KEYS_2 ...      comma-separated Bark device keys
 * - SMTP_1 / SMTP_2 ...                  worker-mailer SMTP options (JSON)
 *
 * When SEND_ROUTES is absent, the legacy behavior is used unchanged:
 * RESEND_TOKEN[_<DOMAIN>] -> SMTP_CONFIG -> SEND_MAIL binding priority,
 * single TELEGRAM_BOT_TOKEN and BARK_DEVICE_KEYS for push.
 */

import type { WorkerMailerOptions } from 'worker-mailer';
import { getJsonObjectValue, normalizeDomain } from './utils.ts';

export type SendChannelRef =
    | { provider: 'cf'; binding?: string }
    | { provider: 'resend'; key: string }
    | { provider: 'smtp'; config: string };

export type DomainPushConfig = {
    /** secret names holding telegram bot tokens */
    telegram?: string[];
    /** secret names holding comma-separated bark device keys */
    bark?: string[];
};

export type DomainRouteConfig = {
    /** ordered send channel chain, first working channel wins */
    send?: SendChannelRef[];
    push?: DomainPushConfig;
};

export type SendRoutesConfig = {
    domains?: Record<string, DomainRouteConfig>;
};

export type ResolvedSendChannel =
    | { kind: 'resend'; label: string; token: string }
    | { kind: 'smtp'; label: string; options: WorkerMailerOptions }
    | { kind: 'cf'; label: string; bindingName: string };

const readSecret = (env: Bindings, name: string): string => {
    const v = (env as unknown as Record<string, unknown>)[name];
    return typeof v === 'string' ? v.trim() : '';
};

export const parseSendRoutes = (env: Bindings): SendRoutesConfig | null => {
    const raw = (env as unknown as Record<string, unknown>).SEND_ROUTES;
    const parsed = getJsonObjectValue<SendRoutesConfig>(raw as string);
    if (!parsed || typeof parsed !== 'object' || !parsed.domains) {
        return null;
    }
    return parsed;
};

/**
 * Find the route for a mail domain: exact match first, then "*" default.
 */
export const getDomainRoute = (
    env: Bindings, mailDomain: string
): DomainRouteConfig | null => {
    const routes = parseSendRoutes(env);
    if (!routes?.domains) {
        return null;
    }
    const domain = normalizeDomain(mailDomain);
    for (const key of Object.keys(routes.domains)) {
        if (key !== '*' && normalizeDomain(key) === domain) {
            return routes.domains[key];
        }
    }
    return routes.domains['*'] || null;
};

/**
 * Resolve the route's send chain into concrete, usable channels.
 * Channels whose credentials are missing/invalid are skipped with a warning,
 * so a misconfigured first channel falls through to the next one.
 */
export const resolveSendChannels = (
    env: Bindings, route: DomainRouteConfig
): ResolvedSendChannel[] => {
    const channels: ResolvedSendChannel[] = [];
    const refs = Array.isArray(route.send) ? route.send : [];
    for (const ref of refs) {
        if (!ref || typeof ref !== 'object') {
            continue;
        }
        if (ref.provider === 'resend') {
            if (!ref.key) {
                console.warn('[send-routes] resend channel missing "key", skipped');
                continue;
            }
            const token = readSecret(env, ref.key);
            if (!token) {
                console.warn(`[send-routes] resend key "${ref.key}" not configured, skipped`);
                continue;
            }
            channels.push({ kind: 'resend', label: `resend:${ref.key}`, token });
        } else if (ref.provider === 'smtp') {
            if (!ref.config) {
                console.warn('[send-routes] smtp channel missing "config", skipped');
                continue;
            }
            const options = getJsonObjectValue<WorkerMailerOptions>(
                (env as unknown as Record<string, unknown>)[ref.config] as string
            );
            if (!options || !options.host) {
                console.warn(`[send-routes] smtp config "${ref.config}" missing/invalid, skipped`);
                continue;
            }
            channels.push({ kind: 'smtp', label: `smtp:${ref.config}`, options });
        } else if (ref.provider === 'cf') {
            const bindingName = ref.binding || 'SEND_MAIL';
            const binding = (env as unknown as Record<string, unknown>)[bindingName];
            if (!binding) {
                console.warn(`[send-routes] cf binding "${bindingName}" not found, skipped`);
                continue;
            }
            channels.push({ kind: 'cf', label: `cf:${bindingName}`, bindingName });
        } else {
            console.warn(`[send-routes] unknown provider "${(ref as { provider: unknown }).provider}", skipped`);
        }
    }
    return channels;
};

export type ResolvedPushConfig = {
    telegramTokens: string[];
    barkKeys: string[];
};

/**
 * Resolve push targets for a mail domain.
 * Falls back to the legacy single-token envs when no route is configured.
 */
export const resolvePushConfig = (
    env: Bindings, mailDomain: string
): ResolvedPushConfig => {
    const route = getDomainRoute(env, mailDomain);
    const tgNames = route?.push?.telegram;
    const barkNames = route?.push?.bark;
    const telegramTokens = (Array.isArray(tgNames) && tgNames.length
        ? tgNames
        : (env.TELEGRAM_BOT_TOKEN ? ['TELEGRAM_BOT_TOKEN'] : [])
    ).map((name) => readSecret(env, name)).filter(Boolean);
    const barkKeys = (Array.isArray(barkNames) && barkNames.length
        ? barkNames
        : (env.BARK_DEVICE_KEYS ? ['BARK_DEVICE_KEYS'] : [])
    ).flatMap((name) => readSecret(env, name).split(','))
        .map((k) => k.trim())
        .filter(Boolean);
    return {
        telegramTokens,
        barkKeys: [...new Set(barkKeys)],
    };
};
