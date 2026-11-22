// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { computed, createApp, h, nextTick, ref } from 'vue'
import Admin from '../views/Admin.vue'

const mocks = vi.hoisted(() => ({ state: {}, fetch: vi.fn(), error: vi.fn(), mounted: vi.fn() }))
vi.mock('../store', () => ({ useGlobalState: () => mocks.state }))
vi.mock('../api', () => ({ api: { fetch: mocks.fetch, getOpenSettings: vi.fn() } }))
vi.mock('../utils', () => ({ hashPassword: async value => value }))
vi.mock('../i18n/app', () => ({ useScopedI18n: () => ({ t: key => key, locale: ref('en') }) }))
vi.mock('../utils/composables', () => ({ useIsMobile: () => ref(false) }))
vi.mock('../components/Turnstile.vue', () => ({ default: { render: () => null } }))
vi.mock('../views/admin/Mails.vue', () => ({ default: { setup: () => { mocks.mounted(); return () => h('div', 'mail-content') } } }))
vi.mock('naive-ui', async () => {
    const { h } = await import('vue')
    const hidden = { render: () => null }
    return {
        useMessage: () => ({ error: mocks.error }),
        NModal: { props: ['show'], setup: (props, { slots }) => () => props.show
            ? h('div', { class: 'login-modal' }, [slots.default?.(), slots.action?.()]) : null },
        NInput: { props: ['value'], emits: ['update:value'], setup: (props, { emit }) => () => h('input', {
            value: props.value, onInput: event => emit('update:value', event.target.value),
        }) },
        NButton: { setup: (_, { slots }) => () => h('button', slots.default?.()) },
        NDrawer: hidden, NDrawerContent: hidden,
    }
})

let app, host
beforeEach(() => {
    vi.clearAllMocks()
    mocks.state = {
        adminAuth: ref(''), showAuth: ref(true), showAdminAuth: ref(false), adminTab: ref('mails'), loading: ref(false),
        openSettings: ref({ fetched: true, needAuth: true, disableAdminPasswordCheck: false }),
    }
    mocks.state.showAdminPage = computed(() => !!mocks.state.adminAuth.value || mocks.state.openSettings.value.disableAdminPasswordCheck)
})
afterEach(() => { app?.unmount(); host?.remove() })
function mount() {
    host = document.createElement('div')
    document.body.append(host)
    app = createApp(Admin)
    app.mount(host)
}

it('asks for the global credential before the admin credential without mounting protected content', async () => {
    mount()
    expect(host.querySelector('.login-modal')).toBeNull()
    expect(mocks.mounted).not.toHaveBeenCalled()
    mocks.state.showAuth.value = false
    mocks.state.openSettings.value.needAuth = false
    await nextTick()
    expect(host.querySelector('.login-modal')).not.toBeNull()
    expect(mocks.mounted).not.toHaveBeenCalled()
    expect(mocks.error).not.toHaveBeenCalled()
});

it('does not issue protected mount requests with a cached admin credential before global access is unlocked', async () => {
    mocks.state.adminAuth.value = 'cached-admin'
    mount()
    expect(mocks.mounted).not.toHaveBeenCalled()
    mocks.state.showAuth.value = false
    mocks.state.openSettings.value.needAuth = false
    await nextTick()
    expect(mocks.mounted).toHaveBeenCalledTimes(1)
    mocks.state.showAdminAuth.value = true
    await nextTick()
    expect(host.textContent).not.toContain('mail-content')
    expect(host.querySelector('.login-modal')).not.toBeNull()
});

it('still displays an actual wrong-admin-password error from an explicit login attempt', async () => {
    mocks.state.showAuth.value = false
    mocks.state.openSettings.value.needAuth = false
    mocks.fetch.mockRejectedValue(Object.assign(new Error('Wrong admin password'), { status: 401, authRequired: true }))
    mount()
    const input = host.querySelector('input')
    input.value = 'wrong-password'
    input.dispatchEvent(new Event('input'))
    await nextTick()
    host.querySelector('.login-modal button').click()
    await vi.waitFor(() => expect(mocks.error).toHaveBeenCalledWith('Wrong admin password'))
    expect(mocks.fetch).toHaveBeenCalledWith('/open_api/admin_login', expect.objectContaining({ method: 'POST' }))
    expect(mocks.state.adminAuth.value).toBe('')
});
