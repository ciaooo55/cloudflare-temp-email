import { Context } from "hono";

import { getJsonSetting, normalizeAddressDomain } from '../utils.ts';
import { sendMailNotifications } from '../telegram_api/index.ts';
import { refreshBoundSnapshot } from '../telegram_api/mail_snapshot.ts';
import { isBlocked } from './black_list.ts';
import { triggerWebhook, triggerAnotherWorker, commonParseMail } from '../common.ts';
import { checkIfJunkMail } from './check_junk.ts';
import { removeAttachmentIfNeed } from './check_attachment.ts';
import { extractEmailInfo } from './ai_extract.ts';
import { EmailRuleSettings } from '../models/index.ts';
import { CONSTANTS } from '../constants.ts';
import { storeRawMail } from './storage.ts';


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
    const toAddress = normalizeAddressDomain(recipient);
    if (await isBlocked(message, env)) {
        message.setReject("Reject from address");
        console.log(`Reject message from ${message.from} to ${toAddress}`);
        return;
    }
    const rawEmail = await new Response(message.raw).text();
    const parsedEmailContext: ParsedEmailContext = {
        rawEmail: rawEmail
    };

    // check if junk mail
    try {
        const is_junk = await checkIfJunkMail(env, toAddress, parsedEmailContext, message.headers.get("Message-ID"));
        if (is_junk) {
            message.setReject("Junk mail");
            console.log(`Junk mail from ${message.from} to ${toAddress}`);
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
            ).bind(toAddress).first("id");
            if (!db_address_id) {
                message.setReject("Unknown address");
                console.log(`Unknown address mail from ${message.from} to ${toAddress}`);
                return;
            }
        }
    } catch (error) {
        console.error("check unknown address mail error", error);
    }

    // remove attachment if configured or size > 2MB
    try {
        await removeAttachmentIfNeed(env, parsedEmailContext, message.from, toAddress, message.rawSize);
    } catch (error) {
        console.error("remove attachment error", error);
    }

    const message_id = message.headers.get("Message-ID");
    // save email
    let storedMailId: number | undefined;
    try {
        const { success, meta } = await storeRawMail(
            env, message.from, toAddress, message_id, parsedEmailContext.rawEmail
        );
        if (!success) {
            message.setReject(`Failed save message to ${toAddress}`);
            console.error(`Failed save message from ${message.from} to ${toAddress}`);
            return;
        }
        storedMailId = meta.last_row_id;
    } catch (error) {
        console.error("save email error", error);
        message.setReject(`Failed save message to ${toAddress}`);
        return;
    }

    // AI email content extraction
    const aiExtractResult = await extractEmailInfo(parsedEmailContext, env, message_id, toAddress);

    // Parse email content BEFORE notifications (snapshot/TG/Bark need parsedEmail)
    try {
        const parsed = await commonParseMail(parsedEmailContext);
        if (parsed) {
            parsedEmailContext.parsedEmail = parsed;
        }
    } catch (error) {
        console.error("parse email for notifications error", error);
    }

    // bound snapshot: overwrite the fixed snapshot url with the newest mail
    try {
        await refreshBoundSnapshot(
            { env: env } as Context<HonoCustomType>,
            toAddress, parsedEmailContext);
    } catch (error) {
        console.error("refresh bound snapshot error", error);
    }

    // send mail notifications
    try {
        await sendMailNotifications(
            { env: env } as Context<HonoCustomType>,
            toAddress, parsedEmailContext, message_id, aiExtractResult);
    } catch (error) {
        console.error("send mail notifications error", error);
    }

    // send webhook
    try {
        await triggerWebhook(
            { env: env } as Context<HonoCustomType>,
            toAddress, parsedEmailContext, storedMailId, aiExtractResult
        );
    } catch (error) {
        console.error("send webhook error", error);
    }

    // trigger another worker
    try {
        // parsedEmail is already cached in parsedEmailContext by commonParseMail;
        // reuse it instead of calling commonParseMail again.
        const parsedText = parsedEmailContext.parsedEmail?.text ?? ""
        const rpcEmail: RPCEmailMessage = {
            from: message.from,
            to: toAddress,
            rawEmail: rawEmail,
            headers: message.headers
        }
        await triggerAnotherWorker({ env: env } as Context<HonoCustomType>, rpcEmail, parsedText);
    } catch (error) {
        console.error("trigger another worker error", error);
    }
}

export { email }
