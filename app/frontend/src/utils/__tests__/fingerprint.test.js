import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ value: '', load: vi.fn(), get: vi.fn() }))
vi.mock('../../store', () => ({ useGlobalState: () => ({ browserFingerprint: mocks }) }))
vi.mock('@fingerprintjs/fingerprintjs', () => ({ default: { load: mocks.load } }))
beforeEach(() => {
    vi.resetModules()
    mocks.value = ''
    mocks.load.mockReset().mockResolvedValue({ get: mocks.get })
    mocks.get.mockReset().mockResolvedValue({ visitorId: 'visitor-id' })
})

describe('fingerprint single flight', () => {
    it('collects once across concurrent API requests and retains the security header value', async () => {
        const { getFingerprint } = await import('../fingerprint')
        expect(mocks.load).not.toHaveBeenCalled()
        const first = getFingerprint()
        expect(getFingerprint()).toBe(first)
        expect(await first).toBe('visitor-id')
        expect(await getFingerprint()).toBe('visitor-id')
        expect(mocks.load).toHaveBeenCalledTimes(1)
        expect(mocks.get).toHaveBeenCalledTimes(1)
    })
})
