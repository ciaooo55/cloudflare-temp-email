/**
 * AI Email Extraction Module
 *
 * This module provides email content analysis, either with built-in local rules
 * (verification codes only) or with Cloudflare Workers AI, which also extracts
 * authentication links, service links, and subscription management links.
 */

import { commonParseMail } from "../common";
import {
    AI_EXTRACT_PROMPT,
    callCustomAiExtract as callCustomAiEndpoint,
    resolveCustomAiConfig as resolveCustomAiEndpointConfig,
    type CustomAiConfig,
    type CustomAiWebSettings,
} from "./custom_ai";
import { extractCode, joinSubjectAndBody } from "./extract_code";
import { ExtractMode, resolveExtractMode } from "./extract_mode";
import { getBooleanValue, getJsonSetting } from "../utils";
import { CONSTANTS } from "../constants";
import { Context } from "hono";
import type { AiExtractSettings } from "../admin_api/ai_extract_settings";
import type { ExtractResult } from "../models";

// AI Prompt for email analysis

/**
 * Extract important information from email content using Cloudflare Workers AI
 *
 * @param content - The email content to analyze (plain text or HTML)
 * @param env - Cloudflare Workers environment bindings
 * @returns Promise<ExtractResult> - The extracted information
 */
async function extractWithCloudflareAI(
    content: string,
    env: Bindings
): Promise<ExtractResult> {
    // Get the AI model name from environment variable or use default
    const modelName = env.AI_EXTRACT_MODEL || '@cf/meta/llama-3.1-8b-instruct-fast';

    const result = await env.AI.run(modelName as keyof AiModels, {
        messages: [
            { role: 'system', content: AI_EXTRACT_PROMPT },
            { role: 'user', content },
        ],
        response_format: {
            type: 'json_schema',
            json_schema: {
                type: 'object',
                properties: {
                    type: {
                        type: 'string',
                        enum: ['auth_code', 'auth_link', 'service_link', 'subscription_link', 'other_link', 'none']
                    },
                    result: { type: 'string' },
                    result_text: { type: 'string' },
                },
                required: ['type', 'result', 'result_text'],
            },
        },
        stream: false,
    });

    // @ts-expect-error result.response
    const response = result.response;

    if (typeof response === 'string') {
        return JSON.parse(response) as ExtractResult;
    }

    if (response && typeof response === 'object') {
        return response as ExtractResult;
    }

    throw new Error('Unexpected response format from Cloudflare AI');
}

/**
 * Parse JSON defensively: some endpoints wrap the JSON in prose or code fences.
 */
function parseJsonLenient(text: string): {
    type?: string; result?: string; result_text?: string
} | null {
    try {
        return JSON.parse(text);
    } catch {
        // fall through
    }
    const match = text.match(/\{[\s\S]*\}/);
    if (match) {
        try {
            return JSON.parse(match[0]);
        } catch {
            // fall through
        }
    }
    return null;
}
export {
    callCustomAiEndpoint as callCustomAiExtract,
    resolveCustomAiEndpointConfig as resolveCustomAiConfig,
    type CustomAiConfig,
    type CustomAiWebSettings,
};

/**
 * Persist an extraction result to the raw_mails metadata column.
 * Shared by the Workers AI mode and the local rule mode.
 *
 * @param env - Cloudflare Workers environment bindings
 * @param message_id - The email message ID
 * @param result - The extraction result to persist
 */
async function saveExtractMetadata(
    env: Bindings,
    message_id: string | null,
    result: ExtractResult
): Promise<void> {
    try {
        const metadata = JSON.stringify({
            ai_extract: result,
            extracted_at: new Date().toISOString()
        });

        // Update the raw_mails record with metadata
        await env.DB.prepare(
            `UPDATE raw_mails SET metadata = ? WHERE message_id = ?`
        ).bind(metadata, message_id).run();
    } catch (e) {
        console.error('AI extraction metadata save error:', e);
    }
}

