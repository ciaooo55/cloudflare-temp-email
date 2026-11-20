import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { test } from "node:test";
import { createD1 } from "../../test-loader/d1.mjs";
import { CONSTANTS } from "../constants.ts";
import { USAGE_BUDGET_SCHEMA } from "../usage_budget.ts";
import { WORKER_STORE_SCHEMA } from "../worker_store.ts";
const hooks = registerHooks({
    resolve(specifier, context, next) {
        if (specifier === "../telegram_api/index.ts" && context.parentURL === new URL("./index.ts", import.meta.url).href) {
            return { url: "data:text/javascript,export function sendMailNotifications() { throw new Error('Unexpected notification'); }", shortCircuit: true };
        }
        return next(specifier, context);
    },
});
const { email } = await import("./index.ts");
hooks.deregister();

const raw = "From: sender@example.com\r\nTo: inbox@example.com\r\n\r\nTest mail";

async function deliver(env) {
    const rejected = [];
    await email({
        from: "sender@example.com",
        to: "inbox@example.com",
        headers: new Headers({ "Message-ID": "<rollout@example.com>" }),
        raw: new Response(raw).body,
        rawSize: raw.length,
        setReject: reason => rejected.push(reason),
    }, env, {});
    return rejected;
}

test("mail remains writable before or during migration, even with zero configured budget", async () => {
    const schemas = ["", WORKER_STORE_SCHEMA, USAGE_BUDGET_SCHEMA];
    for (const schema of schemas) {
        const DB = createD1();
        DB.sqlite.exec("CREATE TABLE raw_mails (source TEXT, address TEXT, raw TEXT, message_id TEXT); CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT);" + schema);
        const env = { DB, D1_DAILY_WRITE_HARD_LIMIT: "0" };
        assert.deepEqual(await deliver(env), []);
        assert.deepEqual({ ...DB.sqlite.prepare("SELECT raw, address FROM raw_mails").get() }, { raw, address: "inbox@example.com" });
    }
});

test("mail still checks the legacy KV blacklist before D1 migration", async () => {
    const DB = createD1();
    const KV = { async get(key) { return key === CONSTANTS.EMAIL_KV_BLACK_LIST ? ["sender@example.com"] : null; } };
    assert.deepEqual(await deliver({ DB, KV }), ["Reject from address"]);
});
