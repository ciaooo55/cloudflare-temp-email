import { Context } from "hono";

import { getJsonSetting } from "../utils";
import { sendMailNotifications } from "../telegram_api";
import { auto_reply } from "./auto_reply";
import { isBlocked } from "./black_list";
import { triggerWebhook, triggerAnotherWorker, commonParseMail } from "../common";
import { check_if_junk_mail } from "./check_junk";
import { remove_attachment_if_need } from "./check_attachment";
import { extractEmailInfo } from "./ai_extract";
import { forwardEmail } from "./forward";
import { EmailRuleSettings } from "../models";
import { CONSTANTS } from "../constants";


async function getRecipient(message: ForwardableEmailMessage, env: Bindings): Promise<string> {
    const recipient = message.headers.get("X-Original-Recipient");
    const signature = message.headers.get("X-Original-Recipient-Signature");
    if (!env.BRIDGE_SECRET || !env.BRIDGE_DESTINATION ||
        message.to.toLowerCase() !== env.BRIDGE_DESTINATION.toLowerCase() ||
        !recipient ||
        !signature || !/^[0-9a-f]{64}$/i.test(signature)) {
        return message.to;
    }
    const key = await crypto.subtle.importKey(
        "raw", new TextEncoder().encode(env.BRIDGE_SECRET),
        { name: "HMAC", hash: "SHA-256" }, false, ["verify"]
    );
    const signatureBytes = Uint8Array.from(signature.match(/.{2}/g)!, byte => parseInt(byte, 16));
    return await crypto.subtle.verify("HMAC", key, signatureBytes, new TextEncoder().encode(recipient))
        ? recipient : message.to;
}

async function email(message: ForwardableEmailMessage, env: Bindings, ctx: ExecutionContext) {
    const recipient = await getRecipient(message, env);
    if (await isBlocked(message.from, env)) {
        message.setReject("Reject from address");
        console.log(`Reject message from ${message.from} to ${message.to}`);
        return;
    }
    const rawEmail = await new Response(message.raw).text();
    const parsedEmailContext: ParsedEmailContext = {
        rawEmail: rawEmail
    };

    // check if junk mail
    try {
        const is_junk = await check_if_junk_mail(env, recipient, parsedEmailContext, message.headers.get("Message-ID"));
        if (is_junk) {
            message.setReject("Junk mail");
            console.log(`Junk mail from ${message.from} to ${message.to}`);
            return;
        }
    } catch (error) {
        console.error("check junk mail error", error);
    }

    // check if unknown address mail
    try {
        const emailRuleSettings = await getJsonSetting<EmailRuleSettings>(
            { env: env } as Context<HonoCustomType>, CONSTANTS.EMAIL_RULE_SETTINGS_KEY
        );
        if (emailRuleSettings?.blockReceiveUnknowAddressEmail) {
            const db_address_id = await env.DB.prepare(
                `SELECT id FROM address where name = ? `
            ).bind(recipient).first("id");
            if (!db_address_id) {
                message.setReject("Unknown address");
                console.log(`Unknown address mail from ${message.from} to ${message.to}`);
                return;
            }
        }
    } catch (error) {
        console.error("check unknown address mail error", error);
    }

    // remove attachment if configured or size > 2MB
    try {
        await remove_attachment_if_need(env, parsedEmailContext, message.from, recipient, message.rawSize);
    } catch (error) {
        console.error("remove attachment error", error);
    }

    const message_id = message.headers.get("Message-ID");
    // save email
    try {
        const { success } = await env.DB.prepare(
            `INSERT INTO raw_mails (source, address, raw, message_id) VALUES (?, ?, ?, ?)`
        ).bind(
            message.from, recipient, parsedEmailContext.rawEmail, message_id
        ).run();
        if (!success) {
            message.setReject(`Failed save message to ${message.to}`);
            console.error(`Failed save message from ${message.from} to ${message.to}`);
        }
    }
    catch (error) {
        console.error("save email error", error);
    }

    // forward email
    await forwardEmail(message, env, recipient);

    // send mail notifications
    try {
        await sendMailNotifications(
            { env: env } as Context<HonoCustomType>,
            recipient, parsedEmailContext, message_id);
    } catch (error) {
        console.error("send mail notifications error", error);
    }

    // send webhook
    try {
        await triggerWebhook(
            { env: env } as Context<HonoCustomType>,
            recipient, parsedEmailContext, message_id
        );
    } catch (error) {
        console.error("send webhook error", error);
    }

    // trigger another worker
    try {
        const parsedEmail = (await commonParseMail(parsedEmailContext));
        const parsedText = parsedEmail?.text ?? ""
        const rpcEmail: RPCEmailMessage = {
            from: message.from,
            to: recipient,
            rawEmail: rawEmail,
            headers: message.headers
        }
        await triggerAnotherWorker({ env: env } as Context<HonoCustomType>, rpcEmail, parsedText);
    } catch (error) {
        console.error("trigger another worker error", error);
    }

    // auto reply email
    if (recipient === message.to) await auto_reply(message, env);

    // AI email content extraction
    await extractEmailInfo(parsedEmailContext, env, message_id, recipient);
}

export { email }
