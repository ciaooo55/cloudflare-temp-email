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
    mocks.state = Object.fromEntries(['loading', 'auth', 'announcement', 'showAuth', 'adminAuth', 'showAdminAuth']
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

describe('HTTP error metadata', () => {
    it('preserves partial cleanup progress on HTTP failures', async () => {
        const data = { success: false, deleted: 100, complete: false, message: 'Budget exhausted' }
        mocks.request.mockResolvedValue({ status: 500, data })
        const { api } = await import('../api')
        await expect(api.fetch('/admin/cleanup_raw_mails', { method: 'POST' })).rejects.toMatchObject({ status: 500, data })
    })
    it.each([429, 503])('retains status and Retry-After on HTTP %s', async status => {
        const response = { status, data: { message: 'Try later' }, headers: { 'retry-after': '600' } }
        if (status === 503) mocks.request.mockRejectedValue({ response })
        else mocks.request.mockResolvedValue(response)
        const { api } = await import('../api')
        await expect(api.fetch('/admin/mails')).rejects.toMatchObject({ status, retryAfter: '600', message: expect.stringContaining('Try later') })
    })

    it('keeps authentication challenges visible to callers and opens the matching dialog', async () => {
        mocks.request.mockResolvedValue({ status: 401, data: { code: 'AUTH_ADMIN_CREDENTIAL_INVALID', message: 'Admin password required' } })
        const { api } = await import('../api')
        await expect(api.fetch('/admin/mails')).rejects.toMatchObject({ status: 401, authRequired: true })
        expect(mocks.state.showAdminAuth.value).toBe(true)
        await expect(api.fetch('/open_api/admin_login', { method: 'POST' })).rejects.toThrow('Admin password required')
    })

    it('does not swallow wrong global passwords on the explicit site-login endpoint', async () => {
        mocks.request.mockResolvedValue({ status: 401, data: { code: 'AUTH_SITE_PASSWORD_INVALID', message: 'Wrong site password' } })
        const { api } = await import('../api')
        await expect(api.fetch('/open_api/site_login', { method: 'POST' })).rejects.toThrow('Wrong site password')
        expect(mocks.state.showAuth.value).toBe(true)
    })
})
