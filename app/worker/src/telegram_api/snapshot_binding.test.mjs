import assert from "node:assert/strict";
import { test } from "node:test";
import {
    createMailSnapshot,
    createSnapshotBindingRecord,
    DEFAULT_SNAPSHOT_TTL,
    deleteSnapshotBinding,
    getSnapshotBinding,
    listSnapshotBindingRecords,
    refreshBoundSnapshot,
    snapshotBindKey,
    snapshotBindRevKey,
    SNAPSHOT_KV_EDGE_TTL,
    SNAPSHOT_BIND_DELETED,
    SNAPSHOT_BIND_TOMBSTONE_TTL,
} from "./mail_snapshot.ts";

function makeKv() {
    const store = new Map(); // key -> { value, expiresAtMs|null }
    return {
        store,
        async get(key, type) {
            const e = store.get(key);
            if (!e) return null;
            if (e.expiresAtMs && e.expiresAtMs <= Date.now()) { store.delete(key); return null; }
            const t = typeof type === "object" && type !== null ? type.type : type;
            if (t === "json") return JSON.parse(e.value);
            return e.value;
        },
        async put(key, value, opts = {}) {
            let expiresAtMs = null;
            if (opts.expiration) expiresAtMs = opts.expiration * 1000;
            else if (opts.expirationTtl) expiresAtMs = Date.now() + opts.expirationTtl * 1000;
            store.set(key, { value: typeof value === "string" ? value : String(value), expiresAtMs, ttl: opts.expirationTtl || null });
        },
        async delete(key) { store.delete(key); },
        async list({ prefix }) {
            return { keys: [...store.keys()].filter(k => k.startsWith(prefix)).map(name => ({ name })) };
        },
    };
}

const ctx = kv => ({ env: { KV: kv, SNAPSHOT_BASE_URL: "https://snap.example.com" } });
const mailCtx = (html, subject = "hi") => ({ parsedEmail: { html, text: "", subject } });

test("createSnapshotBindingRecord writes binding, reverse index and placeholder", async () => {
    const kv = makeKv();
    const b = await createSnapshotBindingRecord(ctx(kv), "User@Example.com", 48, "https://snap.example.com");
    assert.equal(b.address, "user@example.com");
    assert.match(b.url, /^https:\/\/snap\.example\.com\/m\/[0-9a-f]{64}$/);
    assert.equal(b.expiresAt - b.createdAt, 48 * 3600 * 1000);

    const stored = await kv.get(snapshotBindKey("user@example.com"), "json");
    assert.equal(stored.token, b.token);
    assert.equal(await kv.get(snapshotBindRevKey(b.token)), "user@example.com");

    // 占位 HTML 按绑定时长存活（48h），不受普通快照 TTL 限制
    const htmlEntry = kv.store.get(`mailhtml:${b.token}`);
    assert.ok(htmlEntry);
    assert.equal(htmlEntry.ttl, 48 * 3600);
    assert.match(htmlEntry.value, /等待第一封新邮件/);
});

test("refreshBoundSnapshot overwrites content and lives for the binding duration", async () => {
    const kv = makeKv();
    const b = await createSnapshotBindingRecord(ctx(kv), "a@example.com", 24 * 7, "https://snap.example.com");
    const url = await refreshBoundSnapshot(ctx(kv), "a@example.com", mailCtx("<p>code 123456</p>"), 3600);
    assert.equal(url, b.url);
    const htmlEntry = kv.store.get(`mailhtml:${b.token}`);
    assert.match(htmlEntry.value, /code 123456/);
    // 绑定 7 天：快照 TTL 应接近 7 天，而不是被普通 TTL（这里传入 3600）截断
    assert.ok(htmlEntry.ttl > 6 * 24 * 3600, `ttl=${htmlEntry.ttl} should follow binding duration`);
});

test("rebinding the same address kills the old URL", async () => {
    const kv = makeKv();
    const c = ctx(kv);
    const b1 = await createSnapshotBindingRecord(c, "a@example.com", 24, "https://snap.example.com");
    const b2 = await createSnapshotBindingRecord(c, "a@example.com", 24, "https://snap.example.com");
    assert.notEqual(b1.token, b2.token);

    // 旧 token 的三处全部删除
    assert.equal(await kv.get(snapshotBindRevKey(b1.token)), SNAPSHOT_BIND_DELETED);
    assert.equal(kv.store.get(`mailhtml:${b1.token}`), undefined);
    // 正向绑定指向新 token
    const cur = await kv.get(snapshotBindKey("a@example.com"), "json");
    assert.equal(cur.token, b2.token);
    // 旧 token 不再能解析出绑定
    assert.equal(await getSnapshotBinding(c, "a@example.com").then(x => x.token), b2.token);
});

test("expired binding is cleaned on read and returns null", async () => {
    const kv = makeKv();
    const c = ctx(kv);
    const b = await createSnapshotBindingRecord(c, "a@example.com", 1, "https://snap.example.com");
    // 人为调过期
    const stored = await kv.get(snapshotBindKey("a@example.com"), "json");
    stored.expiresAt = Date.now() - 1000;
    await kv.put(snapshotBindKey("a@example.com"), JSON.stringify(stored));

    assert.equal(await getSnapshotBinding(c, "a@example.com"), null);
    assert.equal(await kv.get(snapshotBindKey("a@example.com"), "json"), null);
    assert.equal(await kv.get(snapshotBindRevKey(b.token)), SNAPSHOT_BIND_DELETED);
    assert.equal(kv.store.get(`mailhtml:${b.token}`), undefined);
});

