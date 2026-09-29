import assert from "node:assert/strict";
import { test, afterEach } from "node:test";
import notifyApi, { getSnapshotTtlSeconds, getWebPushConfig, DEFAULT_BARK_PUSH_URL } from "./notify_settings.ts";
import { createSnapshotBindingRecord, refreshBoundSnapshot, getSnapshotBinding } from "../telegram_api/mail_snapshot.ts";

// ---------- mock 基础设施 ----------
function makeKv() {
    const store = new Map();
    return {
        store,
        async get(key, type) {
            const e = store.get(key);
            if (!e) return null;
            if (e.expiresAtMs && e.expiresAtMs <= Date.now()) { store.delete(key); return null; }
            if (type === "json") return JSON.parse(e.value);
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

function makeDb(existingAddresses = []) {
    const settings = new Map();
    const addresses = new Set(existingAddresses.map(a => a.toLowerCase()));
    return {
        prepare(sql) {
            return {
                bind(...args) {
                    const run = async () => {
                        if (/INSERT or REPLACE INTO settings/i.test(sql)) settings.set(args[0], args[1]);
                        if (/DELETE FROM settings/i.test(sql)) settings.delete(args[0]);
                        return { success: true };
                    };
                    const first = async (col) => {
                        if (/FROM settings/i.test(sql)) {
                            const v = settings.get(args[0]);
                            return v == null ? null : (col ? v : { value: v });
                        }
                        if (/FROM address/i.test(sql)) {
                            return addresses.has(String(args[0]).toLowerCase()) ? 1 : null;
                        }
                        return null;
                    };
                    return { run, first, all: async () => [] };
                },
            };
        },
    };
}

function makeCtx({ kv, db, body = null, params = {}, url = "https://mail.example.com/admin/x", envExtra = {} } = {}) {
    return {
        env: { KV: kv, DB: db, SNAPSHOT_BASE_URL: "https://snap.example.com", ...envExtra },
        req: {
            json: async () => { if (body === null) throw new Error("no body"); return body; },
            param: (k) => params[k] || "",
            url,
        },
        json: (obj, status = 200) => new Response(JSON.stringify(obj), {
            status, headers: { "Content-Type": "application/json" },
        }),
    };
}

const bodyOf = async (res) => ({ status: res.status, data: await res.json() });
const realFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = realFetch; });

// ---------- TG Bots ----------
test("TG bots: 增删改查全流程", async () => {
    const kv = makeKv(), db = makeDb();
    let r = await bodyOf(await notifyApi.listTelegramBots(makeCtx({ kv, db })));
    assert.equal(r.data.length, 0);

    // 无 token 拒绝
    r = await bodyOf(await notifyApi.createTelegramBot(makeCtx({ kv, db, body: { name: "b1", token: " " } })));
    assert.equal(r.status, 400);

    r = await bodyOf(await notifyApi.createTelegramBot(makeCtx({ kv, db, body: { name: "b1", token: "123456:AA secret-token" } })));
    assert.equal(r.data.success, true);
    const id = r.data.id;
    assert.ok(id);

    r = await bodyOf(await notifyApi.listTelegramBots(makeCtx({ kv, db })));
    assert.equal(r.data.length, 1);
    assert.equal(r.data[0].maskedToken, "123456:***");
    assert.ok(!JSON.stringify(r.data).includes("secret-token"), "token 明文不能出现在列表里");

    // 停用后 getWebPushConfig 排除
    r = await bodyOf(await notifyApi.updateTelegramBot(makeCtx({ kv, db, body: { enabled: false }, params: { id } })));
    assert.equal(r.data.success, true);
    assert.deepEqual((await getWebPushConfig(makeCtx({ kv, db }))).telegramTokens, []);

    // 启用后纳入推送
    await notifyApi.updateTelegramBot(makeCtx({ kv, db, body: { enabled: true }, params: { id } }));
    assert.deepEqual((await getWebPushConfig(makeCtx({ kv, db }))).telegramTokens, ["123456:AA secret-token"]);

    // 改名
    await notifyApi.updateTelegramBot(makeCtx({ kv, db, body: { name: "b1-renamed" }, params: { id } }));
    r = await bodyOf(await notifyApi.listTelegramBots(makeCtx({ kv, db })));
    assert.equal(r.data[0].name, "b1-renamed");

    // 404 路径
    r = await bodyOf(await notifyApi.updateTelegramBot(makeCtx({ kv, db, body: { enabled: true }, params: { id: "nope" } })));
    assert.equal(r.status, 404);

    // 删除
    r = await bodyOf(await notifyApi.deleteTelegramBot(makeCtx({ kv, db, params: { id } })));
    assert.equal(r.data.success, true);
    r = await bodyOf(await notifyApi.listTelegramBots(makeCtx({ kv, db })));
    assert.equal(r.data.length, 0);
    r = await bodyOf(await notifyApi.deleteTelegramBot(makeCtx({ kv, db, params: { id } })));
    assert.equal(r.status, 404);
});

test("TG bot: 测试接口 getMe + 发送测试消息", async () => {
    const kv = makeKv(), db = makeDb();
    const { data } = await bodyOf(await notifyApi.createTelegramBot(makeCtx({ kv, db, body: { token: "111:tok" } })));
    const calls = [];
    globalThis.fetch = async (url, init) => {
        calls.push(url);
        const okJson = (o) => ({ ok: true, json: async () => o });
        if (url.endsWith("/getMe")) return okJson({ ok: true, result: { username: "mytestbot" } });
        if (url.endsWith("/sendMessage")) {
            const b = JSON.parse(init.body);
            assert.equal(b.chat_id, "999");
            return okJson({ ok: true });
        }
        throw new Error("unexpected " + url);
    };
    let r = await bodyOf(await notifyApi.testTelegramBot(makeCtx({ kv, db, body: {}, params: { id: data.id } })));
    assert.equal(r.data.ok, true);
    assert.equal(r.data.username, "mytestbot");
    assert.equal(r.data.messageSent, false);

    r = await bodyOf(await notifyApi.testTelegramBot(makeCtx({ kv, db, body: { chatId: "999" }, params: { id: data.id } })));
    assert.equal(r.data.ok, true);
    assert.equal(r.data.messageSent, true);
    assert.equal(calls.length, 3);

    // 无效 token
    globalThis.fetch = async () => ({ ok: true, json: async () => ({ ok: false, description: "Unauthorized" }) });
    r = await bodyOf(await notifyApi.testTelegramBot(makeCtx({ kv, db, body: {}, params: { id: data.id } })));
    assert.equal(r.data.ok, false);
    assert.match(r.data.error, /Unauthorized/);

    // 网络异常
    globalThis.fetch = async () => { throw new Error("dns fail"); };
    r = await bodyOf(await notifyApi.testTelegramBot(makeCtx({ kv, db, body: {}, params: { id: data.id } })));
    assert.equal(r.data.ok, false);
    assert.match(r.data.error, /dns fail/);

    // 不存在的 bot
    r = await bodyOf(await notifyApi.testTelegramBot(makeCtx({ kv, db, body: {}, params: { id: "nope" } })));
    assert.equal(r.status, 404);
});

test("TG bot: 独立 webhook 设置", async () => {
    const kv = makeKv(), db = makeDb();
    const { data } = await bodyOf(await notifyApi.createTelegramBot(makeCtx({ kv, db, body: { token: "222:tok" } })));
    let seenUrl = null, seenBody = null;
    globalThis.fetch = async (url, init) => {
        seenUrl = url; seenBody = JSON.parse(init.body);
        return { ok: true, json: async () => ({ ok: true }) };
    };
    const r = await bodyOf(await notifyApi.setTelegramBotWebhook(
        makeCtx({ kv, db, body: {}, params: { id: data.id }, url: "https://mail.example.com/admin/x" })));
    assert.equal(r.data.ok, true);
    assert.match(seenUrl, /bot222:tok\/setWebhook/);
    assert.equal(seenBody.url, `https://mail.example.com/telegram/webhook/${data.id}`);
    assert.equal(r.data.webhookUrl, seenBody.url);
});

// ---------- Bark ----------
test("Bark: 多设备配置、脱敏、测试", async () => {
    const kv = makeKv(), db = makeDb();
    let r = await bodyOf(await notifyApi.getBark(makeCtx({ kv, db })));
    assert.equal(r.data.pushUrl, DEFAULT_BARK_PUSH_URL);
    assert.equal(r.data.devices.length, 0);

    await notifyApi.saveBark(makeCtx({ kv, db, body: {
        pushUrl: "https://bark.example.com",
        devices: [
            { name: "iPhone", keys: "keyAAA1111,keyBBB2222", enabled: true },
            { name: "iPad", keys: "keyCCC3333", enabled: false },
        ],
    } }));

    r = await bodyOf(await notifyApi.getBark(makeCtx({ kv, db })));
    assert.equal(r.data.pushUrl, "https://bark.example.com");
    assert.equal(r.data.devices.length, 2);
    assert.equal(r.data.devices[0].maskedKeys, "***1111,***2222");
    assert.ok(!JSON.stringify(r.data).includes("keyAAA"), "key 明文不能回显");

    // getWebPushConfig 只取启用设备的 keys
    const cfg = await getWebPushConfig(makeCtx({ kv, db }));
    assert.deepEqual(cfg.barkKeys, ["keyAAA1111", "keyBBB2222"]);
    assert.equal(cfg.barkPushUrl, "https://bark.example.com");

    // 测试单设备：只推该设备的 keys
    let seenUrl = null;
    globalThis.fetch = async (url) => {
        seenUrl = url;
        return { ok: true };
    };
    const devId = r.data.devices[0].id;
    r = await bodyOf(await notifyApi.testBark(makeCtx({ kv, db, body: { deviceId: devId } })));
    assert.equal(r.data.ok, true);
    assert.equal(r.data.devices, 1);
    assert.ok(seenUrl.startsWith("https://bark.example.com/push?"), seenUrl);
    assert.ok(seenUrl.includes("device_keys=keyAAA1111%2CkeyBBB2222") || seenUrl.includes("device_keys=keyAAA1111,keyBBB2222"), seenUrl);

    // 全部设备测试
    r = await bodyOf(await notifyApi.testBark(makeCtx({ kv, db, body: {} })));
    assert.equal(r.data.ok, true);
    assert.equal(r.data.devices, 1, "只统计启用的设备");

    // Bark 服务挂了
    globalThis.fetch = async () => ({ ok: false, status: 500 });
    r = await bodyOf(await notifyApi.testBark(makeCtx({ kv, db, body: {} })));
    assert.equal(r.data.ok, false);
    assert.match(r.data.error, /500/);

    // 更新设备不传 keys 时保留旧 keys（前端只回显脱敏值）
    await notifyApi.saveBark(makeCtx({ kv, db, body: {
        pushUrl: "https://bark.example.com",
        devices: [{ id: devId, name: "iPhone", enabled: true }],  // 不带 keys
    } }));
    const cfg2 = await getWebPushConfig(makeCtx({ kv, db }));
    assert.deepEqual(cfg2.barkKeys, ["keyAAA1111", "keyBBB2222"], "不传 keys 应保留旧值");
});

// ---------- 快照 TTL ----------
test("快照 TTL: 默认24h，可网页修改", async () => {
    const kv = makeKv(), db = makeDb();
    let r = await bodyOf(await notifyApi.getSnapshot(makeCtx({ kv, db })));
    assert.equal(r.data.ttlHours, 24);
    assert.equal(await getSnapshotTtlSeconds(makeCtx({ kv, db })), 86400);

    r = await bodyOf(await notifyApi.saveSnapshot(makeCtx({ kv, db, body: { ttlHours: 12 } })));
    assert.equal(r.data.ttlHours, 12);
    r = await bodyOf(await notifyApi.getSnapshot(makeCtx({ kv, db })));
    assert.equal(r.data.ttlHours, 12);
    assert.equal(await getSnapshotTtlSeconds(makeCtx({ kv, db })), 43200);

    // 非法值钳制
    r = await bodyOf(await notifyApi.saveSnapshot(makeCtx({ kv, db, body: { ttlHours: 0 } })));
    assert.equal(r.data.ttlHours, 24);
});

// ---------- 固定快照绑定（经 admin API） ----------
test("快照绑定: 创建/列表/重绑/失效全流程", async () => {
    const kv = makeKv(), db = makeDb(["u@example.com"]);
    // 地址不存在拒绝
    let r = await bodyOf(await notifyApi.createSnapshotBinding(
        makeCtx({ kv, db, body: { address: "ghost@example.com", durationHours: 24 } })));
    assert.equal(r.status, 400);
    // 非法地址拒绝
    r = await bodyOf(await notifyApi.createSnapshotBinding(
        makeCtx({ kv, db, body: { address: "not-an-email", durationHours: 24 } })));
    assert.equal(r.status, 400);

    r = await bodyOf(await notifyApi.createSnapshotBinding(
        makeCtx({ kv, db, body: { address: "U@Example.com", durationHours: 48 } })));
    assert.equal(r.data.success, true);
    assert.equal(r.data.binding.address, "u@example.com");
    const url1 = r.data.binding.url;
    const token1 = url1.split("/m/")[1];
    assert.match(url1, /^https:\/\/snap\.example\.com\/m\/[0-9a-f]{64}$/);

    r = await bodyOf(await notifyApi.listSnapshotBindings(makeCtx({ kv, db })));
    assert.equal(r.data.length, 1);

    // 新邮件覆盖：刷新后内容更新，URL 不变
    const urlAfter = await refreshBoundSnapshot(
        makeCtx({ kv, db }), "u@example.com",
        { parsedEmail: { html: "<p>验证码 777888</p>", text: "", subject: "s" } }, 86400);
    assert.equal(urlAfter, url1);
    assert.match(kv.store.get(`mailhtml:${token1}`).value, /777888/);

    // 重绑：旧 URL 立即失效
    r = await bodyOf(await notifyApi.createSnapshotBinding(
        makeCtx({ kv, db, body: { address: "u@example.com", durationHours: 72 } })));
    const token2 = r.data.binding.url.split("/m/")[1];
    assert.notEqual(token2, token1);
    assert.equal(kv.store.get(`mailhtml:${token1}`), undefined, "旧快照应删除");
    assert.equal(await getSnapshotBinding(makeCtx({ kv, db }), token1), null);

    // 提前失效
    r = await bodyOf(await notifyApi.invalidateSnapshotBinding(
        makeCtx({ kv, db, params: { address: encodeURIComponent("u@example.com") } })));
    assert.equal(r.data.success, true);
    r = await bodyOf(await notifyApi.listSnapshotBindings(makeCtx({ kv, db })));
    assert.equal(r.data.length, 0);
    assert.equal(kv.store.get(`mailhtml:${token2}`), undefined);
});

test("快照绑定: 到期后读取自动清理", async () => {
    const kv = makeKv(), db = makeDb(["u@example.com"]);
    const b = await createSnapshotBindingRecord(makeCtx({ kv, db }), "u@example.com", 24, "https://snap.example.com");
    // 人为调过期
    const stored = JSON.parse(kv.store.get("snapshot-bind:u@example.com").value);
    stored.expiresAt = Date.now() - 1000;
    kv.store.get("snapshot-bind:u@example.com").value = JSON.stringify(stored);
    assert.equal(await getSnapshotBinding(makeCtx({ kv, db }), "u@example.com"), null);
    assert.equal(kv.store.get("snapshot-bind:u@example.com"), undefined);
    assert.equal(kv.store.get(`snapshot-bindrev:${b.token}`), undefined);
    assert.equal(kv.store.get(`mailhtml:${b.token}`), undefined);
});
