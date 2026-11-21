import assert from "node:assert/strict";
import { createD1 } from "../../test-loader/d1.mjs";
import { WORKER_STORE_SCHEMA, WORKER_STORE_TRIGGER } from "../worker_store.ts";
import { test, afterEach } from "node:test";
import notifyApi, { getSnapshotTtlSeconds, getWebPushConfig, DEFAULT_BARK_PUSH_URL, getBoundSnapshotCacheConfig, normalizeBoundCacheTtl, boundSnapshotCacheControl, BOUND_CACHE_TTL_PRESETS } from "./notify_settings.ts";
import { createSnapshotBindingRecord, refreshBoundSnapshot, getSnapshotBinding, SNAPSHOT_BIND_DELETED } from "../telegram_api/mail_snapshot.ts";

// ---------- mock 基础设施 ----------
function makeDb(existingAddresses = []) {
    const db = createD1();
    db.sqlite.exec("CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT, updated_at TEXT); CREATE TABLE address (id INTEGER PRIMARY KEY, name TEXT)");
    db.sqlite.exec(WORKER_STORE_SCHEMA + WORKER_STORE_TRIGGER);
    for (const address of existingAddresses) db.sqlite.prepare("INSERT INTO address (name) VALUES (?)").run(address);
    return db;
}

function storeEntry(db, key) {
    return db.sqlite.prepare("SELECT value FROM worker_store WHERE key = ? AND value IS NOT NULL").get(key);
}

function makeCtx({ db, body = null, params = {}, url = "https://mail.example.com/admin/x", envExtra = {} } = {}) {
    return {
        env: { DB: db, SNAPSHOT_BASE_URL: "https://snap.example.com", ...envExtra },
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
    const db = makeDb();
    let r = await bodyOf(await notifyApi.listTelegramBots(makeCtx({ db })));
    assert.equal(r.data.length, 0);

    // 无 token 拒绝
    r = await bodyOf(await notifyApi.createTelegramBot(makeCtx({ db, body: { name: "b1", token: " " } })));
    assert.equal(r.status, 400);

    r = await bodyOf(await notifyApi.createTelegramBot(makeCtx({ db, body: { name: "b1", token: "123456:AA secret-token" } })));
    assert.equal(r.data.success, true);
    const id = r.data.id;
    assert.ok(id);

    r = await bodyOf(await notifyApi.listTelegramBots(makeCtx({ db })));
    assert.equal(r.data.length, 1);
    assert.equal(r.data[0].maskedToken, "123456:***");
    assert.ok(!JSON.stringify(r.data).includes("secret-token"), "token 明文不能出现在列表里");

    // 停用后 getWebPushConfig 排除
    r = await bodyOf(await notifyApi.updateTelegramBot(makeCtx({ db, body: { enabled: false }, params: { id } })));
    assert.equal(r.data.success, true);
    assert.deepEqual((await getWebPushConfig(makeCtx({ db }))).telegramTokens, []);

    // 启用后纳入推送
    await notifyApi.updateTelegramBot(makeCtx({ db, body: { enabled: true }, params: { id } }));
    assert.deepEqual((await getWebPushConfig(makeCtx({ db }))).telegramTokens, ["123456:AA secret-token"]);

    // 改名
    await notifyApi.updateTelegramBot(makeCtx({ db, body: { name: "b1-renamed" }, params: { id } }));
    r = await bodyOf(await notifyApi.listTelegramBots(makeCtx({ db })));
    assert.equal(r.data[0].name, "b1-renamed");

    // 404 路径
    r = await bodyOf(await notifyApi.updateTelegramBot(makeCtx({ db, body: { enabled: true }, params: { id: "nope" } })));
    assert.equal(r.status, 404);

    // 删除
    r = await bodyOf(await notifyApi.deleteTelegramBot(makeCtx({ db, params: { id } })));
    assert.equal(r.data.success, true);
    r = await bodyOf(await notifyApi.listTelegramBots(makeCtx({ db })));
    assert.equal(r.data.length, 0);
    r = await bodyOf(await notifyApi.deleteTelegramBot(makeCtx({ db, params: { id } })));
    assert.equal(r.status, 404);
});

