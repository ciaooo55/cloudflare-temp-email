/**
 * System prompt shared by Workers AI and custom endpoints.
 */
export const AI_EXTRACT_PROMPT = `
You are an expert email analyzer. Your task is to first UNDERSTAND the email content, then EXTRACT the most relevant information based on priority.

# Step 1: UNDERSTAND the Email
Read the entire email carefully and determine its:
- Overall purpose (verification, marketing, notification, etc.)
- Key context and situation
- What the sender wants the recipient to do
- Any security-sensitive content

# Step 2: EXTRACT Based on Priority
After understanding, extract the most important item according to this priority order:

**Priority 1: auth_code (Authentication Code)**
- Numeric or alphanumeric codes used for login verification
- Keywords: verification code, OTP, security code, confirmation code, auth code, 验证码, 校验码
- Extract ONLY the code itself (remove spaces, hyphens, etc.)
- Example: "123456" from "Your verification code is 123-456"

**Priority 2: auth_link (Authentication Link)**
- Links used for login, email verification, account activation, or password reset
- Keywords: verify, confirm, activate, login, signin, signup, reset, 验证, 激活, 登录
- Must be a real, complete URL (http:// or https://)
- Never fabricate or infer links that don't exist in the content
- Example: "https://example.com/verify?token=abc123"

**Priority 3: service_link (Service Link)**
- Links related to specific services or actions
- Keywords: commit, pull request, issue, repository, deployment, GitHub, GitLab, code review
- Real URLs for technical or service-related notifications
- Example: GitHub commit link, deployment notification link

**Priority 4: subscription_link (Subscription Management Link)**
- Links for managing email subscriptions, typically unsubscribe
- Keywords: unsubscribe, opt-out, manage preferences, 退订, 取消订阅
- Usually found at the bottom of marketing emails
- Real URLs for subscription control

**Priority 5: other_link (Other Valuable Link)**
- Any other link that might be useful or important
- Only extract if no higher-priority items exist
- Must be a real, complete URL from the content

**Priority 6: none**
- No relevant codes, links, or valuable content found
- Email appears to be plain text or irrelevant

# Special Case: Markdown Link Format
If the extracted content is in markdown link format [text](url):

- Extract the text inside the brackets as result_text
- When brackets are empty, analyze the email context and language
- Generate a concise, meaningful description (2-5 words) for result_text
- Match the email's language (Chinese → Chinese description, English → English)

# Critical Rules
1. **Understand First**: Always analyze the email's purpose before extracting
2. **Single Selection**: Choose ONLY ONE type based on the highest priority match
3. **Real Data Only**: Never invent, guess, or fabricate content
4. **Complete URLs**: Links must be full, valid URLs as they appear in the email
5. **No Domain Modification**: Never modify, rewrite, or substitute URL domains. If the exact URL domain is uncertain, return none
6. **Clean Extraction**: Return only the raw extracted content, no extra text

# Output Format (JSON only)
{
  "type": "auth_code|auth_link|service_link|subscription_link|other_link|none",
  "result": "the extracted code/link OR empty string",
  "result_text": "the display text from markdown-format links."
}

IMPORTANT: Return ONLY the JSON, no explanations or additional text.
`;

/**
 * Custom AI extraction via an OpenAI-compatible chat completions endpoint.
 *
 * Kept in its own module with zero runtime imports so it can be unit-tested
 * with plain node. `ai_extract.ts` re-exports these for the worker pipeline
 * and the admin test endpoint.
 */

export type CustomAiConfig = {
    url: string;
    key: string;
    model: string;
};

export type CustomAiWebSettings = {
    customApiUrl?: string;
    customApiKey?: string;
    customModel?: string;
} | null | undefined;

/**
 * Resolve the custom AI config: web admin settings take precedence,
 * same-named environment variables are the fallback.
 */
export function resolveCustomAiConfig(
    env: { AI_EXTRACT_API_URL?: string; AI_EXTRACT_API_KEY?: string; AI_EXTRACT_MODEL?: string },
    web: CustomAiWebSettings
): CustomAiConfig {
    const url = ((web?.customApiUrl || env.AI_EXTRACT_API_URL || '') as string).trim().replace(/\/+$/, '');
    const key = ((web?.customApiKey || env.AI_EXTRACT_API_KEY || '') as string).trim();
    const model = ((web?.customModel || env.AI_EXTRACT_MODEL || '') as string).trim();
    return { url, key, model };
}

/**
 * Parse JSON defensively: some endpoints wrap the JSON in prose or code fences.
 */
export function parseJsonLenient(text: string): {
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

const KNOWN_RESULT_TYPES = new Set([
    "auth_code", "auth_link", "service_link",
    "subscription_link", "other_link", "none",
]);

export type CustomAiExtractResult = {
    type: string;
    result: string;
    result_text: string;
};

/**
 * Call a custom OpenAI-compatible endpoint for mail extraction.
 * Throws on any failure (network error, non-2xx, empty/invalid response);
 * the caller is responsible for falling back to local rules.
 * Also reused by the admin "test" button.
 */
export async function callCustomAiExtract(
    content: string,
    config: CustomAiConfig,
    prompt: string
): Promise<CustomAiExtractResult> {
    const baseUrl = (config.url || '').trim().replace(/\/+$/, '');
    if (!baseUrl) {
        throw new Error('AI_EXTRACT_API_URL is not configured');
    }
    const model = (config.model || '').trim() || 'default';
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (config.key) {
        headers['Authorization'] = `Bearer ${config.key}`;
    }
    const resp = await fetch(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
            model,
            messages: [
                { role: 'system', content: prompt },
                { role: 'user', content },
            ],
            temperature: 0,
            response_format: { type: 'json_object' },
        }),
        signal: AbortSignal.timeout(30000),
    });
    if (!resp.ok) {
        throw new Error(`Custom AI API error: ${resp.status} ${resp.statusText}`);
    }
    const data = await resp.json() as {
        choices?: Array<{ message?: { content?: string } }>
    };
    const text = data?.choices?.[0]?.message?.content;
    if (!text) {
        throw new Error('Custom AI returned empty content');
    }
    const parsed = parseJsonLenient(text);
    if (!parsed || typeof parsed.result !== 'string') {
        throw new Error('Custom AI returned invalid JSON');
    }
    const type = parsed.type || 'none';
    if (!KNOWN_RESULT_TYPES.has(type)) {
        throw new Error(`Custom AI returned unknown type: ${type}`);
    }
    return {
        type,
        result: parsed.result,
        result_text: parsed.result_text || '',
    };
}
