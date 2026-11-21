// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp, h, nextTick, reactive, ref } from 'vue'
import { adminGroups } from '../utils/admin-navigation'
import Mails from '../views/admin/Mails.vue'
import TelegramMail from '../views/telegram/Mail.vue'
import { api } from '../api'
import { processItem, releaseMailResources } from '../utils/email-parser'

const state = {
    adminMailTabAddress: ref(''), adminTab: ref('mails'), sendMailModel: ref({}),
    telegramApp: ref({ initData: 'signed-init' }), openSettings: ref({ enableMailReadStatus: true }),
}
const route = reactive({ query: { mail_id: '1' } })
const mail = { id: 1, address: 'inbox@example.com', subject: 'Hello', source: 'Sender <sender@example.com>',
    originalSource: 'envelope@example.com', text: 'Body', message: '<p>Body</p>' }
vi.mock('../store', () => ({ useGlobalState: () => state }))
vi.mock('vue-router', () => ({ useRoute: () => route }))
vi.mock('../api', () => ({ api: { fetch: vi.fn() } }))
vi.mock('../i18n/app', () => ({ useScopedI18n: () => ({ t: key => key }) }))
vi.mock('naive-ui', async () => {
    const { h } = await import('vue')
    const wrapper = { setup: (_, { slots }) => () => h('section', slots.default?.()) }
    return { useMessage: () => ({ error: vi.fn() }),
        NCard: wrapper, NInputGroup: wrapper, NInput: wrapper, NButton: wrapper }
})
vi.mock('../utils/email-parser', () => ({
    processItem: vi.fn(async item => ({ ...item, parsed: true })),
    releaseMailResources: vi.fn(),
}))
vi.mock('../components/MailBox.vue', () => ({
    default: { setup: (_, { emit }) => () => h('div', [
        h('button', { onClick: () => emit('reply', mail) }, 'reply'),
        h('button', { onClick: () => emit('forward', mail) }, 'forward'),
    ]) },
}))
vi.mock('../components/MailContentRenderer.vue', () => ({
    default: { props: ['mail'], setup: props => () => h('pre', JSON.stringify(props.mail)) },
}))
let app, host
function mount(component) {
    host = document.createElement('div')
    document.body.append(host)
    app = createApp(component)
    for (const tag of ['NCard', 'NInputGroup', 'NInput', 'NButton']) {
        app.component(tag, { setup: (_, { slots }) => () => h('section', slots.default?.()) })
    }
    app.mount(host)
}
beforeEach(() => {
    vi.clearAllMocks()
    state.adminTab.value = 'mails'
    state.sendMailModel.value = {}
    state.telegramApp.value = { initData: 'signed-init' }
    route.query.mail_id = '1'
    api.fetch.mockResolvedValue(mail)
})
afterEach(() => { app?.unmount(); host?.remove() })

describe('admin mail actions', () => {
    it.each(['reply', 'forward'])('opens the composer from %s without legacy navigation state', async action => {
        state.sendMailModel.value = { toMail: 'previous@example.com', toName: 'Previous' }
        mount(Mails)
        host.querySelectorAll('button')[action === 'reply' ? 0 : 1].click()
        await nextTick()
        expect(state.adminTab.value).toBe('sendMail')
        expect(adminGroups.flatMap(group => group.items).some(([key]) => key === state.adminTab.value)).toBe(true)
        expect(state.sendMailModel.value.fromMail).toBe('inbox@example.com')
        expect(state.sendMailModel.value.subject).toBe(action === 'reply' ? 'reply: Hello' : 'forwardMail: Hello')
        expect(state.sendMailModel.value.toMail).toBe(action === 'reply' ? 'sender@example.com' : '')
    })
})

describe('Telegram mail reader', () => {
    it('uses the shared reader and releases parsed resources on unmount', async () => {
        mount(TelegramMail)
        await vi.waitFor(() => expect(host.querySelector('pre')).not.toBeNull())
        expect(api.fetch).toHaveBeenCalledWith('/telegram/get_mail', {
            method: 'POST', body: JSON.stringify({ initData: 'signed-init', mailId: '1' }),
        })
        expect(host.querySelector('iframe')).toBeNull()
        expect(JSON.parse(host.querySelector('pre').textContent)).toMatchObject({ id: 1, parsed: true })
        app.unmount()
        app = null
        expect(releaseMailResources).toHaveBeenCalledWith(expect.objectContaining({ id: 1, parsed: true }))
    })

    it('does not fetch without Telegram authentication data', async () => {
        state.telegramApp.value = {}
        mount(TelegramMail)
        await nextTick()
        expect(api.fetch).not.toHaveBeenCalled()
    })

    it('ignores an old response after switching messages', async () => {
        let resolveOld
        api.fetch.mockReturnValueOnce(new Promise(resolve => { resolveOld = resolve }))
            .mockResolvedValueOnce({ ...mail, id: 2 })
        mount(TelegramMail)
        route.query.mail_id = '2'
        await vi.waitFor(() => expect(host.querySelector('pre')).not.toBeNull())
        resolveOld(mail)
        await nextTick()
        expect(JSON.parse(host.querySelector('pre').textContent).id).toBe(2)
        expect(processItem).toHaveBeenCalledTimes(1)
    })
})
