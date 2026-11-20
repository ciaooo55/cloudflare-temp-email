import { isMissingWorkerStoreTable, workerStore } from "../worker_store.ts";
import { addressParser } from "postal-mime";

import { CONSTANTS } from '../constants.ts';

const parseSenderAddresses = (headers: Headers): string[] => {
    try {
        const fromHeader = headers.get("From") || "";
        const senderAddresses = addressParser(fromHeader, { flatten: true })
            .map(sender => sender.address || "")
            .filter(Boolean);
        return senderAddresses;
    } catch (error) {
        console.error("Failed to parse sender addresses", error);
        return [];
    }
};

export type MailboxBlockRules = {
    mailboxDomainBlockList: { address: string; domain: string }[];
    blockedMailboxList: string[];
};

const normalizeMailbox = (value: unknown): string => {
    const address = typeof value === "string" ? value.trim().toLowerCase() : "";
    return /^[^\s@]+@[^\s@]+$/.test(address) ? address : "";
};

const normalizeDomain = (value: unknown): string => {
    const domain = typeof value === "string" ? value.trim().toLowerCase().replace(/^@/, "") : "";
    return domain.length <= 253 && domain.split(".").every(label =>
        /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label)) ? domain : "";
};

export const normalizeMailboxBlockRules = (value: Partial<MailboxBlockRules> | null): MailboxBlockRules => ({
    blockedMailboxList: Array.isArray(value?.blockedMailboxList)
        ? [...new Set(value.blockedMailboxList.map(normalizeMailbox).filter(Boolean))] : [],
    mailboxDomainBlockList: Array.isArray(value?.mailboxDomainBlockList)
        ? value.mailboxDomainBlockList.flatMap(rule => {
            const address = normalizeMailbox(rule?.address);
            const domain = normalizeDomain(rule?.domain);
            return address && domain ? [{ address, domain }] : [];
        }) : [],
});

export const getMailboxBlockRules = async (env: Bindings, promoteLegacy = true): Promise<MailboxBlockRules> => {
    if (!env.DB) return normalizeMailboxBlockRules(null);
    const rules = await workerStore(env).get<MailboxBlockRules>(CONSTANTS.EMAIL_MAILBOX_BLOCK_RULES, { type: 'json', promoteLegacy })
        .catch(async error => {
            if (!isMissingWorkerStoreTable(error)) throw error;
            return env.KV?.get<MailboxBlockRules>(CONSTANTS.EMAIL_MAILBOX_BLOCK_RULES, "json").catch(() => null);
        });
    return normalizeMailboxBlockRules(rules || null);
};

export const isMailboxBlocked = async (address: string, env: Bindings): Promise<boolean> =>
    (await getMailboxBlockRules(env)).blockedMailboxList.includes(address.trim().toLowerCase());

export const isBlockedForRecipient = async (
    message: Pick<ForwardableEmailMessage, "from" | "headers">,
    toAddress: string, env: Bindings, promoteLegacy = true
): Promise<boolean> => {
    const rules = await getMailboxBlockRules(env, promoteLegacy);
    const address = toAddress.trim().toLowerCase();
    if (rules.blockedMailboxList.includes(address)) return true;
    const domains = [message.from, ...parseSenderAddresses(message.headers)]
        .map(normalizeMailbox).filter(Boolean).map(sender => sender.split("@")[1]);
    return rules.mailboxDomainBlockList.some(rule => rule.address === address &&
        domains.some(domain => domain === rule.domain || domain.endsWith(`.${rule.domain}`)));
};

export const isBlocked = async (message: Pick<ForwardableEmailMessage, "from" | "headers">, env: Bindings, promoteLegacy = true): Promise<boolean> => {
    const senders = [message.from, ...parseSenderAddresses(message.headers)];
    if (env.BLACK_LIST && env.BLACK_LIST.split(",").some(word => senders.some(sender => sender.includes(word)))) {
        return true;
    }
    if (!env.DB) {
        return false;
    }
    const blockList = await workerStore(env).get<string[]>(CONSTANTS.EMAIL_KV_BLACK_LIST, { type: 'json', promoteLegacy })
        .catch(async error => {
            if (!isMissingWorkerStoreTable(error)) throw error;
            return env.KV?.get<string[]>(CONSTANTS.EMAIL_KV_BLACK_LIST, "json").catch(() => null);
        }) || [];
    if (blockList.some(word => senders.some(sender => sender.includes(word)))) {
        return true;
    }
    return false;
}