test("TG bot: 测试接口 getMe + 发送测试消息", async () => {
    const db = makeDb();
    const { data } = await bodyOf(await notifyApi.createTelegramBot(makeCtx({ db, body: { token: "111:tok" } })));
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
    let r = await bodyOf(await notifyApi.testTelegramBot(makeCtx({ db, body: {}, params: { id: data.id } })));
    assert.equal(r.data.ok, true);
    assert.equal(r.data.username, "mytestbot");
    assert.equal(r.data.messageSent, false);

    r = await bodyOf(await notifyApi.testTelegramBot(makeCtx({ db, body: { chatId: "999" }, params: { id: data.id } })));
    assert.equal(r.data.ok, true);
    assert.equal(r.data.messageSent, true);
    assert.equal(calls.length, 3);

    // 无效 token
    globalThis.fetch = async () => ({ ok: true, json: async () => ({ ok: false, description: "Unauthorized" }) });
    r = await bodyOf(await notifyApi.testTelegramBot(makeCtx({ db, body: {}, params: { id: data.id } })));
    assert.equal(r.data.ok, false);
    assert.match(r.data.error, /Unauthorized/);

    // 网络异常
    globalThis.fetch = async () => { throw new Error("dns fail"); };
    r = await bodyOf(await notifyApi.testTelegramBot(makeCtx({ db, body: {}, params: { id: data.id } })));
    assert.equal(r.data.ok, false);
    assert.match(r.data.error, /dns fail/);

    // 不存在的 bot
    r = await bodyOf(await notifyApi.testTelegramBot(makeCtx({ db, body: {}, params: { id: "nope" } })));
    assert.equal(r.status, 404);
});

test("TG bot: 独立 webhook 设置", async () => {
    const db = makeDb();
    const { data } = await bodyOf(await notifyApi.createTelegramBot(makeCtx({ db, body: { token: "222:tok" } })));
    let seenUrl = null, seenBody = null;
    globalThis.fetch = async (url, init) => {
        seenUrl = url; seenBody = JSON.parse(init.body);
        return { ok: true, json: async () => ({ ok: true }) };
    };
    const r = await bodyOf(await notifyApi.setTelegramBotWebhook(
        makeCtx({ db, body: {}, params: { id: data.id }, url: "https://mail.example.com/admin/x" })));
    assert.equal(r.data.ok, true);
    assert.match(seenUrl, /bot222:tok\/setWebhook/);
    assert.equal(seenBody.url, `https://mail.example.com/telegram/webhook/${data.id}`);
    assert.equal(r.data.webhookUrl, seenBody.url);
});

// ---------- Bark ----------
test('default Telegram webhook persists verification secret; status and disabling preserve push settings', async () => {
    const db = makeDb();
    const ctx = makeCtx({ db, params: { id: 'env' }, envExtra: { TELEGRAM_BOT_TOKEN: '333:default' } });
    const methods = [];
    let webhookBody;
    globalThis.fetch = async (url, init) => {
        methods.push(String(url).split('/').at(-1));
        if (init?.body) webhookBody = JSON.parse(init.body);
        return { ok: true, json: async () => ({ ok: true, result: { url: 'https://mail.example.com/telegram/webhook' } }) };
    };
    assert.equal((await bodyOf(await notifyApi.setTelegramBotWebhook(ctx))).data.ok, true);
    assert.equal(webhookBody.url, 'https://mail.example.com/telegram/webhook');
    assert.equal(storeEntry(db, 'telegram:webhook-secret:default').value, webhookBody.secret_token);
    const before = db.sqlite.prepare('SELECT * FROM settings').all();
    assert.equal((await bodyOf(await notifyApi.getTelegramBotWebhook(ctx))).data.ok, true);
    assert.equal((await bodyOf(await notifyApi.deleteTelegramBotWebhook(ctx))).data.ok, true);
    assert.deepEqual(db.sqlite.prepare('SELECT * FROM settings').all(), before);
    assert.deepEqual(methods, ['setWebhook', 'getWebhookInfo', 'deleteWebhook']);
});

