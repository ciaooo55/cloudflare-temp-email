// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { createApp, h, nextTick, ref } from 'vue'
import Maintenance from '../views/admin/Maintenance.vue'
import { MESSAGE_REGISTRY } from '../i18n/message-registry'

const mocks = vi.hoisted(() => ({ fetch: vi.fn(), confirm: vi.fn(), success: vi.fn(), warning: vi.fn(), error: vi.fn() }))
vi.mock('../api', () => ({ api: { fetch: mocks.fetch } }))
vi.mock('../store', () => ({ useGlobalState: () => ({ loading: ref(false) }) }))
vi.mock('../utils', () => ({ formatLocalDateTime: () => '' }))
vi.mock('../i18n/app', () => ({ useScopedI18n: () => ({ t: key => key }) }))
vi.mock('naive-ui', async importOriginal => {
    const actual = await importOriginal()
    const { h } = await import('vue')
    const wrapper = { setup: (_, { slots }) => () => h('div', slots.default?.()) }
    return {
        ...Object.fromEntries(Object.keys(actual).filter(name => /^N[A-Z]/.test(name)).map(name => [name, wrapper])),
        NButton: { setup: (_, { slots }) => () => h('button', slots.default?.()) },
        useMessage: () => ({ success: mocks.success, warning: mocks.warning, error: mocks.error }),
        useDialog: () => ({ warning: mocks.confirm }),
    }
})

let app, host
beforeEach(async () => {
    vi.clearAllMocks()
    mocks.fetch.mockResolvedValue(null)
    host = document.createElement('div')
    document.body.append(host)
    app = createApp(Maintenance)
    app.mount(host)
    await nextTick()
})
afterEach(() => { app.unmount(); host.remove() })

async function cleanup() {
    [...host.querySelectorAll('button')].find(button => button.textContent.includes('cleanupNow')).click()
    await mocks.confirm.mock.calls[0][0].onPositiveClick()
}

it.each([0, 7])('shows the deleted count for a complete cleanup of %s rows', async deleted => {
    mocks.fetch.mockResolvedValueOnce({ success: true, deleted, complete: true })
    await cleanup()
    expect(mocks.success).toHaveBeenCalledWith(`cleanupSuccess (rawMailsDeleted ${deleted} rows)`)
    expect(mocks.warning).not.toHaveBeenCalled()
})

it('shows remaining work after reaching the per-run cap', async () => {
    mocks.fetch.mockResolvedValueOnce({ success: true, deleted: 300, complete: false })
    await cleanup()
    expect(mocks.warning).toHaveBeenCalledWith(expect.stringContaining('rawMailsDeleted 300 rows · rawMailsRemaining'))
    expect(mocks.success).not.toHaveBeenCalled()
})

it('preserves partial deletion progress and remaining work on budget failures', async () => {
    mocks.fetch.mockRejectedValueOnce(Object.assign(new Error('Budget exhausted'), { data: { success: false, deleted: 100, complete: false } }))
    await cleanup()
    expect(mocks.error).toHaveBeenCalledWith('Budget exhausted (rawMailsDeleted 100 rows · rawMailsRemaining)')
})

it('still displays failures without a progress payload', async () => {
    mocks.fetch.mockRejectedValueOnce(new Error('offline'))
    await cleanup()
    expect(mocks.error).toHaveBeenCalledWith('offline')
})

it('provides remaining-work text in both maintained languages', () => {
    const text = MESSAGE_REGISTRY['views.admin.Maintenance'].rawMailsRemaining
    expect(text.en).toContain('More remaining')
    expect(text.zh).toContain('仍有待清理')
})
