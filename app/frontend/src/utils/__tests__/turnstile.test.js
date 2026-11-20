// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

beforeEach(() => { vi.resetModules(); vi.useFakeTimers() })
afterEach(() => {
    vi.useRealTimers()
    delete window.turnstile
    document.head.querySelectorAll('script').forEach(script => script.remove())
})

describe('on-demand Turnstile', () => {
    it('downloads no script before use and shares concurrent loads', async () => {
        const { loadTurnstile } = await import('../turnstile')
        expect(document.head.querySelector('script')).toBeNull()
        const first = loadTurnstile()
        expect(loadTurnstile()).toBe(first)
        const script = document.head.querySelector('script')
        expect(script.async).toBe(true)
        expect(document.head.querySelectorAll('script')).toHaveLength(1)
        window.turnstile = { render: vi.fn() }
        script.dispatchEvent(new Event('load'))
        await expect(first).resolves.toBe(window.turnstile)
        await expect(loadTurnstile()).resolves.toBe(window.turnstile)
    })

    it('fails closed on timeout and allows retry', async () => {
        const { loadTurnstile } = await import('../turnstile')
        const first = loadTurnstile()
        const rejected = expect(first).rejects.toThrow('timed out')
        await vi.advanceTimersByTimeAsync(15000)
        await rejected
        expect(document.head.querySelector('script')).toBeNull()
        const retry = loadTurnstile()
        const failed = expect(retry).rejects.toThrow('failed to load')
        document.head.querySelector('script').dispatchEvent(new Event('error'))
        await failed
    })
})
