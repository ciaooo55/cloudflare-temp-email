import { Context } from 'hono'
import { email } from '../email/index'

// TEMPORARY: simulate receiving an email via the real email() handler, DELETE AFTER TESTING
export const simulateEmail = async (c: Context<HonoCustomType>) => {
    const { from, to, subject, textBody, htmlBody } = await c.req.json<{
        from?: string; to?: string; subject?: string; textBody?: string; htmlBody?: string;
    }>().catch(() => ({} as Record<string, string>));
    if (!to) return c.json({ success: false, error: 'to is required' }, 400);

    const logs: string[] = [];
    const origLog = console.log;
    const origErr = console.error;
    const origWarn = console.warn;
    console.log = (...a: unknown[]) => { logs.push('[log] ' + a.map(String).join(' ')); };
    console.error = (...a: unknown[]) => { logs.push('[err] ' + a.map(String).join(' ')); };
    console.warn = (...a: unknown[]) => { logs.push('[warn] ' + a.map(String).join(' ')); };

    const msgId = `<simulate-${Date.now()}@test.local>`;
    const rawLines = [
        `Message-ID: ${msgId}`,
        `From: ${from || 'sender@test.local'}`,
        `To: ${to}`,
        `Subject: ${subject || 'test'}`,
        `Date: ${new Date().toUTCString()}`,
        `MIME-Version: 1.0`,
        `Content-Type: multipart/alternative; boundary="sim-boundary"`,
        ``,
        `--sim-boundary`,
        `Content-Type: text/plain; charset=utf-8`,
        ``,
        textBody || '',
        `--sim-boundary`,
        `Content-Type: text/html; charset=utf-8`,
        ``,
        htmlBody || '',
        `--sim-boundary--`,
        ``,
    ];
    const raw = new ReadableStream({
        start(ctrl) { ctrl.enqueue(new TextEncoder().encode(rawLines.join('\r\n'))); ctrl.close(); }
    });
    const headers = new Headers();
    headers.set('from', from || 'sender@test.local');

    let result: unknown = null;
    let rejected: string | null = null;
    try {
        const fakeMessage = { from: from || 'sender@test.local', to, raw, headers, rawSize: rawLines.join('\r\n').length } as unknown as ForwardableEmailMessage;
        await email(fakeMessage, c.env, c.executionCtx as unknown as ExecutionContext);
        result = { success: true };
    } catch (e) {
        rejected = String(e);
    } finally {
        console.log = origLog; console.error = origErr; console.warn = origWarn;
    }
    return c.json({ success: !rejected, rejected, logs: logs.slice(-60), msgId });
};

export default { simulateEmail };
