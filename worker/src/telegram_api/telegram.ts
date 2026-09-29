
import { Context } from "hono";
import { Telegraf, Context as TgContext, Markup } from "telegraf";
import { callbackQuery } from "telegraf/filters";

import { CONSTANTS } from "../constants";
import { getBooleanValue, getDomains, getJsonObjectValue, getMailDomain, trimLower } from '../utils';
import { TelegramSettings } from "./settings";
import { sendTelegramAttachments } from "./tg_file_upload";
import { resolvePushConfig } from "../send_config";
import { getWebPushConfig, getSnapshotTtlSeconds, DEFAULT_BARK_PUSH_URL } from "../admin_api/notify_settings";
import { bindTelegramAddress, deleteTelegramAddress, jwtListToAddressData, tgUserNewAddress, unbindTelegramAddress, unbindTelegramByAddress } from "./common";
import { commonParseMail } from "../common";
import { mailBody } from "./mail_body";
import { mailMessageParts } from "./mail_message";
import {
    buildCompactMailMessage,
    createMailSnapshot,
    extractVerificationCodeWithSubject,
    getSnapshotBinding,
} from "./mail_snapshot";
import { resolveRawEmail } from "../gzip";
import { UserFromGetMe } from "telegraf/types";
import i18n from "../i18n";
import { LocaleMessages } from "../i18n/type";
import type { ExtractResult, RawMailRow } from "../models";


// Helper to get messages by userId
const getTgMessages = async (
    c: Context<HonoCustomType>,
    ctx?: TgContext,
    userId?: string | null
): Promise<LocaleMessages> => {
    // Check if user language config is enabled (default false)
    if (!getBooleanValue(c.env.TG_ALLOW_USER_LANG)) {
        return i18n.getMessages(c.env.DEFAULT_LANG || 'zh');
    }

    const uid = userId || ctx?.message?.from?.id?.toString() || ctx?.callbackQuery?.from?.id?.toString();
    if (uid) {
        const savedLang = await c.env.KV.get(`${CONSTANTS.TG_KV_PREFIX}:lang:${uid}`);
        if (savedLang) { return i18n.getMessages(savedLang); }
    }
    return i18n.getMessages(c.env.DEFAULT_LANG || 'zh');
};

// Bilingual command descriptions with full usage instructions
const COMMANDS = [
    {
        command: "start",
        description: "开始使用 | Get started"
    },
    {
        command: "new",
        description: "新建邮箱, /new <name>@<domain>, name[a-z0-9]有效, 为空随机生成, @domain可选 | Create address, /new <name>@<domain>, name[a-z0-9] valid, empty=random, @domain optional"
    },
    {
        command: "address",
        description: "查看邮箱地址列表 | View address list"
    },
    {
        command: "bind",
        description: "绑定邮箱, /bind <邮箱地址凭证> | Bind address, /bind <credential>"
    },
    {
        command: "unbind",
        description: "解绑邮箱, /unbind <邮箱地址> | Unbind address, /unbind <address>"
    },
    {
        command: "delete",
        description: "删除邮箱, /delete <邮箱地址> | Delete address, /delete <address>"
    },
    {
        command: "mails",
        description: "查看邮件, /mails <邮箱地址>, 不输入地址默认第一个 | View mails, /mails <address>, default first if empty"
    },
    {
        command: "cleaninvalidaddress",
        description: "清理无效地址 | Clean invalid addresses"
    },
    {
        command: "lang",
        description: "设置语言 /lang <zh|en> | Set language /lang <zh|en>"
    },
]