test("deleteSnapshotBinding removes binding, reverse index and html", async () => {
    const kv = makeKv();
    const c = ctx(kv);
    const b = await createSnapshotBindingRecord(c, "a@example.com", 24, "https://snap.example.com");
    await deleteSnapshotBinding(c, "a@example.com");
    assert.equal(await kv.get(snapshotBindKey("a@example.com"), "json"), null);
    assert.equal(await kv.get(snapshotBindRevKey(b.token)), SNAPSHOT_BIND_DELETED);
    assert.equal(kv.store.get(`mailhtml:${b.token}`), undefined);
});

test("delete tombstone has short ttl and does not block rebinding", async () => {
    const kv = makeKv();
    const c = ctx(kv);
    const b1 = await createSnapshotBindingRecord(c, "a@example.com", 24, "https://snap.example.com");
    await deleteSnapshotBinding(c, "a@example.com");
    // 删除标记是短 TTL，不是永久残留
    const tomb = kv.store.get(snapshotBindRevKey(b1.token));
    assert.equal(tomb.value, SNAPSHOT_BIND_DELETED);
    assert.equal(tomb.ttl, SNAPSHOT_BIND_TOMBSTONE_TTL);
    // 同一地址重新绑定不受旧 token 删除标记影响
    const b2 = await createSnapshotBindingRecord(c, "a@example.com", 24, "https://snap.example.com");
    assert.notEqual(b1.token, b2.token);
    assert.equal(await kv.get(snapshotBindRevKey(b2.token)), "a@example.com");
    assert.equal((await getSnapshotBinding(c, "a@example.com")).token, b2.token);
});

test("listSnapshotBindingRecords skips and cleans expired bindings", async () => {
    const kv = makeKv();
    const c = ctx(kv);
    const good = await createSnapshotBindingRecord(c, "good@example.com", 24, "https://snap.example.com");
    const bad = await createSnapshotBindingRecord(c, "bad@example.com", 24, "https://snap.example.com");
    const storedBad = await kv.get(snapshotBindKey("bad@example.com"), "json");
    storedBad.expiresAt = Date.now() - 1000;
    await kv.put(snapshotBindKey("bad@example.com"), JSON.stringify(storedBad));

    const list = await listSnapshotBindingRecords(c);
    assert.equal(list.length, 1);
    assert.equal(list[0].token, good.token);
    // 过期项被顺手清理
    assert.equal(await kv.get(snapshotBindKey("bad@example.com"), "json"), null);
    assert.equal(await kv.get(snapshotBindRevKey(bad.token)), SNAPSHOT_BIND_DELETED);
});

test("createMailSnapshot honors a custom ttl", async () => {
    const kv = makeKv();
    const url = await createMailSnapshot(ctx(kv), null, mailCtx("<p>x</p>"), 7200);
    const token = url.split("/m/")[1];
    assert.match(token, /^[0-9a-f]{64}$/);
    assert.equal(kv.store.get(`mailhtml:${token}`).ttl, 7200);
});

test("createMailSnapshot defaults to 24h", async () => {
    const kv = makeKv();
    const url = await createMailSnapshot(ctx(kv), null, mailCtx("<p>x</p>"));
    const token = url.split("/m/")[1];
    assert.equal(kv.store.get(`mailhtml:${token}`).ttl, DEFAULT_SNAPSHOT_TTL);
    assert.equal(DEFAULT_SNAPSHOT_TTL, 86400);
});

test("snapshot KV reads use short edge cache ttl (prompt refresh/invalidation)", async () => {
    // KV.get 默认边缘缓存 60 秒会导致更换链接/新邮件延迟可见；
    // 快照热路径读取必须带 cacheTtl（文档最小 30），否则回归旧延迟。
    assert.equal(SNAPSHOT_KV_EDGE_TTL, 30);
    const seen = [];
    const base = (() => {
        const kv = (function makeKv() {
            const store = new Map();
            return {
                store,
                async get(key, type) {
                    seen.push([key, type]);
                    const e = store.get(key);
                    if (!e) return null;
                    const t = typeof type === "object" && type !== null ? type.type : type;
                    if (t === "json") return JSON.parse(e.value);
                    return e.value;
                },
                async put(key, value, opts = {}) { store.set(key, { value, opts }); },
                async delete(key) { store.delete(key); },
            };
        })();
        return kv;
    })();
    const c = { env: { KV: base }, executionCtx: { waitUntil() {} } };
    const b = await createSnapshotBindingRecord(c, "ttl@example.com", 24, "https://snap.example.com");
    await refreshBoundSnapshot(c, "ttl@example.com", { parsedEmail: { html: "<p>new</p>", text: "t", subject: "s" } });
    await getSnapshotBinding(c, "ttl@example.com");
    await deleteSnapshotBinding(c, "ttl@example.com", b.token);
    const reads = seen.filter(([k]) => k.startsWith("snapshot-bind:") || k.startsWith("snapshot-bindrev:"));
    assert.ok(reads.length > 0, "expected snapshot KV reads");
    for (const [key, type] of reads) {
        assert.equal(typeof type, "object", `KV.get(${key}) should pass options object`);
        assert.equal(type.cacheTtl, SNAPSHOT_KV_EDGE_TTL, `KV.get(${key}) cacheTtl`);
    }
});
