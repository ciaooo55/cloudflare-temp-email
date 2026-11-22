import { commonParseMail } from '../common.ts';
import { decodeHTML } from 'entities';
import { extractCode, stripVerificationHtml, joinSubjectAndBody } from '../../../shared/verification-code.ts';
import type { ExtractResult } from '../models/index.ts';

export async function extractEmailInfo(
    context: ParsedEmailContext, env: Bindings, storedMailId: number | null | undefined
): Promise<ExtractResult | null> {
    if (!extractCode(context.rawEmail)
        && !/content-type:\s*text\/html/i.test(context.rawEmail)
        && !/content-transfer-encoding:\s*(?:base64|quoted-printable)/i.test(context.rawEmail)) return null;
    try {
        const parsed = await commonParseMail(context);
        if (!parsed) return null;
        const body = parsed.text || decodeHTML(stripVerificationHtml(parsed.html || ''));
        const code = extractCode(joinSubjectAndBody(parsed.subject, body));
        if (!code) return null;
        const result: ExtractResult = { type: 'auth_code', result: code, result_text: '' };
        // Retain the stored key so existing clients and historical messages remain readable.
        if (storedMailId != null) {
            await env.DB.prepare('UPDATE raw_mails SET metadata = ? WHERE id = ?')
                .bind(JSON.stringify({ ai_extract: result, extracted_at: new Date().toISOString() }), storedMailId).run();
        }
        return result;
    } catch (error) {
        console.error('Local verification code extraction failed', error);
        return null;
    }
}