const formatAiExtractForTelegram = (
    msgs: LocaleMessages,
    aiExtract?: ExtractResult | string | null
): string => {
    if (!aiExtract) {
        return "";
    }

    try {
        if (typeof aiExtract === "string") {
            const metadata = JSON.parse(aiExtract);
            aiExtract = metadata?.ai_extract;
        }
    } catch (error) {
        console.warn("Failed to parse AI extraction metadata", error);
        return "";
    }

    if (!aiExtract || typeof aiExtract !== "object") {
        return "";
    }

    const labels: Record<Exclude<ExtractResult["type"], "none">, string> = {
        auth_code: msgs.TgAiExtractAuthCodeMsg,
        auth_link: msgs.TgAiExtractAuthLinkMsg,
        service_link: msgs.TgAiExtractServiceLinkMsg,
        subscription_link: msgs.TgAiExtractSubscriptionLinkMsg,
        other_link: msgs.TgAiExtractOtherLinkMsg,
    };
    const label = labels[aiExtract.type as keyof typeof labels];
    const result = typeof aiExtract.result === "string"
        ? aiExtract.result.replace(/\s+/g, " ").trim().slice(0, 600)
        : "";
    if (!result) {
        return "";
    }

    if (!label) {
        return "";
    }

    const resultText = typeof aiExtract.result_text === "string"
        ? aiExtract.result_text.replace(/\s+/g, " ").trim().slice(0, 120)
        : "";
    const displayText = aiExtract.type !== "auth_code" && resultText && resultText !== result
        ? ` (${resultText})`
        : "";
    return `${msgs.TgAiExtractResultMsg}\n${label}: ${result}${displayText}\n\n`;
}

export const getTelegramCommands = (c: Context<HonoCustomType>) => {
    return getBooleanValue(c.env.TG_ALLOW_USER_LANG)
        ? COMMANDS
        : COMMANDS.filter(cmd => cmd.command !== "lang");
}

