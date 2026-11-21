// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { buildReplyModel, buildForwardModel } from '../mail-actions'

const mail = { address: 'inbox@example.com', originalSource: 'bounce@example.com',
    source: 'sender@example.net', subject: 'Test', text: 'A <literal> value' }

describe('mail composer drafts', () => {
    it('replies to a plain header address instead of the envelope return path', () => {
        expect(buildReplyModel(mail, 'Reply')).toMatchObject({
            fromMail: mail.address, toMail: mail.source, contentType: 'text',
            content: '\n\n> A <literal> value',
        })
    })
    it('extracts a named header address', () => {
        expect(buildReplyModel({ ...mail, source: 'Sender <sender@example.net>' }, 'Reply'))
            .toMatchObject({ toName: 'Sender', toMail: 'sender@example.net' })
    })
    it('clears previous recipients when forwarding', () => {
        expect(buildForwardModel(mail, 'Forward')).toMatchObject({
            fromMail: mail.address, toName: '', toMail: '', contentType: 'text',
        })
    })
    it('sanitizes quoted HTML without entering rich editing', () => {
        const result = buildForwardModel({ ...mail, message: '<p>Quote</p><script>alert(1)</script>' }, 'Forward')
        expect(result.contentType).toBe('html')
        expect(result.content).toContain('<p>Quote</p>')
        expect(result.content).not.toContain('<script')
    })
})
