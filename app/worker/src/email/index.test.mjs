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

test("blacklisted mail leaves the usage ledger and legacy store untouched", async () => {
    for (const source of ["env", "D1", "KV"]) {
        const DB = createD1();
        DB.sqlite.exec(WORKER_STORE_SCHEMA + USAGE_BUDGET_SCHEMA);
        const list = JSON.stringify(["sender@example.com"]);
        if (source === "D1") {
            DB.sqlite.prepare("INSERT INTO worker_store (key, value) VALUES (?, ?)").run(CONSTANTS.EMAIL_KV_BLACK_LIST, list);
        }
        const before = DB.sqlite.prepare("SELECT * FROM worker_store").all();
        const env = {
            DB,
            BLACK_LIST: source === "env" ? "sender@example.com" : undefined,
            KV: source === "KV" ? { async get() { return list; } } : undefined,
        };
        assert.deepEqual(await deliver(env), ["Reject from address"]);
        assert.equal(DB.sqlite.prepare("SELECT COUNT(*) AS n FROM worker_usage_day").get().n, 0);
        assert.deepEqual(DB.sqlite.prepare("SELECT * FROM worker_store").all(), before);
    }
});

test("recipient-blocked mail leaves the usage ledger and legacy store untouched", async () => {
    for (const source of ["D1", "KV"]) {
        for (const rules of [
            { blockedMailboxList: ["inbox@example.com"] },
            { mailboxDomainBlockList: [{ address: "inbox@example.com", domain: "example.com" }] },
        ]) {
            const DB = createD1();
            DB.sqlite.exec(WORKER_STORE_SCHEMA + USAGE_BUDGET_SCHEMA);
            const value = JSON.stringify(rules);
            if (source === "D1") {
                DB.sqlite.prepare("INSERT INTO worker_store (key, value) VALUES (?, ?)")
                    .run(CONSTANTS.EMAIL_MAILBOX_BLOCK_RULES, value);
            }
            const before = DB.sqlite.prepare("SELECT * FROM worker_store").all();
            const KV = { async get(key) { return key === CONSTANTS.EMAIL_MAILBOX_BLOCK_RULES ? value : null; } };
            assert.deepEqual(await deliver({ DB, KV }), ["Reject blocked mailbox or sender domain"]);
            assert.equal(DB.sqlite.prepare("SELECT COUNT(*) AS n FROM worker_usage_day").get().n, 0);
            assert.deepEqual(DB.sqlite.prepare("SELECT * FROM worker_store").all(), before);
        }
    }
});

test("admitted mail still promotes the legacy KV blacklist", async () => {
    const DB = createD1();
    DB.sqlite.exec(WORKER_STORE_SCHEMA + USAGE_BUDGET_SCHEMA);
    DB.sqlite.exec("CREATE TABLE raw_mails (source TEXT, address TEXT, raw TEXT, message_id TEXT); CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT);");
    const list = JSON.stringify(["other@example.com"]);
    const KV = { async get(key) { return key === CONSTANTS.EMAIL_KV_BLACK_LIST ? list : null; } };
    await deliver({ DB, KV });
    assert.equal(DB.sqlite.prepare("SELECT value FROM worker_store WHERE key = ?").get(CONSTANTS.EMAIL_KV_BLACK_LIST).value, list);
    assert.equal(DB.sqlite.prepare("SELECT inbound_emails FROM worker_usage_day").get().inbound_emails, 1);
});

test("D1 blacklist reads are cached across admission and repeated deliveries", async () => {
    for (const blacklist of [[], ["other@example.com"], ["sender@example.com"]]) {
        const DB = createD1();
        DB.sqlite.exec(WORKER_STORE_SCHEMA + USAGE_BUDGET_SCHEMA);
        DB.sqlite.exec("CREATE TABLE raw_mails (source TEXT, address TEXT, raw TEXT, message_id TEXT); CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT);");
        DB.sqlite.prepare("INSERT INTO worker_store (key, value) VALUES (?, ?)")
            .run(CONSTANTS.EMAIL_KV_BLACK_LIST, JSON.stringify(blacklist));
        const prepare = DB.prepare;
        let blacklistReads = 0;
        DB.prepare = sql => {
            const statement = prepare(sql);
            if (/SELECT .*FROM worker_store WHERE key = \?/s.test(sql)) {
                const bind = statement.bind;
                statement.bind = (...values) => {
                    if (values[0] === CONSTANTS.EMAIL_KV_BLACK_LIST) blacklistReads++;
                    return bind(...values);
                };
            }
            return statement;
        };
        const expected = blacklist.includes("sender@example.com") ? ["Reject from address"] : [];
        assert.deepEqual(await deliver({ DB }), expected);
        assert.equal(blacklistReads, 1);
        assert.deepEqual(await deliver({ DB }), expected);
        assert.equal(blacklistReads, 1);
    }
});