export function newTelegramBot(c: Context<HonoCustomType>, token: string): Telegraf {
    const bot = new Telegraf(token);
    const botInfo = getJsonObjectValue<UserFromGetMe>(c.env.TG_BOT_INFO);
    if (botInfo) {
        bot.botInfo = botInfo;
    }

    bot.use(async (ctx, next) => {
        // check if in private chat
        if (ctx.chat?.type !== "private") {
            return;
        }

        const userId = ctx?.message?.from?.id || ctx.callbackQuery?.message?.chat?.id;
        if (!userId) {
            const msgs = await getTgMessages(c, ctx);
            return await ctx.reply(msgs.TgUnableGetUserInfoMsg);
        }

        const settings = await c.env.KV.get<TelegramSettings>(CONSTANTS.TG_KV_SETTINGS_KEY, "json");
        if (settings?.enableAllowList
            && !settings.allowList.includes(userId.toString())
        ) {
            const msgs = await getTgMessages(c, ctx);
            return await ctx.reply(msgs.TgNoPermissionMsg);
        }
        try {
            await next();
        } catch (error) {
            console.error(`Error: ${error}`);
            return await ctx.reply(`Error: ${error}`);
        }
    })

    bot.command("start", async (ctx: TgContext) => {
        const msgs = await getTgMessages(c, ctx);
        const prefix = trimLower(c.env.PREFIX)
        const domains = getDomains(c);
        const commands = getTelegramCommands(c);
        return await ctx.reply(
            `${msgs.TgWelcomeMsg}\n\n`
            + (prefix ? `${msgs.TgCurrentPrefixMsg} ${prefix}\n` : '')
            + `${msgs.TgCurrentDomainsMsg} ${JSON.stringify(domains)}\n`
            + `${msgs.TgAvailableCommandsMsg}\n`
            + commands.map(cmd => `/${cmd.command}: ${cmd.description}`).join("\n")
        );
    });

    bot.command("new", async (ctx: TgContext) => {
        const msgs = await getTgMessages(c, ctx);
        const userId = ctx?.message?.from?.id;
        if (!userId) {
            return await ctx.reply(msgs.TgUnableGetUserInfoMsg);
        }
        try {
            // @ts-ignore
            const address = ctx?.message?.text.slice("/new".length).trim();
            const res = await tgUserNewAddress(c, userId.toString(), address, msgs);
            return await ctx.reply(`${msgs.TgCreateSuccessMsg}\n`
                + `${msgs.TgAddressMsg} ${res.address}\n`
                + (res.password ? `${msgs.TgPasswordMsg} \`${res.password}\`\n` : '')
                + `${msgs.TgCredentialMsg} \`${res.jwt}\`\n`,
                {
                    parse_mode: "Markdown"
                }
            );
        } catch (e) {
            return await ctx.reply(`${msgs.TgCreateFailedMsg} ${(e as Error).message}`);
        }
    });

    bot.command("bind", async (ctx: TgContext) => {
        const msgs = await getTgMessages(c, ctx);
        const userId = ctx?.message?.from?.id;
        if (!userId) {
            return await ctx.reply(msgs.TgUnableGetUserInfoMsg);
        }
        try {
            // @ts-ignore
            const jwt = ctx?.message?.text.slice("/bind".length).trim();
            if (!jwt) {
                return await ctx.reply(msgs.TgPleaseInputCredentialMsg);
            }
            const address = await bindTelegramAddress(c, userId.toString(), jwt, msgs);
            return await ctx.reply(`${msgs.TgBindSuccessMsg}\n`
                + `${msgs.TgAddressMsg} ${address}`
            );
        }
        catch (e) {
            return await ctx.reply(`${msgs.TgBindFailedMsg} ${(e as Error).message}`);
        }
    });

    bot.command("unbind", async (ctx: TgContext) => {
        const msgs = await getTgMessages(c, ctx);
        const userId = ctx?.message?.from?.id;
        if (!userId) {
            return await ctx.reply(msgs.TgUnableGetUserInfoMsg);
        }
        try {
            // @ts-ignore
            const address = ctx?.message?.text.slice("/unbind".length).trim();
            if (!address) {
                return await ctx.reply(msgs.TgPleaseInputAddressMsg);
            }
            await unbindTelegramAddress(c, userId.toString(), address);
            return await ctx.reply(`${msgs.TgUnbindSuccessMsg}\n${msgs.TgAddressMsg} ${address}`
            );
        }
        catch (e) {
            return await ctx.reply(`${msgs.TgUnbindFailedMsg} ${(e as Error).message}`);
        }
    })

    bot.command("delete", async (ctx: TgContext) => {
        const msgs = await getTgMessages(c, ctx);
        const userId = ctx?.message?.from?.id;
        if (!userId) {
            return await ctx.reply(msgs.TgUnableGetUserInfoMsg);
        }
        try {
            // @ts-ignore
            const address = ctx?.message?.text.slice("/delete".length).trim();
            if (!address) {
                return await ctx.reply(msgs.TgPleaseInputAddressMsg);
            }
            await deleteTelegramAddress(c, userId.toString(), address, msgs);
            return await ctx.reply(`${msgs.TgDeleteSuccessMsg} ${address}`);
        } catch (e) {
            return await ctx.reply(`${msgs.TgDeleteFailedMsg} ${(e as Error).message}`);
        }
    });

    bot.command("address", async (ctx) => {
        const msgs = await getTgMessages(c, ctx);
        const userId = ctx?.message?.from?.id;
        if (!userId) {
            return await ctx.reply(msgs.TgUnableGetUserInfoMsg);
        }
        try {
            const jwtList = await c.env.KV.get<string[]>(`${CONSTANTS.TG_KV_PREFIX}:${userId}`, 'json') || [];
            const { addressList } = await jwtListToAddressData(c, jwtList, msgs);
            return await ctx.reply(`${msgs.TgAddressListMsg}\n\n`
                + addressList.map(a => `${msgs.TgAddressMsg} ${a}`).join("\n")
            );
        } catch (e) {
            return await ctx.reply(`${msgs.TgGetAddressFailedMsg} ${(e as Error).message}`);
        }
    });

    bot.command("cleaninvalidaddress", async (ctx: TgContext) => {
        const msgs = await getTgMessages(c, ctx);
        const userId = ctx?.message?.from?.id;
        if (!userId) {
            return await ctx.reply(msgs.TgUnableGetUserInfoMsg);
        }
        try {
            const jwtList = await c.env.KV.get<string[]>(`${CONSTANTS.TG_KV_PREFIX}:${userId}`, 'json') || [];
            const { invalidJwtList } = await jwtListToAddressData(c, jwtList, msgs);
            const newJwtList = jwtList.filter(jwt => !invalidJwtList.includes(jwt));
            await c.env.KV.put(`${CONSTANTS.TG_KV_PREFIX}:${userId}`, JSON.stringify(newJwtList));
            const { addressList } = await jwtListToAddressData(c, newJwtList, msgs);
            return await ctx.reply(`${msgs.TgCleanSuccessMsg}\n\n`
                + `${msgs.TgCurrentAddressListMsg}\n\n`
                + addressList.map(a => `${msgs.TgAddressMsg} ${a}`).join("\n")
            );
        } catch (e) {
            return await ctx.reply(`${msgs.TgCleanFailedMsg} ${(e as Error).message}`);
        }
    });

    bot.command("lang", async (ctx: TgContext) => {
        const userId = ctx?.message?.from?.id;
        if (!userId) {
            const msgs = await getTgMessages(c, ctx);
            return await ctx.reply(msgs.TgUnableGetUserInfoMsg);
        }

        const msgs = await getTgMessages(c, ctx);

        // Check if user language config is enabled
        if (!getBooleanValue(c.env.TG_ALLOW_USER_LANG)) {
            return await ctx.reply(msgs.TgLangFeatureDisabledMsg);
        }

        // @ts-ignore
        const lang = ctx?.message?.text.slice("/lang".length).trim().toLowerCase();
        if (lang === 'zh' || lang === 'en') {
            await c.env.KV.put(`${CONSTANTS.TG_KV_PREFIX}:lang:${userId}`, lang);
            return await ctx.reply(`${msgs.TgLangSetSuccessMsg} ${lang === 'zh' ? '中文' : 'English'}`);
        }

        const currentLang = await c.env.KV.get(`${CONSTANTS.TG_KV_PREFIX}:lang:${userId}`);
        return await ctx.reply(
            `${msgs.TgCurrentLangMsg} ${currentLang || 'auto'}\n`
            + `${msgs.TgSelectLangMsg}\n`
            + `/lang zh - 中文\n`
            + `/lang en - English`
        );
    });

    const queryMail = async (ctx: TgContext, queryAddress: string, mailIndex: number, edit: boolean) => {
        const msgs = await getTgMessages(c, ctx);
        const userId = ctx?.message?.from?.id || ctx.callbackQuery?.message?.chat?.id;
        if (!userId) {
            return await ctx.reply(msgs.TgUnableGetUserInfoMsg);
        }
        const jwtList = await c.env.KV.get<string[]>(`${CONSTANTS.TG_KV_PREFIX}:${userId}`, 'json') || [];
        const { addressList, addressIdMap } = await jwtListToAddressData(c, jwtList, msgs);
        if (!queryAddress && addressList.length > 0) {
            queryAddress = addressList[0];
        }
        if (!(queryAddress in addressIdMap)) {
            return await ctx.reply(`${msgs.TgNotBoundAddressMsg} ${queryAddress}`);
        }
        const address_id = addressIdMap[queryAddress];
        const db_address_id = await c.env.DB.prepare(
            `SELECT id FROM address where id = ? `
        ).bind(address_id).first("id");
        if (!db_address_id) {
            return await ctx.reply(msgs.TgInvalidAddressMsg);
        }
        const mailRow = await c.env.DB.prepare(
            `SELECT * FROM raw_mails where address = ? `
            + ` order by id desc limit 1 offset ?`
        ).bind(
            queryAddress, mailIndex
        ).first<RawMailRow>();
        const raw = mailRow ? await resolveRawEmail(mailRow) : undefined;
        const mailId = mailRow?.id;
        const created_at = mailRow?.created_at;
        const { mail } = raw
            ? await parseMail(msgs, { rawEmail: raw }, queryAddress, created_at, false, mailRow?.metadata)
            : { mail: msgs.TgNoMoreMailsMsg };
        const settings = await c.env.KV.get<TelegramSettings>(CONSTANTS.TG_KV_SETTINGS_KEY, "json");
        const miniAppButtons = []
        if (settings?.miniAppUrl && settings?.miniAppUrl?.length > 0 && mailId) {
            const url = new URL(settings.miniAppUrl);
            url.pathname = "/telegram_mail"
            url.searchParams.set("mail_id", mailId);
            miniAppButtons.push(Markup.button.webApp(msgs.TgViewMailBtnMsg, url.toString()));
        }
        if (edit) {
            return await ctx.editMessageText(mail || msgs.TgNoMailMsg,
                {
                    ...Markup.inlineKeyboard([
                        Markup.button.callback(msgs.TgPrevBtnMsg, `mail_${queryAddress}_${mailIndex - 1}`, mailIndex <= 0),
                        ...miniAppButtons,
                        Markup.button.callback(msgs.TgNextBtnMsg, `mail_${queryAddress}_${mailIndex + 1}`, !raw),
                    ])
                },
            );
        }
        return await ctx.reply(mail || msgs.TgNoMailMsg,
            {
                ...Markup.inlineKeyboard([
                    Markup.button.callback(msgs.TgPrevBtnMsg, `mail_${queryAddress}_${mailIndex - 1}`, mailIndex <= 0),
                    ...miniAppButtons,
                    Markup.button.callback(msgs.TgNextBtnMsg, `mail_${queryAddress}_${mailIndex + 1}`, !raw),
                ])
            },
        );
    }

    bot.command("mails", async ctx => {
        const msgs = await getTgMessages(c, ctx);
        try {
            const queryAddress = ctx?.message?.text.slice("/mails".length).trim();
            return await queryMail(ctx, queryAddress, 0, false);
        } catch (e) {
            return await ctx.reply(`${msgs.TgGetMailFailedMsg} ${(e as Error).message}`);
        }
    });

    bot.on(callbackQuery("data"), async ctx => {
        const msgs = await getTgMessages(c, ctx);
        // Use ctx.callbackQuery.data
        try {
            const data = ctx.callbackQuery.data;
            if (data && data.startsWith("mail_") && data.split("_").length === 3) {
                const [_, queryAddress, mailIndex] = data.split("_");
                await queryMail(ctx, queryAddress, parseInt(mailIndex), true);
            }
        }
        catch (e) {
            console.log(`${msgs.TgGetMailFailedMsg} ${(e as Error).message}`, e);
            return await ctx.answerCbQuery(`${msgs.TgGetMailFailedMsg} ${(e as Error).message}`);
        }
        await ctx.answerCbQuery();
    });

    return bot;
}