test("Bark: 多设备配置、脱敏、测试", async () => {
    const db = makeDb();
    let r = await bodyOf(await notifyApi.getBark(makeCtx({ db })));
    assert.equal(r.data.pushUrl, DEFAULT_BARK_PUSH_URL);
    assert.equal(r.data.devices.length, 0);

    await notifyApi.saveBark(makeCtx({ db, body: {
        pushUrl: "https://bark.example.com",
        devices: [
            { name: "iPhone", keys: "keyAAA1111,keyBBB2222", enabled: true },
            { name: "iPad", keys: "keyCCC3333", enabled: false },
        ],
    } }));

    r = await bodyOf(await notifyApi.getBark(makeCtx({ db })));
    assert.equal(r.data.pushUrl, "https://bark.example.com");
    assert.equal(r.data.devices.length, 2);
    assert.equal(r.data.devices[0].maskedKeys, "***1111,***2222");
    assert.ok(!JSON.stringify(r.data).includes("keyAAA"), "key 明文不能回显");

    // getWebPushConfig 只取启用设备的 keys
    const cfg = await getWebPushConfig(makeCtx({ db }));
    assert.deepEqual(cfg.barkKeys, ["keyAAA1111", "keyBBB2222"]);
    assert.equal(cfg.barkPushUrl, "https://bark.example.com");

    // 测试单设备：只推该设备的 keys
    let seenUrl = null;
    globalThis.fetch = async (url) => {
        seenUrl = url;
        return { ok: true };
    };
    const devId = r.data.devices[0].id;
    r = await bodyOf(await notifyApi.testBark(makeCtx({ db, body: { deviceId: devId } })));
    assert.equal(r.data.ok, true);
    assert.equal(r.data.devices, 1);
    assert.ok(seenUrl.startsWith("https://bark.example.com/push?"), seenUrl);
    assert.ok(seenUrl.includes("device_keys=keyAAA1111%2CkeyBBB2222") || seenUrl.includes("device_keys=keyAAA1111,keyBBB2222"), seenUrl);

    // 全部设备测试
    r = await bodyOf(await notifyApi.testBark(makeCtx({ db, body: {} })));
    assert.equal(r.data.ok, true);
    assert.equal(r.data.devices, 1, "只统计启用的设备");

    // Bark 服务挂了
    globalThis.fetch = async () => ({ ok: false, status: 500 });
    r = await bodyOf(await notifyApi.testBark(makeCtx({ db, body: {} })));
    assert.equal(r.data.ok, false);
    assert.match(r.data.error, /500/);

    // 更新设备不传 keys 时保留旧 keys（前端只回显脱敏值）
    await notifyApi.saveBark(makeCtx({ db, body: {
        pushUrl: "https://bark.example.com",
        devices: [{ id: devId, name: "iPhone", enabled: true }],  // 不带 keys
    } }));
    const cfg2 = await getWebPushConfig(makeCtx({ db }));
    assert.deepEqual(cfg2.barkKeys, ["keyAAA1111", "keyBBB2222"], "不传 keys 应保留旧值");
});

// ---------- 快照 TTL ----------
test("快照 TTL: 默认24h，可网页修改", async () => {
    const db = makeDb();
    let r = await bodyOf(await notifyApi.getSnapshot(makeCtx({ db })));
    assert.equal(r.data.ttlHours, 24);
    assert.equal(await getSnapshotTtlSeconds(makeCtx({ db })), 86400);

    r = await bodyOf(await notifyApi.saveSnapshot(makeCtx({ db, body: { ttlHours: 12 } })));
    assert.equal(r.data.ttlHours, 12);
    r = await bodyOf(await notifyApi.getSnapshot(makeCtx({ db })));
    assert.equal(r.data.ttlHours, 12);
    assert.equal(await getSnapshotTtlSeconds(makeCtx({ db })), 43200);

    // 非法值钳制
    r = await bodyOf(await notifyApi.saveSnapshot(makeCtx({ db, body: { ttlHours: 0 } })));
    assert.equal(r.data.ttlHours, 24);
});

// ---------- 固定快照绑定（经 admin API） ----------
test("快照绑定: 历史域名即使不在 DOMAINS 里也能绑（回归 22 域名）", async () => {
    const db = makeDb();
    // DOMAINS 只配了 example.com，但 looo.cloud 是历史收信域名，必须仍可绑定
    const r = await bodyOf(await notifyApi.createSnapshotBinding(
        makeCtx({ db, body: { address: "u@looo.cloud", durationHours: 24 }, envExtra: { DOMAINS: JSON.stringify(["example.com"]) } })));
    assert.equal(r.status, 200);
    assert.equal(r.data.success, true);
    assert.equal(r.data.binding.address, "u@looo.cloud");

    // getSnapshot 返回的 allowedDomains 必须包含历史域名
    const s = await bodyOf(await notifyApi.getSnapshot(
        makeCtx({ db, envExtra: { DOMAINS: JSON.stringify(["example.com"]) } })));
    assert.ok(s.data.allowedDomains.includes("looo.cloud"));
    assert.ok(s.data.allowedDomains.includes("example.com"));

    // 完全不在列表里的域名仍拒绝
    const bad = await bodyOf(await notifyApi.createSnapshotBinding(
        makeCtx({ db, body: { address: "u@evil.example", durationHours: 24 }, envExtra: { DOMAINS: JSON.stringify(["example.com"]) } })));
    assert.equal(bad.status, 400);
});

