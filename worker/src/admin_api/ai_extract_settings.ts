import { Context} from "hono";
import { CONSTANTS} from "../constants";
import { getJsonSetting, saveSetting} from "../utils";
import { AI_EXTRACT_PROMPT, callCustomAiExtract, resolveCustomAiConfig} from "../email/custom_ai";

export type AiExtractSettings = {
enableAllowList: boolean;
allowList: string[];
// 自定义 AI（网页配置优先于同名环境变量）
mode?: string;
customApiUrl?: string;
customApiKey?: string;
customModel?: string;
}

type AiExtractSettingsView = Omit<AiExtractSettings, "customApiKey"> & {
hasCustomApiKey: boolean;
};

const DEFAULTS: AiExtractSettings = {
enableAllowList: false,
allowList: [],
};

async function getAiExtractSettings(c: Context<HonoCustomType>): Promise<Response> {
const settings = await getJsonSetting<AiExtractSettings>(c, CONSTANTS.AI_EXTRACT_SETTINGS_KEY) || {...DEFAULTS};
const view: AiExtractSettingsView = {
enableAllowList:!!settings.enableAllowList,
allowList: Array.isArray(settings.allowList)? settings.allowList: [],
mode: settings.mode || "",
customApiUrl: settings.customApiUrl || "",
customModel: settings.customModel || "",
hasCustomApiKey:!!settings.customApiKey,
};
return c.json(view);
}

async function saveAiExtractSettings(c: Context<HonoCustomType>): Promise<Response> {
const body = await c.req.json<AiExtractSettings & { customApiKey?: string}>();
const prev = await getJsonSetting<AiExtractSettings>(c, CONSTANTS.AI_EXTRACT_SETTINGS_KEY) || {...DEFAULTS};
const mode = (body.mode || "").trim().toLowerCase();
const settings: AiExtractSettings = {
enableAllowList:!!body.enableAllowList,
allowList: Array.isArray(body.allowList)? body.allowList: [],
mode: ["local", "ai", "custom"].includes(mode)? mode: "",
customApiUrl: (body.customApiUrl || "").trim(),
customModel: (body.customModel || "").trim(),
customApiKey: (typeof body.customApiKey === "string" && body.customApiKey.trim())
? body.customApiKey.trim()
: (prev.customApiKey || ""),
};
await saveSetting(c, CONSTANTS.AI_EXTRACT_SETTINGS_KEY, JSON.stringify(settings));
return c.json({ success: true})
}

async function testCustomAiEndpoint(c: Context<HonoCustomType>): Promise<Response> {
const { sampleText} = await c.req.json<{ sampleText?: string}>().catch(() => ({} as { sampleText?: string}));
const settings = await getJsonSetting<AiExtractSettings>(c, CONSTANTS.AI_EXTRACT_SETTINGS_KEY).catch(() => null);
const config = resolveCustomAiConfig(c.env, settings);
if (!config.url) {
return c.json({ ok: false, error: "请先配置自定义接口地址（网页设置或 AI_EXTRACT_API_URL 环境变量）"});
}
const content = (sampleText || "").trim()
|| "尊敬的用户，您的登录验证码是 482913，5 分钟内有效，请勿泄露。";
try {
const result = await callCustomAiExtract(content, config, AI_EXTRACT_PROMPT);
return c.json({ ok: true, model: config.model || "(未指定)", result});
} catch (e) {
return c.json({ ok: false, error: `调用失败: ${(e as Error).message}`});
}
}

export default {
getAiExtractSettings,
saveAiExtractSettings,
testCustomAiEndpoint,
}
