export function mailBody(text: string, html: string): string {
    const source = text || html
        .replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, "")
        .replace(/<img\b[^>]*>/gi, "[图片]")
        .replace(/<a\b([^>]*)>([\s\S]*?)<\/a>/gi, (_match, attributes: string, content: string) => {
            const href = attributes.match(/\bhref\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i);
            const url = (href?.[1] || href?.[2] || href?.[3] || "").replace(/&amp;/gi, "&");
            const label = content.replace(/<[^>]+>/g, " ").trim();
            return label === "[图片]" ? label : /^https?:\/\//i.test(url) && label !== url
                ? `${label} ${url}` : label;
        })
        .replace(/<\s*(br|\/p|\/div|\/section|\/article|\/tr|\/table|\/h[1-6]|\/li)\b[^>]*>/gi, "\n")
        .replace(/<\s*(p|div|section|article|tr|table|h[1-6]|li)\b[^>]*>/gi, "\n")
        .replace(/<[^>]+>/g, " ")
        .replace(/&nbsp;|&#160;/gi, " ")
        .replace(/&amp;/gi, "&")
        .replace(/&lt;/gi, "<")
        .replace(/&gt;/gi, ">");

    return source
        .replace(/\[image:[^\]\n]*\](?:[ \t]*(?:<https?:\/\/[^>\s]+>|\(https?:\/\/[^)\s]+\)))?/gi, "[图片]")
        .replace(/!\[[^\]\n]*\]\(https?:\/\/[^)\s]+\)/gi, "[图片]")
        .replace(/https?:\/\/[^\s<>"']+/gi, url => {
            const bare = url.replace(/[.,;!?，。；！？）)\]]+$/, "");
            try {
                return /\.(?:png|jpe?g|gif|webp|avif|svg|bmp|ico)$/i.test(new URL(bare).pathname)
                    ? `[图片]${url.slice(bare.length)}` : url;
            } catch {
                return url;
            }
        })
        .replace(/[\u00a0\u1680\u2000-\u200a\u202f\u205f\u3000]/g, " ")
        .replace(/[\u200b-\u200d\ufeff]/g, "")
        .replace(/\r\n?/g, "\n")
        .split("\n")
        .map(line => line.replace(/[ \t]+/g, " ").trim())
        .join("\n")
        .replace(/\n{3,}/g, "\n\n")
        .trim();
}
