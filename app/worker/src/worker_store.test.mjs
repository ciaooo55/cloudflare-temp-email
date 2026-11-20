import assert from "node:assert/strict";
import { test } from "node:test";
import { createD1 } from "../test-loader/d1.mjs";
import dbApi from "./admin_api/db_api.ts";
import { CONSTANTS } from "./constants.ts";
import { getStoreImportStatus, importStorePage, workerStore } from "./worker_store.ts";

async function setup() {
    const DB = createD1();
    const c = { env: { DB }, json: value => value };
    await dbApi.initialize(c);
    return { DB, c };
}

test("existing database migration installs the resumable store and daily budget tables", async () => {
    const DB = createD1();
    DB.sqlite.exec("CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT, updated_at TEXT)");
    DB.sqlite.prepare("INSERT INTO settings (key, value) VALUES (?, ?)").run(CONSTANTS.DB_VERSION_KEY, "v0.0.9");
    const c = { env: { DB }, json: value => value };
    assert.equal((await dbApi.migrate(c)).message, "Database migrated");
    assert.deepEqual((await dbApi.getStorageStatus(c)).budget.usage, { row_reads: 0, row_writes: 0, inbound_emails: 0 });
});

test("KV import resumes from D1 and preserves newer writes, tombstones and legacy expiry", async () => {
    const { DB } = await setup();
    const expires = Math.floor(Date.now() / 1000) + 600;
    const htmlKey = "mailhtml:old";
    const live = "snapshot-bind:live@example.com";
    const removed = "snapshot-bind:deleted@example.com";
    const seen = [];
    const oldValues = new Map([[htmlKey, "legacy html"], [live, "legacy live"], [removed, "legacy deleted"]]);
    const KV = {
        async get(key) { return oldValues.get(key) ?? null; },
        async list({ cursor, limit }) {
            seen.push(cursor);
            assert.equal(limit, 5);
            return cursor === undefined
                ? { keys: [], list_complete: false, cursor: "next" }
                : { keys: [...oldValues.keys()].map(name => ({ name, expiration: expires })), list_complete: true };
        },
    };
    const env = { DB, KV };
    assert.equal(await workerStore(env).get(htmlKey), "legacy html");
    assert.deepEqual(await importStorePage(env), { complete: false, scanned: 0 });
    assert.deepEqual(await getStoreImportStatus(env), { complete: false, cursor: "next" });
    await workerStore(env).put(live, "new D1 value");
    await workerStore(env).delete(removed);
    assert.deepEqual(await importStorePage({ ...env }), { complete: true, scanned: 3 });
    assert.deepEqual(seen, [undefined, "next"]);
    assert.equal(DB.sqlite.prepare("SELECT expires_at FROM worker_store WHERE key = ?").get(htmlKey).expires_at, expires * 1000);
    assert.equal(await workerStore({ DB }).get(htmlKey), "legacy html");
    assert.equal(await workerStore({ DB }).get(live), "new D1 value");
    assert.equal(await workerStore({ DB }).get(removed), null);
    assert.deepEqual((await workerStore({ DB }).list({ prefix: "snapshot-bind:" })).keys.map(key => key.name), [live]);
    KV.get = () => { throw new Error("KV must not be used after import"); };
    assert.equal(await workerStore(env).get("snapshot-bind:missing@example.com"), null);
    assert.deepEqual(await importStorePage(env), { complete: true, scanned: 0 });
});

test("chunked D1 values preserve Unicode on updates and when extending expiry", async () => {
    const { DB } = await setup();
    const store = workerStore({ DB });
    const value = "中文🙂".repeat(80_000);
    await store.put("mailhtml:big", value, { expirationTtl: 60 });
    await store.setExpiry("mailhtml:big", null);
    assert.equal(await store.get("mailhtml:big"), value);
    await store.put("mailhtml:big", "small");
    assert.equal(await store.get("mailhtml:big"), "small");
    assert.equal(DB.sqlite.prepare("SELECT count(*) AS n FROM worker_store_chunk").get().n, 0);
});
