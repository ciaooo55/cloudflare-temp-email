import assert from "node:assert/strict";
import { test } from "node:test";
import { resolvePushConfig } from "./send_config.ts";

test("resolvePushConfig: 旧环境变量回退（单 token / 逗号分隔 bark keys）", () => {
    const r = resolvePushConfig({
        TELEGRAM_BOT_TOKEN: "tok1",
        BARK_DEVICE_KEYS: "k1,k2 , k1",
    }, "example.com");
    assert.deepEqual(r.telegramTokens, ["tok1"]);
    assert.deepEqual(r.barkKeys, ["k1", "k2"]);
});

test("resolvePushConfig: SEND_ROUTES 按域名指定推送目标", () => {
    const env = {
        TELEGRAM_BOT_TOKEN: "default-tok",
        TELEGRAM_BOT_TOKEN_2: "tok2",
        BARK_DEVICE_KEYS: "default-k",
        BARK_DEVICE_KEYS_2: "k2a,k2b",
        SEND_ROUTES: JSON.stringify({
            domains: {
                "a.com": { push: { telegram: ["TELEGRAM_BOT_TOKEN_2"], bark: ["BARK_DEVICE_KEYS_2"] } },
            },
        }),
    };
    const ra = resolvePushConfig(env, "a.com");
    assert.deepEqual(ra.telegramTokens, ["tok2"]);
    assert.deepEqual(ra.barkKeys, ["k2a", "k2b"]);

    // 未命中域名的回退旧逻辑
    const rb = resolvePushConfig(env, "b.com");
    assert.deepEqual(rb.telegramTokens, ["default-tok"]);
    assert.deepEqual(rb.barkKeys, ["default-k"]);
});

test("resolvePushConfig: 缺失凭证的命名引用被跳过", () => {
    const r = resolvePushConfig({
        SEND_ROUTES: JSON.stringify({ domains: { "*": { push: { telegram: ["TELEGRAM_BOT_TOKEN_X"], bark: [] } } } }),
    }, "example.com");
    assert.deepEqual(r.telegramTokens, []);
    assert.deepEqual(r.barkKeys, []);
});

test("推送合并: 环境变量 + 网页配置去重", () => {
    // 模拟 telegram.ts 里的合并逻辑
    const push = resolvePushConfig({ TELEGRAM_BOT_TOKEN: "tok1", BARK_DEVICE_KEYS: "k1" }, "example.com");
    const web = { telegramTokens: ["tok1", "tok-web"], barkKeys: ["k1", "k-web"] };
    push.telegramTokens = [...new Set([...push.telegramTokens, ...web.telegramTokens])];
    push.barkKeys = [...new Set([...push.barkKeys, ...web.barkKeys])];
    assert.deepEqual(push.telegramTokens, ["tok1", "tok-web"]);
    assert.deepEqual(push.barkKeys, ["k1", "k-web"]);
});
