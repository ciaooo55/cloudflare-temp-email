import assert from "node:assert/strict";
import { test, afterEach } from "node:test";
import aiApi from "./ai_extract_settings.ts";
import { resolveCustomAiConfig } from "../email/custom_ai.ts";

function makeDb() {
    const settings = new Map();
    return {
        prepare(sql) {
            return {
                bind(...args) {
                    const run = async () => {
                        if (/INSERT or REPLACE INTO settings/i.test(sql)) settings.set(args[0], args[1]);
                        return { success: true };
                    };
                    const first = async (col) => {
                        if (/FROM settings/i.test(sql)) {
                            const v = settings.get(args[0]);
                            return v == null ? null : (col ? v : { value: v });
                        }
                        return null;
                    };
                    return { run, first, all: async () => [] };
                },
            };
        },
    };
}

const makeCtx = ({ db, body = null, envExtra = {} } = {}) => ({
    env: { DB: db, ...envExtra },
    req: { json: async () => { if (body === null) throw new Error("no body"); return body; } },
    json: (obj, status = 200) => new Response(JSON.stringify(obj), {
        status, headers: { "Content-Type": "application/json" },
    }),
});
const bodyOf = async (res) => ({ status: res.status, data: await res.json() });
const realFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = realFetch; });

test("AI 设置: 读取默认 / 保存 custom / Key 脱敏", async () => {
    const db = makeDb();
    let r = await bodyOf(await aiApi.getAiExtractSettings(makeCtx({ db })));
    assert.equal(r.data.mode, "");
    assert.equal(r.data.hasCustomApiKey, false);
    assert.ok(!("customApiKey" in r.data), "Key 明文不能回显");

    r = await bodyOf(await aiApi.saveAiExtractSettings(makeCtx({ db, body: {
        mode: "custom",
        customApiUrl: "https://ai.example.com/v1/",
        customApiKey: "sk-live-123456",
        customModel: "my-model",
        enableAllowList: true,
        allowList: ["*@example.com"],
    } })));
    assert.equal(r.data.success, true);

    r = await bodyOf(await aiApi.getAiExtractSettings(makeCtx({ db })));
    assert.equal(r.data.mode, "custom");
    assert.equal(r.data.customApiUrl, "https://ai.example.com/v1/");
    assert.equal(r.data.customModel, "my-model");
    assert.equal(r.data.hasCustomApiKey, true);
    assert.ok(!("customApiKey" in r.data));
    assert.deepEqual(r.data.allowList, ["*@example.com"]);

    // 不传 Key 时保留旧 Key
    await aiApi.saveAiExtractSettings(makeCtx({ db, body: { mode: "custom", customApiUrl: "https://ai.example.com/v1" } }));
    r = await bodyOf(await aiApi.getAiExtractSettings(makeCtx({ db })));
    assert.equal(r.data.hasCustomApiKey, true, "旧 Key 应保留");

    // 非法 mode 被拒绝
    await aiApi.saveAiExtractSettings(makeCtx({ db, body: { mode: "hacker" } }));
    r = await bodyOf(await aiApi.getAiExtractSettings(makeCtx({ db })));
    assert.equal(r.data.mode, "", "非法 mode 应被清空");
});

test("AI 设置: 网页配置优先于环境变量", async () => {
    const db = makeDb();
    await aiApi.saveAiExtractSettings(makeCtx({ db, body: {
        mode: "custom", customApiUrl: "https://web.example.com/v1", customApiKey: "web-key", customModel: "web-model",
    } }));
    const r = await bodyOf(await aiApi.getAiExtractSettings(makeCtx({ db })));
    const cfg2 = resolveCustomAiConfig(
        { AI_EXTRACT_API_URL: "https://env.example.com/v1", AI_EXTRACT_API_KEY: "env-key", AI_EXTRACT_MODEL: "env-model" },
        { customApiUrl: r.data.customApiUrl, customApiKey: "web-key", customModel: r.data.customModel }
    );
    assert.equal(cfg2.url, "https://web.example.com/v1");
    assert.equal(cfg2.key, "web-key");
    // 未保存网页配置时回退环境变量
    const db2 = makeDb();
    const r2 = await bodyOf(await aiApi.getAiExtractSettings(makeCtx({ db: db2 })));
    const cfg3 = resolveCustomAiConfig(
        { AI_EXTRACT_API_URL: "https://env.example.com/v1", AI_EXTRACT_API_KEY: "env-key" },
        { customApiUrl: r2.data.customApiUrl, customApiKey: "", customModel: r2.data.customModel }
    );
    assert.equal(cfg3.url, "https://env.example.com/v1");
});

test("AI 测试接口: 成功与失败路径", async () => {
    const db = makeDb();
    // 未配置 URL
    let r = await bodyOf(await aiApi.testCustomAiEndpoint(makeCtx({ db, body: {} })));
    assert.equal(r.data.ok, false);
    assert.match(r.data.error, /先配置/);

    await aiApi.saveAiExtractSettings(makeCtx({ db, body: {
        mode: "custom", customApiUrl: "https://ai.example.com/v1", customApiKey: "k", customModel: "m",
    } }));

    // 成功
    let seenUrl = null, seenHeaders = null;
    globalThis.fetch = async (url, init) => {
        seenUrl = url; seenHeaders = init.headers;
        return { ok: true, status: 200, json: async () => ({
            choices: [{ message: { content: '{"type":"auth_code","result":"482913","result_text":""}' } }],
        }) };
    };
    r = await bodyOf(await aiApi.testCustomAiEndpoint(makeCtx({ db, body: { sampleText: "您的验证码是 482913" } })));
    assert.equal(r.data.ok, true);
    assert.equal(r.data.model, "m");
    assert.equal(r.data.result.result, "482913");
    assert.equal(seenUrl, "https://ai.example.com/v1/chat/completions");
    assert.equal(seenHeaders["Authorization"], "Bearer k");

    // 429 失败
    globalThis.fetch = async () => ({ ok: false, status: 429, statusText: "Too Many Requests", json: async () => ({}) });
    r = await bodyOf(await aiApi.testCustomAiEndpoint(makeCtx({ db, body: {} })));
    assert.equal(r.data.ok, false);
    assert.match(r.data.error, /429/);

    // 网络失败
    globalThis.fetch = async () => { throw new Error("timeout"); };
    r = await bodyOf(await aiApi.testCustomAiEndpoint(makeCtx({ db, body: {} })));
    assert.equal(r.data.ok, false);
    assert.match(r.data.error, /timeout/);
});
