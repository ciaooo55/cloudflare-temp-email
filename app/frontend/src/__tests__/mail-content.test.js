// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp, defineComponent, h, nextTick, reactive, ref } from 'vue'
import MailContentRenderer from '../components/MailContentRenderer.vue'
import MailBox from '../components/MailBox.vue'

const feedback = vi.hoisted(() => ({ success: vi.fn(), warning: vi.fn(), error: vi.fn() }))

vi.mock('../store', () => ({
    useGlobalState: () => ({
        preferShowTextMail: ref(false), useIframeShowMail: ref(false),
        useUTCDate: ref(false), isDark: ref(false),
        autoRefresh: ref(false), configAutoRefreshInterval: ref(60), loading: ref(false),
    }),
}))
vi.mock('../i18n/app', () => ({ useScopedI18n: () => ({ locale: ref('zh'), t: (key, values) => values ? key + ':' + Object.values(values).join('/') : key }) }))
vi.mock('../utils', () => ({ utcToLocalDate: value => value }))
vi.mock('../utils/composables', () => ({ useIsMobile: () => ref(false) }))
vi.mock('naive-ui', async () => {
    const { h } = await import('vue')
    const wrapper = { setup: (_, { slots }) => () => h('div', slots.default?.()) }
    const button = { setup: (_, { slots }) => () => h('button', slots.default?.()) }
    const hidden = { setup: () => () => null }
    return {
        useMessage: () => feedback,
        NSpace: wrapper, NTag: wrapper, NAlert: wrapper, NIcon: wrapper,
        NButton: button, NDrawer: hidden, NDrawerContent: hidden,
        NModal: hidden, NPopconfirm: hidden, NSpin: wrapper, NList: wrapper,
        NListItem: wrapper, NThing: wrapper,
        NPagination: wrapper, NSwitch: wrapper,
        NInput: { props: ['value'], emits: ['update:value'], setup: (props, { emit }) => () => h('input', {
            value: props.value, onInput: event => emit('update:value', event.target.value),
        }) },
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
    vi.clearAllMocks()
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
    it('preserves Chinese reader guidance when no message is selected', () => {
        host = document.createElement('div')
        document.body.append(host)
        app = createApp({ render: () => h(MailBox, {
            fetchMailData: async () => ({ results: [], count: 0 }),
        }) })
        app.mount(host)
        expect(host.querySelector('.reader-placeholder p').textContent).toBe('选择一封邮件')
        expect(host.querySelector('.reader-placeholder span').textContent).toBe('文字优先 · 图片仅在点击后加载')
    })

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

describe('mail summary addresses', () => {
    it('counts current-page matches, searches visible fields, and distinguishes no matches from an empty mailbox', async () => {
        const items = [mail(1, 'first@example.com'), { ...mail(2, 'second@example.com'),
            originalSource: 'unique-envelope@example.com', text: '', preview: 'HTML-only summary' }, mail(3, 'third@example.com')]
        host = document.createElement('div')
        document.body.append(host)
        app = createApp({ render: () => h(MailBox, {
            fetchMailData: async () => ({ results: items, count: 55 }),
            processMail: async value => value, showFilterInput: true,
        }) })
        app.mount(host)
        await vi.waitFor(() => expect(host.querySelectorAll('.message-row')).toHaveLength(3))
        expect(host.querySelector('.list-caption').textContent).toBe('messageCount:55')
        expect(host.querySelectorAll('.message-preview')[1].textContent).toBe('HTML-only summary')
        const filter = async value => {
            const input = host.querySelector('input')
            input.value = value
            input.dispatchEvent(new Event('input'))
            await nextTick()
        }
        for (const value of [' second@example.com ', 'UNIQUE-ENVELOPE', 'html-only']) {
            await filter(value)
            expect(host.querySelectorAll('.message-row')).toHaveLength(1)
            expect(host.querySelector('.list-caption').textContent).toBe('filteredCount:1/55')
        }
        await filter('no such mail')
        expect(host.querySelector('.list-caption').textContent).toBe('filteredCount:0/55')
        expect(host.querySelector('.mail-empty').textContent).toContain('noFilterMatches')
        await filter('   ')
        expect(host.querySelectorAll('.message-row')).toHaveLength(3)
        expect(host.querySelector('.list-caption').textContent).toBe('messageCount:55')
    })

    it.each([true, false])('copies the recipient without opening or marking another mail read (original fields: %s)', async hasOriginal => {
        const items = [mail(1, 'first@example.com'), { ...mail(2, 'original+tag@icloud.com'), is_unread: 1 }]
        if (!hasOriginal) {
            items[1].originalSource = ''
            items[1].originalRecipient = ''
        }
        const writeText = vi.fn().mockResolvedValue(undefined)
        const updateMailReadStatus = vi.fn().mockResolvedValue(undefined)
        vi.stubGlobal('navigator', { clipboard: { writeText } })
        host = document.createElement('div')
        document.body.append(host)
        app = createApp({ render: () => h(MailBox, {
            fetchMailData: async () => ({ results: items, count: 2 }),
            processMail: async value => value,
            enableMailReadStatus: true, updateMailReadStatus,
        }) })
        app.mount(host)
        await vi.waitFor(() => expect(host.querySelectorAll('.message-row')).toHaveLength(2))
        const rows = host.querySelectorAll('.message-row')
        const expectedRecipient = hasOriginal ? 'original+tag@icloud.com' : 'inbox@example.com'
        expect(rows[1].querySelector('.message-original-sender').textContent)
            .toContain(hasOriginal ? 'envelope@example.com' : items[1].source)
        expect(rows[1].querySelector('.message-original-recipient .message-address-value').title).toBe(expectedRecipient)
        expect(rows[1].querySelector('button button')).toBeNull()
        rows[1].querySelector('.message-copy').click()
        await vi.waitFor(() => expect(writeText).toHaveBeenCalledWith(expectedRecipient))
        expect(host.querySelector('.mail-text')).toBeNull()
        expect(updateMailReadStatus).not.toHaveBeenCalled()
        expect(feedback.success).toHaveBeenCalledWith('copied')
        rows[0].querySelector('.message-open').click()
        await vi.waitFor(() => expect(host.querySelector('.mail-text')).not.toBeNull())
        rows[1].querySelector('.message-copy').click()
        await nextTick()
        expect(rows[0].classList.contains('selected')).toBe(true)
        expect(rows[1].classList.contains('unread')).toBe(true)
        expect(updateMailReadStatus).not.toHaveBeenCalled()
    })

    it('reports a clipboard failure without opening the message or claiming success', async () => {
        vi.stubGlobal('navigator', { clipboard: { writeText: vi.fn().mockRejectedValue(new Error('Denied')) } })
        host = document.createElement('div')
        document.body.append(host)
        app = createApp({ render: () => h(MailBox, {
            fetchMailData: async () => ({ results: [mail(1, 'original@example.com')], count: 1 }),
            processMail: async value => value,
        }) })
        app.mount(host)
        await vi.waitFor(() => expect(host.querySelector('.message-copy')).not.toBeNull())
        host.querySelector('.message-copy').click()
        await vi.waitFor(() => expect(feedback.error).toHaveBeenCalledWith('copyFailed'))
        expect(feedback.success).not.toHaveBeenCalled()
        expect(host.querySelector('.mail-text')).toBeNull()
    })
})
