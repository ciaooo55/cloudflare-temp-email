# AI Email Recognition

> [!NOTE]
> This feature is supported from version v1.1.0
>
> This feature is inspired by the [Alle project](https://github.com/bestruirui/Alle/blob/62e74629ded0c7966c12d4e1c54f0bcc2e54f12c/src/lib/email/extract.ts#L54)

## Features

The email recognition feature automatically analyzes incoming email content and extracts important information. It supports two mutually exclusive modes:

| Mode | Extracts | Privacy | Requires |
| ---- | -------- | ------- | -------- |
| `local` (default) | **Verification codes** (auth_code) only | Built-in rules run inside the Worker; mail content is **never sent to any AI model** | Nothing, zero cost |
| `ai` | Verification codes, auth links, service links, subscription links, other links | Mail content is sent to the Workers AI model in your Cloudflare account | Workers AI binding |

Types recognized in `ai` mode:

- **Verification Code** (auth_code) - OTP, security code, confirmation code, etc.
- **Authentication Link** (auth_link) - Login, verify, activate, password reset links
- **Service Link** (service_link) - GitHub, GitLab, deployment notifications and other service-related links
- **Subscription Link** (subscription_link) - Unsubscribe, manage subscription links
- **Other Link** (other_link) - Other valuable links

Extraction results are automatically saved to the `metadata` field in the database, the frontend can directly display extracted verification codes or links, and Telegram pushes and webhook placeholders reuse the same result.

## Configuration Variables

| Variable Name              | Type      | Description                                                                                                                      | Example                          |
| -------------------------- | --------- | -------------------------------------------------------------------------------------------------------------------------------- | -------------------------------- |
| `ENABLE_AI_EMAIL_EXTRACT`  | Text/JSON | Whether to enable email recognition (master switch, required by all three modes)                                                        | `true`                           |
| `AI_EXTRACT_MODE`          | Text      | Recognition mode: `local` uses built-in rules only, `ai` prefers Workers AI, `custom` uses a custom OpenAI-compatible endpoint. Defaults to `local` when unset | `local` |
| `AI_EXTRACT_MODEL`         | Text      | `ai` / `custom` modes. Model name: a JSON-mode-capable Workers AI model for `ai`, the model name sent to your endpoint for `custom` | `@cf/meta/llama-3.1-8b-instruct-fast` |
| `AI_EXTRACT_API_URL`       | Text      | `custom` mode only. Base URL of your OpenAI-compatible endpoint (without `/chat/completions`) | `https://ll.example.com/v1` |
| `AI_EXTRACT_API_KEY`       | Text      | `custom` mode only. API key (secret) for your endpoint, sent as Bearer; omit for open endpoints | `sk-...` |

> [!WARNING] Upgrading from older versions
> Older versions automatically used AI recognition whenever a Workers AI binding was configured. Now, when `AI_EXTRACT_MODE` is unset, local rules are used by default. To keep using AI recognition, explicitly set `AI_EXTRACT_MODE = "ai"`.
>
> `ai` / `custom` modes now fall back automatically on failure: when the AI call fails (network error, HTTP 402/403/429, etc.) or returns nothing usable, local rules take over instead of skipping the mail.

The three modes behave as follows:

- `local` mode never calls AI, even if a Workers AI binding is configured
- `ai` / `custom` modes use the AI result directly when it extracts something usable and skip local rules; on AI failure or unusable results they automatically fall back to local rules
- In `ai` / `custom` modes, an address allowlist miss skips only the AI call; local rules still run to try extracting verification codes

## Local Rule Mode (local)

- Extracts **verification codes** (`auth_code`) only; links are not extracted
- Zero dependency, zero cost, runs locally inside the Worker; mail content never leaves the Worker
- Reads both the **subject** and the body, so codes in the subject (e.g. `123456 is your verification code`) are extracted too
- Supports common formats in Chinese, English, Japanese and Korean, plus Russian, Spanish, Portuguese, French, German, Italian, Turkish and Hebrew, e.g.:
  - Keyword first: `验证码：123456`, `Apple ID代码为：724818`, `認証コードは 123456 です`, `인증번호 [123456]`, `Ваш код: 123456`
  - Code first: `123456 是您的验证码`, `116352（动态验证码）`, `G-123456 is your Google verification code`, `123456 est votre code de sécurité`
  - Words between keyword and code: `Your OTP for payment of Rs 5000 is 482913`
- Supports codes with separators, spaces, zero-width characters or full-width digits (e.g. `123-456`, `8 4 9 2 0 1`, `K9X-4B2`, `１２３４５６`); separators and letter prefixes such as `G-` are removed from the result
- Alphanumeric codes must contain a digit; letters-only codes (e.g. `QGFDAE`) are not recognized, so words like `EXPIRED` are never taken as codes
- Automatically rejects years and `YYYYMMDD` dates, numbers longer than 8 digits (e.g. phone numbers), decimals and amounts, times, digits inside URLs and email addresses, and promo / tracking / order / reference / voucher codes
- Without an explicit keyword, a number is only recognized in a verification-looking mail when it is **on its own line** or right after "use / enter / 输入", so order numbers, hotlines and zip codes are not mistaken for codes
- The subject (up to its first 1000 characters) and body are combined, and only the first 20000 characters of the combined text are analyzed, keeping CPU time predictable for large mails

## AI Mode (ai)

We recommend `@cf/meta/llama-3.1-8b-instruct-fast` as the default model because it supports the JSON Mode used by this feature, and Cloudflare says `-fast` variants will remain active. The cheaper `@cf/meta/llama-3.1-8b-instruct-fp8-fast` is not currently listed as a JSON Mode supported model, so it is not recommended for this feature. Cloudflare's newer recommended model `@cf/zai-org/glm-4.7-flash` is suitable for multilingual scenarios, but confirm structured JSON output support in your account/region before using it for this feature. The previous default model `@cf/meta/llama-3.1-8b-instruct` was deprecated by Cloudflare on 2026-05-30 and is no longer recommended.

### Content Length Limit

To avoid AI model token limits, the maximum email content length for processing is **4000 characters**. Email content exceeding this limit will be truncated before AI analysis.

### Workers AI Binding

Configure Workers AI binding in `wrangler.toml`:

```toml
AI_EXTRACT_MODE = "ai"

[ai]
binding = "AI"
```

Or add in Cloudflare Dashboard Worker settings:
- **Variable name**: `AI`
- **Type**: Workers AI

## Custom Endpoint Mode (custom)

With `AI_EXTRACT_MODE = "custom"`, mail content is POSTed to your own OpenAI-compatible endpoint:

```toml
ENABLE_AI_EMAIL_EXTRACT = "true"
AI_EXTRACT_MODE = "custom"
AI_EXTRACT_API_URL = "https://ll.example.com/v1"
AI_EXTRACT_MODEL = "your-model-name"
```

```bash
# keep the API key in secrets, not in the config file
wrangler secret put AI_EXTRACT_API_KEY
```

- Request: `POST {AI_EXTRACT_API_URL}/chat/completions`, OpenAI `chat/completions` compatible, with `response_format: { type: "json_object" }` and a 30s timeout
- On parse failure, non-2xx HTTP (e.g. 402/403/429) or unusable content (`type: none` / empty result), extraction automatically falls back to local rules
- The allowlist works the same as in `ai` mode: off-allowlist addresses skip the endpoint and use local rules directly
- You can also configure mode, API URL, API key and model directly in the Admin console **AI Extract Settings** page and test the endpoint there; web settings take precedence over environment variables; the saved API key is never echoed back, entering a new value replaces it

## Address Allowlist (Optional)

To control costs and resource usage, you can configure an address allowlist in the Admin console's **AI Extract Settings** page. The allowlist controls only AI calls (Workers AI or a custom endpoint), not local rule mode; in `ai` / `custom` modes, addresses outside the allowlist still use local rules to try extracting verification codes.

### Configuration

- **Allowlist Disabled**: AI extraction can process all email addresses
- **Allowlist Enabled**: AI is called only for addresses in the allowlist; addresses outside it skip the AI call and fall back to local verification-code extraction

### Allowlist Format

One address per line, supporting wildcard `*` to match any characters:

- **Exact Match**: `user@example.com` - Only matches this specific email
- **Domain Wildcard**: `*@example.com` - Matches all emails under example.com domain
- **User Wildcard**: `admin*@example.com` - Matches emails starting with admin
- **Wildcard Anywhere**: `*test*@example.com` - Matches emails containing test
- **Multiple Wildcards**: `admin*@*.com` - Matches emails starting with admin under any .com domain

### Configuration Example

```text
user@example.com
*@mydomain.com
admin*@company.com
```

This configuration will only call Workers AI for:
- `user@example.com` (exact match)
- All emails under `@mydomain.com` (e.g., `test@mydomain.com`, `admin@mydomain.com`)
- All emails starting with `admin` under `@company.com` (e.g., `admin@company.com`, `admin123@company.com`)