export async function initTelegramBotCommands(c: Context<HonoCustomType>, bot: Telegraf) {
    await bot.telegram.setMyCommands(getTelegramCommands(c));
}

const parseMail = async (
    msgs: LocaleMessages,
    parsedEmailContext: ParsedEmailContext,
    address: string, created_at: string | undefined | null,
    chinese = false,
    aiExtract?: ExtractResult | string | null
) => {
    if (!parsedEmailContext.rawEmail) {
        return {};
    }
    try {
        const parsedEmail = await commonParseMail(parsedEmailContext);
        const parsedText = mailBody(parsedEmail?.text || "", parsedEmail?.html || "");
        const preview = parsedText.length > 1000
            ? parsedText.substring(0, 1000) + `\n\n...\n${msgs.TgMsgTooLongMsg}` : parsedText;
        const body = parsedText || msgs.TgParseFailedViewInAppMsg;
        const aiExtractBlock = formatAiExtractForTelegram(msgs, aiExtract);
        const header = chinese
            ? aiExtractBlock
                + `📩 新邮件\n━━━━━━━━━━━━━━\n`
                + `主题：${parsedEmail?.subject || "（无主题）"}\n`
                + `收件：${address}\n`
                + `发件：${parsedEmail?.sender || msgs.TgNoSenderMsg}\n`
                + (created_at ? `时间：${created_at}\n` : "")
                + `\n📄 邮件正文\n──────────────\n`
            : aiExtractBlock
                + `From: ${parsedEmail?.sender || msgs.TgNoSenderMsg}\n`
                + `To: ${address}\n`
                + (created_at ? `Date: ${created_at}\n` : "")
                + `Subject: ${parsedEmail?.subject || ""}\nContent:\n`;
        const footer = chinese ? `\n━━━━━━━━━━━━━━` : "";
        return {
            isHtml: false,
            header, body, footer,
            mail: header + (preview || msgs.TgParseFailedViewInAppMsg) + footer
        };
    } catch (e) {
        return {
            isHtml: false,
            mail: `${msgs.TgParseMailFailedMsg} ${(e as Error).message}`
        };
    }
}

