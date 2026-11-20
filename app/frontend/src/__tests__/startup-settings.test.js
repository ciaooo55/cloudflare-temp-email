import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ state: {}, request: vi.fn() }))
vi.mock('../store', () => ({ useGlobalState: () => mocks.state }))
vi.mock('../i18n', () => ({ default: { global: { locale: { value: 'zh' } } } }))
vi.mock('../config', () => ({ APP_CONFIG: { API_BASE: '' } }))
vi.mock('../utils/fingerprint', () => ({ getFingerprint: async () => 'fingerprint' }))
vi.mock('axios', () => ({ default: { create: () => ({ request: mocks.request }) } }))

beforeEach(() => {
    vi.resetModules()
    mocks.request.mockReset()
    mocks.state = Object.fromEntries(['loading', 'auth', 'jwt', 'announcement', 'showAuth', 'adminAuth', 'showAdminAuth']
        .map(key => [key, { value: '' }]))
    mocks.state.openSettings = { value: { fetched: false } }
})

describe('startup settings', () => {
    it('shares concurrent requests from the header and active page, preserving fingerprint headers', async () => {
        let resolve
        mocks.request.mockReturnValue(new Promise(done => { resolve = done }))
        const { api } = await import('../api')
        const message = { error: vi.fn() }
        const first = api.getOpenSettings(message)
        const second = api.getOpenSettings(message)
        await vi.waitFor(() => expect(mocks.request).toHaveBeenCalledTimes(1))
        expect(mocks.request.mock.calls[0][1].headers['x-fingerprint']).toBe('fingerprint')
        resolve({ status: 200, data: { domains: ['example.com'] } })
        await Promise.all([first, second])
        expect(mocks.state.openSettings.value.fetched).toBe(true)
        expect(message.error).not.toHaveBeenCalled()
    })

    it('allows retry after a failed settings request', async () => {
        mocks.request.mockRejectedValueOnce(new Error('offline'))
            .mockResolvedValue({ status: 200, data: { domains: ['example.com'] } })
        const { api } = await import('../api')
        const message = { error: vi.fn() }
        await api.getOpenSettings(message)
        await api.getOpenSettings(message)
        expect(mocks.request).toHaveBeenCalledTimes(2)
        expect(mocks.state.openSettings.value.domains).toEqual([{ label: 'example.com', value: 'example.com' }])
    })
})
