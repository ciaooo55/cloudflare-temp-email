import { commonParseMail } from '../common.ts';
import { extractCode, joinSubjectAndBody } from './extract_code.ts';
import type { ExtractResult } from '../models/index.ts';

export async function extractEmailInfo(
    context: ParsedEmailContext, env: Bindings, messageId: string | null
): Promise<ExtractResult | null> {
    if (!extractCode(context.rawEmail)
        && !/content-transfer-encoding:\s*(?:base64|quoted-printable)/i.test(context.rawEmail)) return null;
    try {
        const parsed = await commonParseMail(context);
        const body = parsed.text || parsed.html?.replace(/<[^>]*>/g, ' ') || '';
        const code = extractCode(joinSubjectAndBody(parsed.subject, body));
        if (!code) return null;
        const result: ExtractResult = { type: 'auth_code', result: code, result_text: '' };
        // Retain the stored key so existing clients and historical messages remain readable.
        if (messageId) {
            await env.DB.prepare('UPDATE raw_mails SET metadata = ? WHERE message_id = ?')
                .bind(JSON.stringify({ ai_extract: result, extracted_at: new Date().toISOString() }), messageId).run();
        }
        return result;
    } catch (error) {
        console.error('Local verification code extraction failed', error);
        return null;
    }
}