async function sendBarkPush(env: Bindings, mail: {
    subject: string; sender: string; to: string; bodyText: string; html: string; text: string; snapshotUrl: string | null;
}, deviceKeys?: string[], pushUrl?: string) {
    try {
        const rawKeys = deviceKeys && deviceKeys.length
            ? deviceKeys
            : (env.BARK_DEVICE_KEYS || "").split(",");
        const keys = [...new Set(rawKeys.map(key => key.trim()).filter(Boolean))];
        if (!keys.length) return;
        const codeInfo = extractVerificationCodeWithSubject(mail.subject, mail.bodyText, mail.html, mail.text);
        const code = codeInfo.code;
        const params = new URLSearchParams({
            device_keys: keys.join(","),
            title: code ? `🔑 ${code}` : "📩 新邮件",
            subtitle: mail.sender || "未知",
            body: `主题：${mail.subject || "(无主题)"}\n收件：${mail.to}${code && mail.snapshotUrl ? `\n${mail.snapshotUrl}` : ""}`,
            level: "timeSensitive", group: "temp-mail", isArchive: "1",
        });
        if (code) {
            params.set("action", "alert");
            params.set("copy", code);
        } else if (mail.snapshotUrl) {
            params.set("url", mail.snapshotUrl);
        }
        const base = (pushUrl || DEFAULT_BARK_PUSH_URL).replace(/\/+$/, "").replace(/\/push$/, "");
        await fetch(`${base}/push?${params}`, { signal: AbortSignal.timeout(15000) });
    } catch (error) {
        console.error("bark push failed", error);
    }
}

