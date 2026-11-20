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
