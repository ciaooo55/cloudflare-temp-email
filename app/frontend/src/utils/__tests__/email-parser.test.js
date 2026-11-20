import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import PostalMime from 'postal-mime'
import { processItem, releaseMailResources } from '../email-parser'

const wasmParse = vi.hoisted(() => vi.fn())
vi.mock('mail-parser-wasm', () => ({ parse_message: wasmParse }))
beforeEach(() => {
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:attachment')
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})
    wasmParse.mockReset()
})
afterEach(() => vi.restoreAllMocks())

describe('lightweight MIME parsing', () => {
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