export async function sendMailNotifications(
    c: Context<HonoCustomType>, address: string,
    parsedEmailContext: ParsedEmailContext,
    message_id: string | null,
    aiExtract?: ExtractResult | null
) {
    const settings = await c.env.KV?.get<TelegramSettings>(CONSTANTS.TG_KV_SETTINGS_KEY, "json");
    // 按域名解析推送目标：多个 TG bot / 多组 Bark 设备 keys（环境变量 + 网页配置合并）
    const push = resolvePushConfig(c.env, getMailDomain(address));
    let barkPushUrl = DEFAULT_BARK_PUSH_URL;
    try {
        const web = await getWebPushConfig(c);
        push.telegramTokens = [...new Set([...push.telegramTokens, ...web.telegramTokens])];
        push.barkKeys = [...new Set([...push.barkKeys, ...web.barkKeys])];
        barkPushUrl = web.barkPushUrl || DEFAULT_BARK_PUSH_URL;
    } catch (e) {
        console.error("load web push config failed", e);
    }

    // TG 目标预检（需要 KV 做地址绑定查询）
    let tgUserId: string | null = null;
    let tgGlobalList: string[] = [];
    if (push.telegramTokens.length && c.env.KV) {
        tgUserId = await c.env.KV.get(`${CONSTANTS.TG_KV_PREFIX}:${address}`);
        if (settings?.enableGlobalMailPush && settings?.globalMailPushList?.length) {
            tgGlobalList = settings.globalMailPushList;
        }
    }
    const wantBark = push.barkKeys.length > 0;
    const wantTg = !!(tgUserId || tgGlobalList.length);

    // 邮件快照只建一次，TG 和 Bark 共用；TTL 取网页配置（默认 24h）
    // 若该地址有绑定的固定快照，直接用绑定链接（内容已由 refreshBoundSnapshot 更新），不再新建一次性快照
    const snapshotTtl = await getSnapshotTtlSeconds(c).catch(() => 86400);
    let snapshotPromise: Promise<string | null> | null = null;
    let snapshotUrl: string | null = null;
    if (wantBark || wantTg) {
        try {
            const bound = await getSnapshotBinding(c, address).catch(() => null);
            if (bound?.url) {
                snapshotUrl = bound.url;
            } else {
                snapshotPromise = createMailSnapshot(c, settings, parsedEmailContext, snapshotTtl);
                snapshotUrl = await snapshotPromise;
            }
        } catch (error) {
            console.error("mail snapshot failed", error);
            snapshotPromise = null;
        }
    }

    const barkTask = wantBark ? (async () => {
        const parsed = await commonParseMail(parsedEmailContext);
        await sendBarkPush(c.env, {
            subject: parsed?.subject || "",
            sender: parsed?.sender || "",
            to: address,
            bodyText: mailBody(parsed?.text || "", parsed?.html || ""),
            html: parsed?.html || "",
            text: parsed?.text || "",
            snapshotUrl,
        }, push.barkKeys, barkPushUrl);
    })() : null;

    const tgTask = wantTg ? (async () => {
        const mailId = await c.env.DB.prepare(
            `SELECT id FROM raw_mails where address = ? and message_id = ?`
        ).bind(address, message_id).first<string>("id");
        for (const token of push.telegramTokens) {
            try {
            const bot = newTelegramBot(c, token);
            const buildAndSend = async (targetUserId: string, msgs: LocaleMessages, isGlobalPush = false) => {
        const createdAt = isGlobalPush
            ? new Date().toLocaleString("zh-CN", { timeZone: "Asia/Shanghai", hour12: false })
            : new Date().toUTCString();
        const { mail, header, body, footer } = await parseMail(msgs, parsedEmailContext, address, createdAt, isGlobalPush, aiExtract);
        if (!mail) return;
        const attachments = parsedEmailContext.parsedEmail?.attachments || [];
        const buttons = [];
        if (settings?.miniAppUrl && mailId) {
            const url = new URL(settings.miniAppUrl);
            url.pathname = "/telegram_mail"
            url.searchParams.set("mail_id", mailId);
            buttons.push(Markup.button.webApp(msgs.TgViewMailBtnMsg, url.toString()));
        }
        const fullMail = body === undefined ? mail : header + body + footer;
        // 若外层已有快照链接（绑定的固定链接），直接复用，不再新建
        snapshotPromise ??= snapshotUrl ? Promise.resolve(snapshotUrl) : createMailSnapshot(c, settings, parsedEmailContext, snapshotTtl);
        const snapshotUrl = await snapshotPromise;
        if (snapshotUrl) {
            const info = {
                chinese: isGlobalPush,
                subject: parsedEmailContext.parsedEmail?.subject || "",
                address,
                sender: parsedEmailContext.parsedEmail?.sender || "",
                createdAt,
                codeInfo: extractVerificationCodeWithSubject(
                    parsedEmailContext.parsedEmail?.subject || "",
                    body || "",
                    parsedEmailContext.parsedEmail?.html || "",
                    parsedEmailContext.parsedEmail?.text || ""
                ),
                snapshotUrl,
            };
            const compact = buildCompactMailMessage(info);
            await bot.telegram.sendMessage(targetUserId, compact.text, {
                entities: compact.entities,
                ...Markup.inlineKeyboard([...buttons])
            });
        } else {
            const parts = mailMessageParts(fullMail);
            for (const [index, part] of parts.entries()) {
                await bot.telegram.sendMessage(targetUserId, part.text, {
                    entities: part.entities,
                    ...(index === 0 ? Markup.inlineKeyboard([...buttons]) : {})
                });
            }
        }
        if (/https?:\/\/[^\s<>"']{3800}/i.test(fullMail)) {
            const form = new FormData();
            form.append("chat_id", targetUserId);
            form.append("document", new Blob([fullMail], { type: "text/plain;charset=utf-8" }), "完整邮件.txt");
            form.append("caption", "超长链接完整保存在原文文件中，可复制使用。");
            const response = await fetch(`https://api.telegram.org/bot${token}/sendDocument`, {
                method: "POST", body: form
            });
            if (!response.ok) throw new Error(`Telegram original mail upload failed: ${response.status}`);
        }
        // send attachments via native fetch (telegraf multipart upload is incompatible with CF Workers)
        if (getBooleanValue(c.env.ENABLE_TG_PUSH_ATTACHMENT) && attachments.length > 0) {
            const caption = isGlobalPush
                ? `发件人：${parsedEmailContext.parsedEmail?.sender || ""}\n主题：${parsedEmailContext.parsedEmail?.subject || ""}`
                : `From: ${parsedEmailContext.parsedEmail?.sender || ""}\nSubject: ${parsedEmailContext.parsedEmail?.subject || ""}`;
            await sendTelegramAttachments(token, targetUserId, attachments, caption);
        }
    };

        if (tgGlobalList.length) {
            const globalMsgs = i18n.getMessages(c.env.DEFAULT_LANG || 'zh');
            for (const pushId of tgGlobalList) {
                try {
                    await buildAndSend(pushId, globalMsgs, true);
                } catch (e) {
                    console.error(`tg push to ${pushId} failed`, e);
                }
            }
        }

        if (tgUserId) {
            try {
                const userMsgs = await getTgMessages(c, undefined, tgUserId);
                await buildAndSend(tgUserId, userMsgs);
            } catch (e) {
                console.error("tg push to bound user failed", e);
            }
        }
            } catch (e) {
                console.error("tg push via token failed", e);
            }
        }
    })() : null;

    // TG 与 Bark 同级并发推送，互不阻塞；一方失败不影响另一方
    const results = await Promise.allSettled(
        [barkTask, tgTask].filter((t): t is Promise<void> => !!t)
    );
    results.forEach((r, i) => {
        if (r.status === "rejected") {
            console.error(`push task ${i} failed`, r.reason);
        }
    });
}
