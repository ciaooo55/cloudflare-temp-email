// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { createApp, h, nextTick, ref } from 'vue'
import MailBox from '../components/MailBox.vue'

const mocks = vi.hoisted(() => ({ state: {}, error: vi.fn() }))
vi.mock('../store', () => ({ useGlobalState: () => mocks.state }))
vi.mock('../i18n/app', () => ({ useScopedI18n: () => ({ t: key => key, locale: ref('en') }) }))
vi.mock('../utils', () => ({ utcToLocalDate: value => value }))
vi.mock('../utils/composables', () => ({ useIsMobile: () => ref(false) }))
vi.mock('../utils/email-parser', () => ({ processItem: async value => value, refreshParsedItem: async value => value, releaseMailResources: vi.fn() }))
vi.mock('../components/AiExtractInfo.vue', () => ({ default: { render: () => null } }))
vi.mock('naive-ui', async () => {
    const { h } = await import('vue')
    const wrapper = { setup: (_, { slots }) => () => h('div', slots.default?.()) }
    const hidden = { render: () => null }
    return { useMessage: () => ({ error: mocks.error }),
        NButton: { setup: (_, { slots }) => () => h('button', slots.default?.()) },
        NInput: hidden, NSpace: wrapper, NSwitch: hidden, NPagination: hidden,
        NPopconfirm: hidden, NDrawer: hidden, NDrawerContent: hidden }
})

let app, host, fetchMailData
beforeEach(() => {
    vi.useFakeTimers()
    vi.spyOn(Math, 'random').mockReturnValue(0.5)
    mocks.error.mockReset()
    mocks.state = { useUTCDate: ref(false), autoRefresh: ref(true), configAutoRefreshInterval: ref(10), loading: ref(false) }
    Object.defineProperty(document, 'hidden', { value: false, configurable: true })
    fetchMailData = vi.fn()
})
afterEach(() => { app?.unmount(); host?.remove(); vi.useRealTimers(); vi.restoreAllMocks() })

async function mount() {
    host = document.createElement('div')
    document.body.append(host)
    app = createApp({ render: () => h(MailBox, { fetchMailData }) })
    app.mount(host)
    await vi.advanceTimersByTimeAsync(0)
}
async function manualRefresh() {
    host.querySelector('.refresh-controls button').click()
    await vi.advanceTimersByTimeAsync(0)
}

it('backs off failed polling without repeated toasts, then resets on success and interval edits', async () => {
    fetchMailData.mockRejectedValueOnce(new Error('offline')).mockRejectedValueOnce(new Error('offline'))
        .mockResolvedValue({ results: [], count: 0 })
    await mount()
    expect(mocks.error).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(19000)
    expect(fetchMailData).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(1000)
    expect(fetchMailData).toHaveBeenCalledTimes(2)
    expect(mocks.error).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(40000)
    expect(fetchMailData).toHaveBeenCalledTimes(3)
    mocks.state.configAutoRefreshInterval.value = 5
    await nextTick()
    await vi.advanceTimersByTimeAsync(5000)
    expect(fetchMailData).toHaveBeenCalledTimes(4)
});

it('honors Retry-After and allows manual retries to reset consecutive failures', async () => {
    fetchMailData.mockRejectedValue(Object.assign(new Error('quota'), { status: 503, retryAfter: '90' }))
    await mount()
    await vi.advanceTimersByTimeAsync(89000)
    expect(fetchMailData).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(1000)
    expect(fetchMailData).toHaveBeenCalledTimes(2)
    expect(mocks.error).toHaveBeenCalledTimes(1)
    fetchMailData.mockRejectedValue(new Error('offline'))
    await manualRefresh()
    expect(fetchMailData).toHaveBeenCalledTimes(3)
    expect(mocks.error).toHaveBeenCalledTimes(2)
    await vi.advanceTimersByTimeAsync(20000)
    expect(fetchMailData).toHaveBeenCalledTimes(4)
});

it.each([401, 403])('pauses on %s until a manual refresh and does not toast expected login challenges', async status => {
    fetchMailData.mockRejectedValue(Object.assign(new Error('unlock required'), { status, authRequired: true }))
    await mount()
    await vi.advanceTimersByTimeAsync(600000)
    document.dispatchEvent(new Event('visibilitychange'))
    expect(fetchMailData).toHaveBeenCalledTimes(1)
    expect(mocks.error).not.toHaveBeenCalled()
    fetchMailData.mockResolvedValue({ results: [], count: 0 })
    await manualRefresh()
    await vi.advanceTimersByTimeAsync(10000)
    expect(fetchMailData).toHaveBeenCalledTimes(3)
});

it.each([undefined, '90', 'date'])('uses elapsed wall time for hidden-tab backoff with Retry-After %s', async retryAfter => {
    if (retryAfter === 'date') retryAfter = new Date(Date.now() + 90000).toUTCString()
    fetchMailData.mockRejectedValueOnce(Object.assign(new Error('offline'), { status: 503, retryAfter }))
        .mockResolvedValue({ results: [], count: 0 })
    await mount()
    Object.defineProperty(document, 'hidden', { value: true, configurable: true })
    await vi.advanceTimersByTimeAsync(10000)
    Object.defineProperty(document, 'hidden', { value: false, configurable: true })
    document.dispatchEvent(new Event('visibilitychange'))
    await vi.advanceTimersByTimeAsync(0)
    expect(fetchMailData).toHaveBeenCalledTimes(1)
    Object.defineProperty(document, 'hidden', { value: true, configurable: true })
    vi.setSystemTime(Date.now() + 120000)
    Object.defineProperty(document, 'hidden', { value: false, configurable: true })
    document.dispatchEvent(new Event('visibilitychange'))
    await vi.advanceTimersByTimeAsync(0)
    expect(fetchMailData).toHaveBeenCalledTimes(2)
    expect(mocks.error).toHaveBeenCalledTimes(1)
})

it('does not overlap requests or refresh while hidden and stops after unmount', async () => {
    let resolve
    fetchMailData.mockImplementationOnce(() => new Promise(done => { resolve = done }))
        .mockResolvedValue({ results: [], count: 0 })
    await mount()
    await vi.advanceTimersByTimeAsync(60000)
    expect(fetchMailData).toHaveBeenCalledTimes(1)
    resolve({ results: [], count: 0 })
    await vi.advanceTimersByTimeAsync(0)
    Object.defineProperty(document, 'hidden', { value: true, configurable: true })
    await vi.advanceTimersByTimeAsync(60000)
    expect(fetchMailData).toHaveBeenCalledTimes(1)
    app.unmount()
    app = null
    Object.defineProperty(document, 'hidden', { value: false, configurable: true })
    await vi.advanceTimersByTimeAsync(60000)
    expect(fetchMailData).toHaveBeenCalledTimes(1)
});