test("快照绑定: 域名外地址带 ignoreDomainWarning 可放行，且有效期按所选小时数生效", async () => {
    const db = makeDb();
    const domEnv = { envExtra: { DOMAINS: JSON.stringify(["example.com"]) } };
    // 前端提醒后用户确认：带放行标记可绑定列表外域名
    const before = Date.now();
    const r = await bodyOf(await notifyApi.createSnapshotBinding(
        makeCtx({ db, body: { address: "u@evil.example", durationHours: 720, ignoreDomainWarning: true }, ...domEnv })));
    assert.equal(r.status, 200);
    assert.equal(r.data.success, true);
    assert.equal(r.data.binding.address, "u@evil.example");
    // 有效期必须是所选的 720 小时（30 天），不能被默认值 168 覆盖
    const expected = before + 720 * 3600 * 1000;
    assert.ok(Math.abs(r.data.binding.expiresAt - expected) < 60_000,
        `expiresAt 应约为 ${expected}，实际 ${r.data.binding.expiresAt}`);
});

test("快照绑定: 创建/列表/重绑/失效全流程", async () => {
    const db = makeDb(["u@example.com"]);
    const domEnv = { envExtra: { DOMAINS: JSON.stringify(["example.com"]) } };
    // 地址不必已存在：只要域名在允许列表即可绑定（与前端批量绑定一致）
    {
        const db2 = makeDb();
        const r2 = await bodyOf(await notifyApi.createSnapshotBinding(
            makeCtx({ db: db2, body: { address: "ghost@example.com", durationHours: 24 }, ...domEnv })));
        assert.equal(r2.status, 200);
        assert.equal(r2.data.success, true);
    }
    // 非法地址拒绝
    let r = await bodyOf(await notifyApi.createSnapshotBinding(
        makeCtx({ db, body: { address: "not-an-email", durationHours: 24 }, ...domEnv })));
    assert.equal(r.status, 400);

    r = await bodyOf(await notifyApi.createSnapshotBinding(
        makeCtx({ db, body: { address: "U@Example.com", durationHours: 48 }, ...domEnv })));
    assert.equal(r.data.success, true);
    assert.equal(r.data.binding.address, "u@example.com");
    const url1 = r.data.binding.url;
    const token1 = url1.split("/m/")[1];
    assert.match(url1, /^https:\/\/snap\.example\.com\/m\/[0-9a-f]{64}$/);

    r = await bodyOf(await notifyApi.listSnapshotBindings(makeCtx({ db })));
    assert.equal(r.data.length, 1);

    // 新邮件覆盖：刷新后内容更新，URL 不变
    const urlAfter = await refreshBoundSnapshot(
        makeCtx({ db }), "u@example.com",
        { parsedEmail: { html: "<p>验证码 777888</p>", text: "", subject: "s" } }, 86400);
    assert.equal(urlAfter, url1);
    assert.match(storeEntry(db, `mailhtml:${token1}`).value, /777888/);

    // 重绑：旧 URL 立即失效
    r = await bodyOf(await notifyApi.createSnapshotBinding(
        makeCtx({ db, body: { address: "u@example.com", durationHours: 72 }, ...domEnv })));
    const token2 = r.data.binding.url.split("/m/")[1];
    assert.notEqual(token2, token1);
    assert.equal(storeEntry(db, `mailhtml:${token1}`), undefined, "旧快照应删除");
    assert.equal(await getSnapshotBinding(makeCtx({ db }), token1), null);

    // 提前失效
    r = await bodyOf(await notifyApi.invalidateSnapshotBinding(
        makeCtx({ db, params: { address: encodeURIComponent("u@example.com") } })));
    assert.equal(r.data.success, true);
    r = await bodyOf(await notifyApi.listSnapshotBindings(makeCtx({ db })));
    assert.equal(r.data.length, 0);
    assert.equal(storeEntry(db, `mailhtml:${token2}`), undefined);
});

