import PostalMime from 'postal-mime';
import { decodeHTML } from 'entities';
import { extractCode, stripVerificationHtml, joinSubjectAndBody } from '../../../shared/verification-code';

function addVerificationCode(item) {
    let metadata;
    try { metadata = JSON.parse(item.metadata || '{}'); } catch { metadata = {}; }
    if (metadata?.ai_extract?.type === 'auth_code' && metadata.ai_extract.result) return;
    const body = item.text || decodeHTML(stripVerificationHtml(item.message || ''));
    const code = extractCode(joinSubjectAndBody(item.subject, body));
    if (code) item.metadata = JSON.stringify({ ...metadata, ai_extract: { type: 'auth_code', result: code, result_text: '' } });
}

function humanFileSize(size) {
    const i = size === 0 ? 0 : Math.floor(Math.log(size) / Math.log(1024));
    return parseFloat((size / Math.pow(1024, i)).toFixed(2)) + ' ' + ['B', 'KB', 'MB', 'GB', 'TB'][i];
}

// 原始接收邮箱：从原始邮件 To 头提取第一个地址（口径与后端 email/index.ts 一致）。
// item.address 是系统归一化后的收件地址，转发/改写场景下与原始收件不同，详情页单独展示原始值。
export function extractOriginalRecipient(raw) {
    try {
        const headerSection = String(raw || '').split(/\r?\n\r?\n/)[0] || '';
        const m = headerSection.match(/^To:[ \t]*([^\r\n]*(?:\r?\n[ \t][^\r\n]*)*)/im);
        if (!m) return '';
        const addr = m[1].match(/([a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,})/);
        return addr ? addr[1].toLowerCase() : '';
    } catch {
        return '';
    }
}

export async function processItem(item) {
    item.originalSource = item.originalSource || item.source;
    item.originalRecipient = extractOriginalRecipient(item.raw);
    // PostalMime avoids downloading/initializing WASM for ordinary messages.
    try {
        const parsedEmail = await PostalMime.parse(item.raw);
        item.source = parsedEmail.from?.address || item.source;
        if (parsedEmail.from?.address && parsedEmail.from.name) {
            item.source = `${parsedEmail.from.name} <${parsedEmail.from.address}>`;
        }
        item.subject = parsedEmail.subject || 'No Subject';
        item.message = parsedEmail.html || '';
        item.text = parsedEmail.text || '';
        item.attachments = parsedEmail.attachments?.map((a_item) => {
            const blob = new Blob(
                [a_item.content],
                { type: a_item.mimeType || 'application/octet-stream' }
            );
            const blob_url = URL.createObjectURL(blob);
            if (a_item.contentId) {
                const contentId = a_item.contentId.replace(/^<|>$/g, '');
                item.message = item.message.replaceAll(`cid:${contentId}`, blob_url);
            }
            return {
                id: a_item.contentId || Math.random().toString(36).substring(2, 15),
                filename: a_item.filename || a_item.contentId || "",
                size: humanFileSize(blob.size),
                url: blob_url,
                blob: blob
            }
        }) || [];
        addVerificationCode(item);
        return item;
    } catch (error) {
        console.error('Error parsing email with PostalMime', error);
        releaseMailResources(item);
    }
    // Keep the alternative parser available for malformed messages.
    try {
        const { parse_message } = await import('mail-parser-wasm');
        const parsedEmail = parse_message(item.raw);
        item.source = parsedEmail.sender || item.source;
        item.subject = parsedEmail.subject || 'No Subject';
        item.message = parsedEmail.body_html || '';
        item.text = parsedEmail.text || (item.message ? '' : item.raw || '');
        item.attachments = parsedEmail.attachments?.map((a_item) => {
            const blob = new Blob(
                [a_item.content],
                { type: a_item.content_type || 'application/octet-stream' }
            );
            const blob_url = URL.createObjectURL(blob)
            if (a_item.content_id) {
                item.message = item.message.replaceAll(`cid:${a_item.content_id}`, blob_url);
            }
            return {
                id: a_item.content_id || Math.random().toString(36).substring(2, 15),
                filename: a_item.filename || a_item.content_id || "",
                size: humanFileSize(blob.size),
                url: blob_url,
                blob: blob
            }
        }) || [];
    } catch (error) {
        console.error('Error parsing email with mail-parser-wasm', error);
        item.subject = 'No Subject';
        item.message = '';
        item.text = item.raw || '';
        item.attachments = [];
    }
    addVerificationCode(item);
    return item;
}

export function refreshParsedItem(cached, incoming) {
    const item = { ...cached, ...incoming, source: cached.source,
        originalSource: incoming.source || cached.originalSource };
    addVerificationCode(item);
    return item;
}

export function processSentItem(item) {
    let data;
    try { data = JSON.parse(item.raw); } catch { return processItem(item); }
    const content = Array.isArray(data.content) ? data.content : [];
    const text = data.version === 'v2' ? (data.is_html ? '' : data.content || '')
        : content.find(part => part.type === 'text/plain')?.value || '';
    const html = data.version === 'v2' ? (data.is_html ? data.content || '' : '')
        : content.find(part => part.type === 'text/html')?.value || '';
    const recipients = data.version === 'v2' ? data.to_mail || ''
        : (data.personalizations || []).flatMap(part => (part.to || []).map(to => to.email)).join(', ');
    const senderName = data.from_name || data.from?.name;
    const sender = data.from?.email || item.address;
    const parsed = { ...item, subject: data.subject || 'No Subject', source: senderName ? senderName + ' <' + sender + '>' : sender,
        originalSource: item.address, originalRecipient: recipients, listSource: recipients,
        text, message: html, attachments: [], rawFormat: 'json' };
    addVerificationCode(parsed);
    return parsed;
}

export function getDownloadEmlUrl(raw) {
    return URL.createObjectURL(
        new Blob([raw], { type: 'text/plain' }
        ))
}

export function releaseMailResources(mail) {
    for (const attachment of mail?.attachments || []) {
        if (attachment.url) URL.revokeObjectURL(attachment.url);
    }
}
