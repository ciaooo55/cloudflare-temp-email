import { describe, expect, it } from 'vitest'
import { createMailPolling, retryAfterSeconds } from '../mail-polling'

describe('mail polling policy', () => {
    it('backs off exponentially with jitter and caps repeated failures', () => {
        const polling = createMailPolling(() => 10, () => 0.5)
        expect(polling.fail({})).toEqual({ notify: true, delay: 20 })
        expect(polling.fail({})).toEqual({ notify: false, delay: 40 })
        for (let i = 0; i < 30; i++) expect(polling.fail({}).delay).toBeLessThanOrEqual(300)
        expect(polling.fail({}).delay).toBe(300)
        expect(createMailPolling(() => 10, () => 0).fail({}).delay).toBe(16)
        expect(createMailPolling(() => 10, () => 1).fail({}).delay).toBe(24)
    })

    it('honors Retry-After even when longer than the backoff cap', () => {
        expect(createMailPolling(() => 10).fail({ retryAfter: '600' }).delay).toBe(600)
        const now = Date.parse('2026-01-01T00:00:00Z')
        expect(retryAfterSeconds('Thu, 01 Jan 2026 00:10:00 GMT', now)).toBe(600)
        for (const value of [undefined, '', 'invalid', 'Wed, 31 Dec 2025 23:59:00 GMT']) {
            expect(retryAfterSeconds(value, now)).toBe(0)
        }
        expect(retryAfterSeconds('0', now)).toBe(0)
    })

    it.each([401, 403])('pauses on %s and resets after success or a manual retry', status => {
        let interval = 15
        const polling = createMailPolling(() => interval)
        expect(polling.fail({ status, authRequired: true }).notify).toBe(false)
        expect(polling.paused).toBe(true)
        interval = 30
        expect(polling.reset()).toBe(30)
        expect(polling.paused).toBe(false)
        expect(polling.failures).toBe(0)
        expect(polling.fail({}).notify).toBe(true)
    })
})