function decodeHtmlEntities(text: string): string {
    const entities: Record<string, string> = {
        amp: '&',
        lt: '<',
        gt: '>',
        quot: '"',
        apos: "'",
        nbsp: ' ',
    };

    const decodeCodePoint = (value: number, fallback: string) => {
        if (!Number.isFinite(value) || value < 0 || value > 0x10ffff) {
            return fallback;
        }
        return String.fromCodePoint(value);
    };

    return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z][a-z0-9]+);/gi, (match, entity) => {
        const normalized = entity.toLowerCase();
        if (normalized.startsWith('#x')) {
            const value = Number.parseInt(normalized.slice(2), 16);
            return decodeCodePoint(value, match);
        }
        if (normalized.startsWith('#')) {
            const value = Number.parseInt(normalized.slice(1), 10);
            return decodeCodePoint(value, match);
        }
        return entities[normalized] ?? match;
    });
}

function htmlToTextForAi(html: string): string {
    return decodeHtmlEntities(
        html
            .replace(/<\s*(script|style|head|svg)[^>]*>[\s\S]*?<\s*\/\s*\1\s*>/gi, ' ')
            .replace(/<!--[\s\S]*?-->/g, ' ')
            .replace(/<a\b[^>]*\bhref=(["'])(.*?)\1[^>]*>([\s\S]*?)<\/a>/gi, ' $3 $2 ')
            .replace(/<\s*br\s*\/?>/gi, '\n')
            .replace(/<\/\s*(p|div|tr|td|th|li|table|section|article|header|footer|h[1-6])\s*>/gi, '\n')
            .replace(/<[^>]+>/g, ' ')
    )
        .replace(/[ \t\r\f\v]+/g, ' ')
        .replace(/\n\s+/g, '\n')
        .replace(/\n{3,}/g, '\n\n')
        .trim();
}

function getEmailContentForExtract(parsedEmail: Awaited<ReturnType<typeof commonParseMail>>): string {
    if (parsedEmail?.text) {
        return parsedEmail.text;
    }

    if (!parsedEmail?.html) {
        return "";
    }

    return htmlToTextForAi(parsedEmail.html) || parsedEmail.html;
}

function isAddressInAiAllowlist(settings: AiExtractSettings | null | undefined, address: string): boolean {
    if (!settings?.enableAllowList) return true;
    if (!Array.isArray(settings.allowList) || settings.allowList.length === 0) return false;

    return settings.allowList.some(pattern => {
        if (typeof pattern !== 'string') return false;
        if (!pattern.includes('*')) return address === pattern;
        const escapedPattern = pattern
            .replace(/[.+?^${}()|[\]\\]/g, '\\$&')
            .replace(/\*/g, '.*');
        return new RegExp('^' + escapedPattern + '$').test(address);
    });
}

/**
 * Main extraction function
 * Checks if extraction is enabled, processes the email content, and saves to database.
 * The web admin setting takes precedence over `AI_EXTRACT_MODE`; an explicitly
 * configured web mode also acts as the enable switch (otherwise the
 * `ENABLE_AI_EMAIL_EXTRACT` master switch applies).
 * `AI_EXTRACT_MODE` selects the preferred extractor:
 * - `local` (default): built-in rules, verification codes only, content never sent to AI
 * - `ai`: Cloudflare Workers AI, verification codes and links; if the address is not
 *   in the AI allowlist, only the AI call is skipped and local code extraction still runs
 * - `custom`: OpenAI-compatible endpoint (`AI_EXTRACT_API_URL` / `AI_EXTRACT_API_KEY` /
 *   `AI_EXTRACT_MODEL`); same allowlist rule as `ai`
 *
 * For `ai` and `custom`: the AI result wins when it extracts something usable;
 * when the AI call fails (network error, HTTP 402/403/429/5xx, invalid response)
 * or returns nothing usable, extraction automatically falls back to local rules.
 *
 * @param parsedEmailContext - The parsed email context
 * @param env - Cloudflare Workers environment bindings
 * @param message_id - The email message ID
 * @param address - The recipient email address
 * @returns Promise<ExtractResult | null>
 */
export async function extractEmailInfo(
    parsedEmailContext: ParsedEmailContext,
    env: Bindings,
    message_id: string | null,
    address: string
): Promise<ExtractResult | null> {
    try {
        const aiSettings = await getJsonSetting<AiExtractSettings>(
            { env: env } as Context<HonoCustomType>,
            CONSTANTS.AI_EXTRACT_SETTINGS_KEY
        );
        const webMode = typeof aiSettings?.mode === "string" ? (aiSettings.mode || "").trim() : "";
        // 网页显式设置了识别模式即视为开启；未设置（跟随环境变量）时由总开关决定
        if (!webMode && !getBooleanValue(env.ENABLE_AI_EMAIL_EXTRACT)) {
            return null;
        }
        const mode = resolveExtractMode(webMode || env.AI_EXTRACT_MODE);
        if (!mode) {
            console.error(`Email extraction skipped: unsupported AI_EXTRACT_MODE "${webMode || env.AI_EXTRACT_MODE}", expected "local", "ai" or "custom"`);
            return null;
        }
        const isAiAllowed = isAddressInAiAllowlist(aiSettings, address);

        // Parse email to get content (shared by both modes)
        const parsedEmail = await commonParseMail(parsedEmailContext);
        const emailContent = getEmailContentForExtract(parsedEmail);

        const runLocalExtract = async () => {
            const localContent = joinSubjectAndBody(parsedEmail?.subject, emailContent);
            const code = localContent ? extractCode(localContent) : null;
            if (!code) return null;
            const result: ExtractResult = { type: 'auth_code', result: code, result_text: '' };
            await saveExtractMetadata(env, message_id, result);
            console.log(`Local code extraction completed for ${message_id}`);
            return result;
        };

        // Local mode: built-in rules only, mail content is never sent to any AI model.
        // The subject is included because many services put the code there.
        // Telegram / webhook reuse the same ExtractResult.
        if (mode === ExtractMode.Local) {
            return await runLocalExtract();
        }

        if (!isAiAllowed) {
            console.log(`AI extraction skipped for ${address}: not in AI allowlist; trying local code extraction`);
            return await runLocalExtract();
        }

        if (mode === ExtractMode.Ai && !env.AI) {
            console.warn('AI_EXTRACT_MODE is "ai" but the Workers AI binding "AI" is not configured; falling back to local rules');
            return await runLocalExtract();
        }

        if (!emailContent) {
            return null;
        }

        // Truncate content if too long (max 4000 characters to avoid token limits)
        const truncatedContent = emailContent.length > 4000
            ? emailContent.substring(0, 4000) + '...[truncated]'
            : emailContent;

        // AI 优先：AI 能识别出结果就用 AI 的，不再跑正则；
        // AI 失败（网络错误、402/403/429 等 API 不可用）或返回不可用 → 兜底跑本地正则
        try {
            const raw = mode === ExtractMode.Custom
                ? await callCustomAiEndpoint(truncatedContent, resolveCustomAiEndpointConfig(env, aiSettings), AI_EXTRACT_PROMPT)
                : await extractWithCloudflareAI(truncatedContent, env);
            const result = raw as ExtractResult;
            if (result && result.type !== 'none' && result.result) {
                // Validate: the extracted code/link must actually appear in the email content.
                // LLMs can hallucinate (e.g. return 482913 when the mail contains 123456).
                const normalizedContent = truncatedContent.replace(/[\s\-_]/g, '');
                const normalizedResult = String(result.result).replace(/[\s\-_]/g, '');
                if (normalizedResult && normalizedContent.includes(normalizedResult)) {
                    await saveExtractMetadata(env, message_id, result);
                    console.log(`AI extraction completed for ${message_id}: ${result.type}`);
                    return result;
                }
                console.warn(`AI extraction hallucination detected for ${message_id}: "${result.result}" not found in email content, falling back to local rules`);
            }
            console.log(`AI extraction returned nothing usable for ${message_id}, falling back to local rules`);
        } catch (e) {
            console.warn(`AI extraction failed for ${message_id}, falling back to local rules:`, e);
        }
        return await runLocalExtract();
    } catch (e) {
        console.error('AI email extraction error:', e);
        return null;
    }
}
