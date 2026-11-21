// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp, defineComponent, h, nextTick, reactive, ref } from 'vue'
import MailContentRenderer from '../components/MailContentRenderer.vue'
import MailBox from '../components/MailBox.vue'

vi.mock('../store', () => ({
    useGlobalState: () => ({
        preferShowTextMail: ref(false), useIframeShowMail: ref(false),
        useUTCDate: ref(false), isDark: ref(false),
        autoRefresh: ref(false), configAutoRefreshInterval: ref(60), loading: ref(false),
    }),
}))
vi.mock('../i18n/app', () => ({ useScopedI18n: () => ({ t: key => key }) }))
vi.mock('../utils', () => ({ utcToLocalDate: value => value }))
vi.mock('../utils/composables', () => ({ useIsMobile: () => ref(false) }))
vi.mock('naive-ui', async () => {
    const { h } = await import('vue')
    const wrapper = { setup: (_, { slots }) => () => h('div', slots.default?.()) }
    const button = { setup: (_, { slots }) => () => h('button', slots.default?.()) }
    const hidden = { setup: () => () => null }
    return {
        useMessage: () => ({ success: vi.fn(), warning: vi.fn() }),
        NSpace: wrapper, NTag: wrapper, NAlert: wrapper, NIcon: wrapper,
        NButton: button, NDrawer: hidden, NDrawerContent: hidden,
        NModal: hidden, NPopconfirm: hidden, NSpin: wrapper, NList: wrapper,
        NListItem: wrapper, NThing: wrapper,
        NPagination: wrapper, NSwitch: wrapper, NInput: wrapper,
    }
})
vi.mock('../components/AiExtractInfo.vue', () => ({ default: { template: '<div />' } }))

const container = defineComponent({ setup: (_, { slots }) => () => h('div', slots.default?.()) })
const button = defineComponent({ setup: (_, { slots }) => () => h('button', slots.default?.()) })
const hidden = defineComponent({ setup: () => () => null })
let app, host

const mail = (id, address) => ({
    id, raw: 'raw mail ' + id, created_at: '2026-11-20', source: 'Sender <sender@example.com>',
    originalSource: 'envelope@example.com', address: 'inbox@example.com',
    originalRecipient: address, subject: 'Verification', text: 'Code 123456',
    message: '<p>Code 123456</p><img src="https://images.example.com/tracker.png">',
})

beforeEach(() => {
    vi.stubGlobal('URL', Object.assign(URL, {
        createObjectURL: vi.fn(() => 'blob:test-eml'), revokeObjectURL: vi.fn(),
    }))
    localStorage.setItem('autoLoadRemoteImages', 'true')
})
afterEach(() => { app?.unmount(); host?.remove(); vi.unstubAllGlobals(); localStorage.clear() })

function mount() {
    const props = reactive({ mail: mail(1, 'original@example.com') })
    host = document.createElement('div')
    document.body.append(host)
    app = createApp({ render: () => h(MailContentRenderer, props) })
    for (const tag of ['NSpace', 'NTag', 'NAlert', 'NIcon']) app.component(tag, container)
    app.component('NButton', button)
    for (const tag of ['NDrawer', 'NModal', 'NPopconfirm']) app.component(tag, hidden)
    app.mount(host)
    return props
}

describe('per-message image consent', () => {
    it('shows the inbox first and renders the reader after a message is selected', async () => {
        const item = mail(1, 'original@example.com')
        host = document.createElement('div')
        document.body.append(host)
        app = createApp({
            render: () => h(MailBox, {
                fetchMailData: async () => ({ results: [item], count: 1 }),
                processMail: async value => value,
            }),
        })
        app.mount(host)
        await vi.waitFor(() => expect(host.querySelector('.message-row')).not.toBeNull())
        expect(host.querySelector('.mail-text')).toBeNull()
        host.querySelector('.message-row').click()
        await vi.waitFor(() => expect(host.querySelector('.mail-text')?.textContent).toContain('Code 123456'))
        expect(host.querySelector('.mail-html')).toBeNull()
    })

    it('keeps plain text visible and hides HTML-only controls after viewing HTML', async () => {
        const props = mount()
        const toggle = [...host.querySelectorAll('button')].find(el => el.textContent.trim() === 'showHtmlMail')
        toggle.click()
        await nextTick()
        props.mail = { ...props.mail, message: '', text: 'first <literal>\nsecond line' }
        await nextTick()
        expect(host.querySelector('.mail-text').textContent).toBe('first <literal>\nsecond line')
        expect(host.querySelector('.mail-html')).toBeNull()
        expect(host.querySelector('iframe')).toBeNull()
        expect(host.textContent).not.toContain('showHtmlMail')
        expect(host.textContent).not.toContain('showTextMail')
        expect(host.textContent).not.toContain('loadRemoteImages')
    })

    it('ignores legacy auto-load preferences and loads only after a click, resetting for another mail', async () => {
        const props = mount()
        const body = () => host.querySelector('.mail-html').shadowRoot
        expect(host.querySelector('.mail-html')).toBeNull()
        expect(host.querySelector('.mail-text').textContent).toContain('Code 123456')
        expect(host.textContent).toContain('original@example.com')
        expect(host.textContent).toContain('envelope@example.com')
        const html = [...host.querySelectorAll('button')].find(el => el.textContent.trim() === 'showHtmlMail')
        html.click()
        await nextTick()
        expect(body().querySelector('img').src).not.toContain('https://images.example.com')
        const load = [...host.querySelectorAll('button')].find(el => el.textContent.trim() === 'loadRemoteImages')
        load.click()
        await nextTick()
        expect(body().querySelector('img').src).toBe('https://images.example.com/tracker.png')
        props.mail = mail(2, 'second@example.com')
        await nextTick()
        expect(host.querySelector('.mail-html')).toBeNull()
        expect(host.querySelector('.mail-text').textContent).toContain('Code 123456')
        expect(host.textContent).toContain('loadRemoteImages')
    })

    it('derives readable text for HTML-only mail without rendering images or style text', async () => {
        const props = mount()
        props.mail = { ...mail(3, 'html@example.com'), text: '',
            message: '<style>.secret { color: red }</style><p>Your code</p><p>654321<br>Expires soon</p><img src="https://images.example.com/tracker.png">' }
        await nextTick()
        expect(host.querySelector('.mail-text').textContent).toBe('Your code\n654321\nExpires soon')
        expect(host.querySelector('img')).toBeNull()
        const load = [...host.querySelectorAll('button')].find(el => el.textContent.trim() === 'loadRemoteImages')
        load.click()
        await nextTick()
        expect(host.querySelector('.mail-html').shadowRoot.querySelector('img').src)
            .toBe('https://images.example.com/tracker.png')
    })

    it('reuses the EML download URL across view changes and releases it on unmount', async () => {
        mount()
        expect(URL.createObjectURL).toHaveBeenCalledTimes(1)
        const toggle = [...host.querySelectorAll('button')].find(el => el.textContent.trim() === 'showHtmlMail')
        toggle.click()
        await nextTick()
        expect(URL.createObjectURL).toHaveBeenCalledTimes(1)
        app.unmount()
        app = null
        expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:test-eml')
    })
})
