import { Context } from "hono";
import { email } from "../email";

// TEMPORARY: simulate receiving an email through the real email() handler.
// POST /admin/simulate_email { from, to, subject, textBody, htmlBody }
// This triggers the FULL production flow: D1 store -> AI extract -> parse
// -> snapshot refresh -> TG push -> Bark push -> webhook.
// DELETE THIS FILE AND ITS ROUTE AFTER TESTING.
async function simulateEmail(c: Context<HonoCustomType>): Promise<Response> {
    const body = await c.req.json<{
        from?: string; to?: string; subject?: string;
        textBody?: string; htmlBody?: string;
    }>().catch(() => null);
    if (!body || !body.to) {
        return c.text("missing 'to'", 400);
    }
    const from = body.from || "test-sender@example.com";
    const to = body.to;
    const subject = body.subject || "Test Email";
    const textBody = body.textBody || "This is a test email body.";
    const htmlBody = body.htmlBody || `<html><body><p>${textBody}</p></body></html>`;
    const messageId = `<simulate-${Date.now()}@test.local>`;
    const dateStr = new Date().toUTCString();

    const rawEmail =
        `From: ${from}\r\n` +
        `To: ${to}\r\n` +
        `Subject: ${subject}\r\n` +
        `Message-ID: ${messageId}\r\n` +
        `Date: ${dateStr}\r\n` +
        `MIME-Version: 1.0\r\n` +
        `Content-Type: multipart/alternative; boundary="SIMBOUNDARY"\r\n` +
        `\r\n` +
        `--SIMBOUNDARY\r\n` +
        `Content-Type: text/plain; charset="utf-8"\r\n` +
        `\r\n` +
        `${textBody}\r\n` +
        `--SIMBOUNDARY\r\n` +
        `Content-Type: text/html; charset="utf-8"\r\n` +
        `\r\n` +
        `${htmlBody}\r\n` +
        `--SIMBOUNDARY--\r\n`;

    const rawBytes = new TextEncoder().encode(rawEmail);
    const headers = new Headers();
    headers.set("Message-ID", messageId);
    headers.set("From", from);
    headers.set("To", to);
    headers.set("Subject", subject);
    headers.set("Date", dateStr);

    let rejected: string | null = null;
    const mockMessage = {
        from,
        to,
        headers,
        rawSize: rawBytes.length,
        raw: new ReadableStream<Uint8Array>({
            start(controller) {
                controller.enqueue(rawBytes);
                controller.close();
            }
        }),
        setReject: (reason: string) => { rejected = reason; },
        forward: async () => { throw new Error("not supported in simulation"); },
        reply: async () => { throw new Error("not supported in simulation"); },
    } as unknown as ForwardableEmailMessage;

    const logs: string[] = [];
    const origLog = console.log;
    const origErr = console.error;
    console.log = (...a: any[]) => { logs.push("[log] " + a.map(String).join(" ")); };
    console.error = (...a: any[]) => { logs.push("[err] " + a.map(String).join(" ")); };
    try {
        await email(mockMessage, c.env as any, {
            waitUntil: (p: Promise<any>) => { /* run inline for test visibility */ },
            passThroughOnException: () => {},
        } as unknown as ExecutionContext);
    } catch (e) {
        logs.push("[exception] " + String(e));
    } finally {
        console.log = origLog;
        console.error = origErr;
    }
    return c.json({ success: true, rejected, logs: logs.slice(-60) });
}

export default { simulateEmail };
