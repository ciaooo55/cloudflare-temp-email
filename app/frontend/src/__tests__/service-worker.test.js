import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import { describe, expect, it, vi } from 'vitest'

const workerSource = readFileSync(new URL('../sw.js', import.meta.url), 'utf8')
const bridgeSource = readFileSync(new URL('../../public/registerSW.js', import.meta.url), 'utf8')

const worker = () => {
    const handlers = {}
    const navigate = vi.fn().mockResolvedValue({})
    const self = {
        addEventListener: (name, handler) => { handlers[name] = handler },
        skipWaiting: vi.fn().mockResolvedValue(),
        clients: {
            claim: vi.fn().mockResolvedValue(),
            matchAll: vi.fn().mockResolvedValue([{ url: 'https://mail.test/zh/admin', navigate }]),
        },
        registration: { scope: 'https://mail.test/', unregister: vi.fn().mockResolvedValue(true) },
        caches: {
            keys: vi.fn().mockResolvedValue([
                'page-cache', 'asset-cache', 'workbox-precache-v2-https://mail.test/',
                'unrelated', 'workbox-precache-v2-https://mail.test/other/',
            ]),
            delete: vi.fn().mockResolvedValue(true),
        },
    }
    runInNewContext(workerSource, { self })
    const dispatch = async name => {
        let work
        handlers[name]({ waitUntil: promise => { work = promise } })
        await work
    }
    return { self, handlers, navigate, dispatch }
}

describe('retiring the offline page cache', () => {
    it('takes over without waiting for existing tabs to close', async () => {
        const { self, dispatch, handlers } = worker()
        await dispatch('install')
        expect(self.skipWaiting).toHaveBeenCalledOnce()
        expect(handlers.fetch).toBeUndefined()
    })

    it('clears only this app caches and reloads existing windows after unregistering', async () => {
        const { self, dispatch, navigate } = worker()
        await dispatch('activate')
        expect(self.caches.delete.mock.calls.map(([name]) => name)).toEqual([
            'page-cache', 'asset-cache', 'workbox-precache-v2-https://mail.test/',
        ])
        expect(self.clients.claim).toHaveBeenCalledOnce()
        expect(self.registration.unregister).toHaveBeenCalledOnce()
        expect(navigate).toHaveBeenCalledWith('https://mail.test/zh/admin')
        expect(self.registration.unregister.mock.invocationCallOrder[0]).toBeLessThan(navigate.mock.invocationCallOrder[0])
    })

    it('still upgrades if cache storage is unavailable or one window closes', async () => {
        const { self, dispatch, navigate } = worker()
        self.caches.keys.mockRejectedValue(new Error('Unavailable'))
        self.clients.matchAll.mockResolvedValue([
            { url: 'https://mail.test/closed', navigate: vi.fn().mockRejectedValue(new Error('Closed')) },
            { url: 'https://mail.test/zh/admin', navigate },
        ])
        await dispatch('activate')
        expect(self.registration.unregister).toHaveBeenCalledOnce()
        expect(navigate).toHaveBeenCalledOnce()
    })
})

describe('legacy registration bridge', () => {
    const run = serviceWorker => runInNewContext(bridgeSource, {
        navigator: serviceWorker ? { serviceWorker } : {}, URL,
    })

    it('works without service worker support', async () => {
        await expect(run()).resolves.toBeUndefined()
    })

    it('does not register a worker for new visitors', async () => {
        const serviceWorker = { getRegistration: vi.fn().mockResolvedValue(), register: vi.fn() }
        await run(serviceWorker)
        expect(serviceWorker.getRegistration).toHaveBeenCalledWith('/')
        expect(serviceWorker.register).not.toHaveBeenCalled()
    })

    it.each(['active', 'waiting', 'installing'])('updates an existing %s worker', async state => {
        const update = vi.fn().mockResolvedValue()
        await run({ getRegistration: vi.fn().mockResolvedValue({
            [state]: { scriptURL: 'https://mail.test/sw.js' }, update,
        }) })
        expect(update).toHaveBeenCalledOnce()
    })

    it('leaves unrelated workers alone', async () => {
        const update = vi.fn()
        await run({ getRegistration: vi.fn().mockResolvedValue({
            active: { scriptURL: 'https://mail.test/other.js' }, update,
        }) })
        expect(update).not.toHaveBeenCalled()
    })

    it('tolerates an offline update', async () => {
        await expect(run({ getRegistration: vi.fn().mockResolvedValue({
            active: { scriptURL: 'https://mail.test/sw.js' },
            update: vi.fn().mockRejectedValue(new Error('Offline')),
        }) })).resolves.toBeUndefined()
    })
})
