type MailEntity =
    | { type: "url"; offset: number; length: number }
    | { type: "pre"; offset: number; length: number };
type Range = { type: "url" | "pre"; start: number; end: number };

// Telegram allows 4096 characters per message; leave room for client differences.
const MAX_MESSAGE_LENGTH = 3900;
const URL = /https?:\/\/[^\s<>"']+/gi;
const CODE = /(?:验证码|驗證碼|校验码|校驗碼|动态码|動態碼|认证码|認證碼|認証コード|確認コード|verification\s*code|security\s*code|auth(?:entication)?\s*code|one[- ]time\s*(?:code|password)|OTP|passcode)\s*(?::|：|is|是|为|為)?\s*([A-Za-z0-9]{4,10})(?![A-Za-z0-9])/gi;

export function mailMessageParts(text: string): { text: string; entities: MailEntity[] }[] {
    const ranges: Range[] = [];
    for (const match of text.matchAll(URL)) {
        const url = match[0].replace(/[.,;!?，。；！？）)\]]+$/, "");
        if (url) ranges.push({ type: "url", start: match.index, end: match.index + url.length });
    }
    for (const match of text.matchAll(CODE)) {
        const code = match[1];
        if (!/\d/.test(code)) continue;
        const start = match.index + match[0].lastIndexOf(code);
        const end = start + code.length;
        if (!ranges.some(range => range.type === "url" && start < range.end && end > range.start)) {
            ranges.push({ type: "pre", start, end });
        }
    }
    ranges.sort((a, b) => a.start - b.start);

    const parts: { text: string; entities: MailEntity[] }[] = [];
    for (let start = 0; start < text.length;) {
        let end = Math.min(start + MAX_MESSAGE_LENGTH, text.length);
        if (end < text.length) {
            const crossing = ranges.find(range => range.start < end && range.end > end);
            if (crossing && crossing.start > start) end = crossing.start;
            else if (crossing && crossing.end - start <= MAX_MESSAGE_LENGTH) end = crossing.end;
            const newline = text.lastIndexOf("\n", end - 1);
            if (newline >= start + MAX_MESSAGE_LENGTH / 2) end = newline + 1;
            if (end < text.length && /[\uD800-\uDBFF]/.test(text[end - 1])) end--;
        }
        parts.push({
            text: text.slice(start, end),
            entities: ranges.filter(range => range.start >= start && range.end <= end)
                .map(range => range.type === "url"
                    ? { type: "url" as const, offset: range.start - start, length: range.end - range.start }
                    : { type: "pre" as const, offset: range.start - start, length: range.end - range.start })
        });
        start = end;
    }
    return parts;
}
