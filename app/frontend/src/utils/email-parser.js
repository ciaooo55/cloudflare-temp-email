import PostalMime from 'postal-mime';

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
    // Try to parse the email using mail-parser-wasm
    item.originalSource = item.source;
    item.originalRecipient = extractOriginalRecipient(item.raw);
    try {
        const { parse_message } = await import('mail-parser-wasm');
        const parsedEmail = parse_message(item.raw);
        item.source = parsedEmail.sender || item.source;
        item.subject = parsedEmail.subject || '';
        item.message = parsedEmail.body_html || parsedEmail.text || '';
        item.text = parsedEmail.text || '';
        item.attachments = parsedEmail.attachments?.map((a_item) => {
            const blob = new Blob(
                [a_item.content],
                { type: a_item.content_type || 'application/octet-stream' }
            );
            const blob_url = URL.createObjectURL(blob);
            if (a_item.content_id && a_item.content_id.length > 0) {
                item.message = item.message.replace(`cid:${a_item.content_id}`, blob_url);
            }
            return {
                id: a_item.content_id || Math.random().toString(36).substring(2, 15),
                filename: a_item.filename || a_item.content_id || "",
                size: humanFileSize(a_item.content?.length || 0),
                url: blob_url,
                blob: blob
            }
        }) || [];
    } catch (error) {
        console.log('Error parsing email with mail-parser-wasm');
        console.error(error);
    }
    if (item.subject && item.subject.length > 0 && item.message && item.message.length > 0) {
        return item;
    }
    // Fallback to PostalMime
    try {
        const parsedEmail = await PostalMime.parse(item.raw);
        item.source = parsedEmail.from.address || item.source;
        if (parsedEmail.from.address && parsedEmail.from.name) {
            item.source = `${parsedEmail.from.name} <${parsedEmail.from.address}>`;
        }
        item.subject = parsedEmail.subject || 'No Subject';
        item.message = parsedEmail.html || parsedEmail.text || item.raw;
        item.text = parsedEmail.text || '';
        item.attachments = parsedEmail.attachments?.map((a_item) => {
            const blob = new Blob(
                [a_item.content],
                { type: a_item.mimeType || 'application/octet-stream' }
            );
            const blob_url = URL.createObjectURL(blob)
            if (a_item.contentId && a_item.contentId.length > 0) {
                item.message = item.message.replace(`cid:${a_item.contentId}`, blob_url);
            }
            return {
                id: a_item.contentId || Math.random().toString(36).substring(2, 15),
                filename: a_item.filename || a_item.contentId || "",
                size: humanFileSize(a_item.content?.length || 0),
                url: blob_url,
                blob: blob
            }
        }) || [];
    } catch (error) {
        console.log('Error parsing email with PostalMime');
        console.error(error);
        item.subject = 'No Subject';
        item.message = item.raw;
    }
    return item;
}

export function getDownloadEmlUrl(raw) {
    return URL.createObjectURL(
        new Blob([raw], { type: 'text/plain' }
        ))
}

