import assert from "node:assert/strict";
import { test, afterEach } from "node:test";
import {
    callCustomAiExtract,
    parseJsonLenient,
    resolveCustomAiConfig,
} from "./custom_ai.ts";

const PROMPT = "test prompt";
const realFetch = globalThis.fetch;

afterEach(() => { globalThis.fetch = realFetch; });

function mockFetch(handler) {
    let seen = null;
    globalThis.fetch = async (url, init) => {
        seen = { url, init };
        return handler(url, init);
    };
    return () => seen;
}

const okJson = obj => ({
    ok: true, status: 200, statusText: "OK",
    json: async () => obj,
});

test("resolveCustomAiConfig: web settings take precedence over env", () => {
    const env = { AI_EXTRACT_API_URL: "https://env.example.com/v1/", AI_EXTRACT_API_KEY: "env-key", AI_EXTRACT_MODEL: "env-model" };
    const web = { customApiUrl: "https://web.example.com/v1", customApiKey: "web-key", customModel: "web-model" };
    assert.deepEqual(resolveCustomAiConfig(env, web), {
        url: "https://web.example.com/v1",
        key: "web-key",
        model: "web-model",
    });
});

test("resolveCustomAiConfig: falls back to env, trims trailing slashes", () => {
    assert.deepEqual(
        resolveCustomAiConfig({ AI_EXTRACT_API_URL: "https://env.example.com/v1///" }, null),
        { url: "https://env.example.com/v1", key: "", model: "" }
    );
    assert.deepEqual(resolveCustomAiConfig({}, undefined), { url: "", key: "", model: "" });
});

test("parseJsonLenient handles wrapped json and rejects garbage", () => {
    assert.deepEqual(parseJsonLenient('{"type":"auth_code","result":"123"}'), { type: "auth_code", result: "123" });
    assert.deepEqual(
        parseJsonLenient('Here you go:\n```json\n{"type":"auth_code","result":"456"}\n```'),
        { type: "auth_code", result: "456" }
    );
    assert.equal(parseJsonLenient("no json here"), null);
});

test("callCustomAiExtract throws when url is missing", async () => {
    await assert.rejects(
        callCustomAiExtract("hi", { url: "", key: "", model: "" }, PROMPT),
        /AI_EXTRACT_API_URL is not configured/
    );
});

test("callCustomAiExtract throws on http errors (402/403/429/5xx)", async () => {
    for (const status of [402, 403, 429, 500]) {
        mockFetch(async () => ({ ok: false, status, statusText: "Err", json: async () => ({}) }));
        await assert.rejects(
            callCustomAiExtract("hi", { url: "https://x.example.com/v1", key: "", model: "m" }, PROMPT),
            new RegExp(`Custom AI API error: ${status}`)
        );
    }
});

test("callCustomAiExtract throws on network failure", async () => {
    mockFetch(async () => { throw new Error("boom"); });
    await assert.rejects(
        callCustomAiExtract("hi", { url: "https://x.example.com/v1", key: "", model: "m" }, PROMPT),
        /boom/
    );
});

test("callCustomAiExtract throws on empty or invalid content", async () => {
    mockFetch(async () => okJson({ choices: [] }));
    await assert.rejects(
        callCustomAiExtract("hi", { url: "https://x.example.com/v1", key: "", model: "m" }, PROMPT),
        /empty content/
    );
    mockFetch(async () => okJson({ choices: [{ message: { content: "not json at all" } }] }));
    await assert.rejects(
        callCustomAiExtract("hi", { url: "https://x.example.com/v1", key: "", model: "m" }, PROMPT),
        /invalid JSON/
    );
});

test("callCustomAiExtract throws on unknown result type", async () => {
    mockFetch(async () => okJson({ choices: [{ message: { content: '{"type":"weird","result":"x"}' } }] }));
    await assert.rejects(
        callCustomAiExtract("hi", { url: "https://x.example.com/v1", key: "", model: "m" }, PROMPT),
        /unknown type/
    );
});

test("callCustomAiExtract succeeds and sends bearer auth + prompt", async () => {
    const seen = mockFetch(async () => okJson({
        choices: [{ message: { content: '{"type":"auth_code","result":"482913","result_text":""}' } }],
    }));
    const r = await callCustomAiExtract("mail text", { url: "https://x.example.com/v1/", key: "sk-test", model: "gpt-x" }, PROMPT);
    assert.deepEqual(r, { type: "auth_code", result: "482913", result_text: "" });
    const { url, init } = seen();
    assert.equal(url, "https://x.example.com/v1/chat/completions");
    assert.equal(init.headers["Authorization"], "Bearer sk-test");
    const body = JSON.parse(init.body);
    assert.equal(body.model, "gpt-x");
    assert.equal(body.messages[0].content, PROMPT);
    assert.equal(body.messages[1].content, "mail text");
});

test("callCustomAiExtract omits Authorization when no key", async () => {
    const seen = mockFetch(async () => okJson({
        choices: [{ message: { content: '{"type":"none","result":""}' } }],
    }));
    await callCustomAiExtract("mail text", { url: "https://x.example.com/v1", key: "", model: "" }, PROMPT);
    assert.ok(!("Authorization" in seen().init.headers));
});
