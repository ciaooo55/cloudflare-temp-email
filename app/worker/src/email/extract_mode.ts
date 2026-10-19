/**
 * Email extraction mode, configured by the `AI_EXTRACT_MODE` variable.
 *
 * - `local`: built-in rule-based extraction only; mail content is never sent
 *   to any AI model. This is the default when the variable is unset.
 * - `ai`: prefer Workers AI; when the AI allowlist misses, local code extraction
 *   still runs because it never sends mail content to AI.
 * - `custom`: use an OpenAI-compatible chat completions endpoint configured by
 *   `AI_EXTRACT_API_URL` / `AI_EXTRACT_API_KEY` / `AI_EXTRACT_MODEL`.
 *
 * For `ai` and `custom` modes: when the AI call fails (network error, HTTP
 * 402/403/429/5xx, invalid response) or returns nothing usable, the extractor
 * automatically falls back to the local rule-based script.
 */
export const ExtractMode = {
    Local: 'local',
    Ai: 'ai',
    Custom: 'custom',
} as const;

export type ExtractMode = typeof ExtractMode[keyof typeof ExtractMode];

/**
 * Resolve the configured extraction mode.
 *
 * @returns the mode, or null when the value is not a supported mode
 */
export function resolveExtractMode(value: unknown): ExtractMode | null {
    if (value === undefined || value === null) return ExtractMode.Local;
    if (typeof value !== 'string') return null;
    const normalized = value.trim().toLowerCase();
    if (normalized === '') return ExtractMode.Local;
    if (normalized === ExtractMode.Local) return ExtractMode.Local;
    if (normalized === ExtractMode.Ai) return ExtractMode.Ai;
    if (normalized === ExtractMode.Custom) return ExtractMode.Custom;
    return null;
}