test("快照绑定: 到期后读取自动清理", async () => {
    const db = makeDb(["u@example.com"]);
    const b = await createSnapshotBindingRecord(makeCtx({ db }), "u@example.com", 24, "https://snap.example.com");
    // 人为调过期
    const stored = JSON.parse(storeEntry(db, "snapshot-bind:u@example.com").value);
    stored.expiresAt = Date.now() - 1000;
    db.sqlite.prepare("UPDATE worker_store SET value = ? WHERE key = ?").run(JSON.stringify(stored), "snapshot-bind:u@example.com");
    assert.equal(await getSnapshotBinding(makeCtx({ db }), "u@example.com"), null);
    assert.equal(storeEntry(db, "snapshot-bind:u@example.com"), undefined);
    assert.equal(storeEntry(db, `snapshot-bindrev:${b.token}`).value, SNAPSHOT_BIND_DELETED);
    assert.equal(storeEntry(db, `mailhtml:${b.token}`), undefined);
});

// ---------- 绑定快照边缘缓存开关 ----------
test("绑定快照缓存配置: 默认关闭=实时读取", async () => {
    const db = makeDb();
    const cfg = await getBoundSnapshotCacheConfig(makeCtx({ db }));
    assert.deepEqual(cfg, { enabled: false, ttlSeconds: 10 });
    assert.equal(boundSnapshotCacheControl(cfg), "no-store");
    assert.deepEqual(BOUND_CACHE_TTL_PRESETS, [10, 30, 60, 300]);
});

test("normalizeBoundCacheTtl: 非法值回退默认 10, 钳制 5~600", () => {
    assert.equal(normalizeBoundCacheTtl(undefined), 10);
    assert.equal(normalizeBoundCacheTtl(null), 10);
    assert.equal(normalizeBoundCacheTtl(0), 10);
    assert.equal(normalizeBoundCacheTtl(-5), 10);
    assert.equal(normalizeBoundCacheTtl("abc"), 10);
    assert.equal(normalizeBoundCacheTtl(10), 10);
    assert.equal(normalizeBoundCacheTtl(30), 30);
    assert.equal(normalizeBoundCacheTtl(300), 300);
    assert.equal(normalizeBoundCacheTtl(1), 5);
    assert.equal(normalizeBoundCacheTtl(99999), 600);
});

test("快照设置 save/get 回环: 开关+时间挡位", async () => {
    const db = makeDb();
    // 默认值
    let r = await bodyOf(await notifyApi.getSnapshot(makeCtx({ db })));
    assert.equal(r.data.ttlHours, 24);
    assert.equal(r.data.boundCacheEnabled, false);
    assert.equal(r.data.boundCacheTtl, 10);
    assert.deepEqual(r.data.boundCacheTtlPresets, [10, 30, 60, 300]);
    // 开启 + 60 秒挡位
    r = await bodyOf(await notifyApi.saveSnapshot(makeCtx({ db, body: { ttlHours: 24, boundCacheEnabled: true, boundCacheTtl: 60 } })));
    assert.equal(r.data.success, true);
    assert.equal(r.data.boundCacheEnabled, true);
    assert.equal(r.data.boundCacheTtl, 60);
    r = await bodyOf(await notifyApi.getSnapshot(makeCtx({ db })));
    assert.equal(r.data.boundCacheEnabled, true);
    assert.equal(r.data.boundCacheTtl, 60);
    assert.equal(r.data.ttlHours, 24);
    const cfg = await getBoundSnapshotCacheConfig(makeCtx({ db }));
    assert.deepEqual(cfg, { enabled: true, ttlSeconds: 60 });
    assert.equal(boundSnapshotCacheControl(cfg), "public, max-age=60");
    // 只改 ttlHours 时开关状态不丢失
    await notifyApi.saveSnapshot(makeCtx({ db, body: { ttlHours: 48 } }));
    r = await bodyOf(await notifyApi.getSnapshot(makeCtx({ db })));
    assert.equal(r.data.ttlHours, 48);
    assert.equal(r.data.boundCacheEnabled, true);
    assert.equal(r.data.boundCacheTtl, 60);
});

test("快照设置: 非法挡位值被归一化, 开关可关闭", async () => {
    const db = makeDb();
    let r = await bodyOf(await notifyApi.saveSnapshot(makeCtx({ db, body: { boundCacheEnabled: true, boundCacheTtl: 99999 } })));
    assert.equal(r.data.boundCacheTtl, 600);
    r = await bodyOf(await notifyApi.saveSnapshot(makeCtx({ db, body: { boundCacheEnabled: false } })));
    assert.equal(r.data.boundCacheEnabled, false);
    const cfg = await getBoundSnapshotCacheConfig(makeCtx({ db }));
    assert.equal(cfg.enabled, false);
    assert.equal(boundSnapshotCacheControl(cfg), "no-store");
});
