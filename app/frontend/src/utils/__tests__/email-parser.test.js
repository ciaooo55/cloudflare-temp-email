import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import PostalMime from 'postal-mime'
import { processItem, processSentItem, refreshParsedItem, releaseMailResources } from '../email-parser'

const wasmParse = vi.hoisted(() => vi.fn())
vi.mock('mail-parser-wasm', () => ({ parse_message: wasmParse }))
beforeEach(() => {
    vi.stubGlobal('URL', Object.assign(URL, {
        createObjectURL: vi.fn(() => 'blob:attachment'), revokeObjectURL: vi.fn(),
    }))
    wasmParse.mockReset()
})
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals() })

describe('lightweight MIME parsing', () => {
    it.each(['&nbsp;123456', '&#160;123456', '&#160;&#49;&#50;&#51;&#52;&#53;&#54;'])('decodes HTML entities before extracting historical codes: %s', async (encoded) => {
        const parsed = await processItem({ raw: 'Subject: Login\r\nContent-Type: text/html\r\n\r\n<p>Your verification code:' + encoded + '</p>', metadata: null });
        expect(JSON.parse(parsed.metadata).ai_extract.result).toBe('123456');
    })
    it('reads current JSON sent messages without treating them as MIME', () => {
        const raw = JSON.stringify({ version: 'v2', subject: 'Sent subject', to_mail: 'recipient@example.com', content: 'Sent body', is_html: false });
        const parsed = processSentItem({ address: 'sender@example.com', raw });
        expect(parsed.subject).toBe('Sent subject');
        expect(parsed.text).toBe('Sent body');
        expect(parsed.originalRecipient).toBe('recipient@example.com');
        expect(parsed.source).toBe('sender@example.com');
        expect(parsed.rawFormat).toBe('json');
        expect(parsed.raw).toBe(raw);
    })
    it('reads legacy JSON sent messages including HTML and multiple recipients', () => {
        const raw = JSON.stringify({ subject: 'Legacy sent', personalizations: [{ to: [{ email: 'first@example.com' }, { email: 'second@example.com' }] }], content: [{ type: 'text/html', value: '<p>Legacy body</p>' }] });
        const parsed = processSentItem({ address: 'sender@example.com', raw });
        expect(parsed.subject).toBe('Legacy sent');
        expect(parsed.message).toBe('<p>Legacy body</p>');
        expect(parsed.originalRecipient).toBe('first@example.com, second@example.com');
    })
    it('keeps locally extracted codes when refreshing historical mail with empty server metadata', async () => {
        const incoming = { source: 'envelope@example.com', raw: 'Subject: Verification code\r\n\r\nYour verification code is 123456.', metadata: null };
        const parsed = await processItem({ ...incoming });
        const refreshed = refreshParsedItem(parsed, { ...incoming });
        expect(JSON.parse(refreshed.metadata).ai_extract.result).toBe('123456');
        expect(refreshed.attachments).toBe(parsed.attachments);
        expect(JSON.parse(refreshParsedItem(parsed, { ...incoming, metadata: '{}' }).metadata).ai_extract.result).toBe('123456');
    })
    it('extracts verification codes locally when historical mail has no metadata', async () => {
        const parsed = await processItem({ raw: 'Subject: Verification code 654321\r\nContent-Type: text/plain\r\n\r\nUse this code to log in.' })
        expect(JSON.parse(parsed.metadata).ai_extract).toMatchObject({ type: 'auth_code', result: '654321' })
    })
    it('preserves headers, original addresses and text without loading WASM', async () => {
        const parsed = await processItem({ source: 'envelope@example.com', raw: [
            'From: Sender <from@example.com>', 'To: Original <original+tag@example.com>',
            'Subject: Code', 'Content-Type: text/plain; charset=utf-8', '', 'Code 123456',
        ].join('\r\n') })
        expect(parsed.originalSource).toBe('envelope@example.com')
        expect(parsed.source).toBe('Sender <from@example.com>')
        expect(parsed.originalRecipient).toBe('original+tag@example.com')
        expect(parsed.text).toContain('Code 123456')
        expect(wasmParse).not.toHaveBeenCalled()
    })
    it('keeps inline attachments usable and releases their URLs', async () => {
        const parsed = await processItem({ raw: [
            'MIME-Version: 1.0', 'Content-Type: multipart/related; boundary=boundary', '',
            '--boundary', 'Content-Type: text/html; charset=utf-8', '',
            '<p>Code 123456</p><img src="cid:logo"><img src="cid:logo">',
            '--boundary', 'Content-Type: image/png', 'Content-ID: <logo>',
            'Content-Disposition: inline; filename="logo.png"', 'Content-Transfer-Encoding: base64', '',
            'aGk=', '--boundary--',
        ].join('\r\n') })
        expect(parsed.message.match(/blob:attachment/g)).toHaveLength(2)
        expect(parsed.attachments[0].filename).toBe('logo.png')
        expect(parsed.attachments[0].size).toBe('2 B')
        releaseMailResources(parsed)
        expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:attachment')
        expect(wasmParse).not.toHaveBeenCalled()
    })
    it('retains the WASM fallback when the primary parser fails', async () => {
        vi.spyOn(PostalMime, 'parse').mockRejectedValue(new Error('malformed MIME'))
        vi.spyOn(console, 'error').mockImplementation(() => {})
        wasmParse.mockReturnValue({ subject: 'Fallback', text: 'code 123456' })
        const parsed = await processItem({ raw: 'raw', source: 'sender@example.com' })
        expect(parsed.subject).toBe('Fallback')
        expect(parsed.text).toBe('code 123456')
        expect(wasmParse).toHaveBeenCalledTimes(1)
    })
})
