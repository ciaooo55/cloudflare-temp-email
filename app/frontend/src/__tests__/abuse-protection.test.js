// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest'
import { createApp, h, nextTick } from 'vue'
import AbuseProtection from '../components/AbuseProtection.vue'
const mocks = vi.hoisted(() => ({ fetch: vi.fn(), success: vi.fn(), error: vi.fn() }))
vi.mock('../api', () => ({ api: { fetch: mocks.fetch } }))
vi.mock('../i18n/app', () => ({ useScopedI18n: () => ({ t: key => key }) }))
vi.mock('naive-ui', async () => {
 const { h } = await import('vue')
 return {
  useMessage: () => ({ success: mocks.success, error: mocks.error }),
  NFormItemRow: { setup: (_, { slots }) => () => h('div', slots.default?.()) },
  NText: { setup: (_, { slots }) => () => h('span', slots.default?.()) },
  NButton: { setup: (_, { slots, attrs }) => () => h('button', attrs, slots.default?.()) },
  NSwitch: { props: ['value'], emits: ['update:value'], setup: (p, { emit }) => () => h('input', {
   type: 'checkbox', checked: p.value, onChange: e => emit('update:value', e.target.checked),
  }) },
  NInputNumber: { props: ['value', 'disabled'], emits: ['update:value'], setup: (p, { emit }) => () => h('input', {
   type: 'number', value: p.value, disabled: p.disabled, onInput: e => emit('update:value', Number(e.target.value)),
  }) },
 }
})
let app, host
const flush = async () => { for (let i = 0; i < 5; i++) { await Promise.resolve(); await nextTick() } }
afterEach(() => { app?.unmount(); host?.remove(); vi.clearAllMocks() })
it('loads editable rules, saves changed numbers and switches, and reports a rejected save', async () => {
 const initial = { inboundEnabled: true, inboundWindowMinutes: 10, inboundPairLimit: 10,
  inboundSenderLimit: 100, inboundBanMinutes: 10, snapshotEnabled: true,
  snapshotWindowSeconds: 60, snapshotLimit: 60, snapshotBanMinutes: 10 }
 mocks.fetch.mockResolvedValueOnce({ ...initial }).mockResolvedValueOnce({ success: true })
 host = document.createElement('div'); document.body.append(host)
 app = createApp(AbuseProtection); app.mount(host); await flush()
 const numbers = host.querySelectorAll('input[type=number]')
 expect(numbers).toHaveLength(7)
 numbers[1].value = '4'; numbers[1].dispatchEvent(new Event('input'))
 const toggle = host.querySelectorAll('input[type=checkbox]')[1]
 toggle.checked = false; toggle.dispatchEvent(new Event('change')); await flush()
 expect(numbers[4].disabled).toBe(true)
 host.querySelector('button').click(); await flush()
 expect(mocks.fetch.mock.calls[1][0]).toBe('/admin/abuse_protection')
 expect(JSON.parse(mocks.fetch.mock.calls[1][1].body)).toEqual({ ...initial, inboundPairLimit: 4, snapshotEnabled: false })
 expect(mocks.success).toHaveBeenCalledTimes(1)
 mocks.fetch.mockRejectedValueOnce(new Error('save denied'))
 host.querySelector('button').click(); await flush()
 expect(mocks.error).toHaveBeenCalledWith('save denied')
 expect(mocks.success).toHaveBeenCalledTimes(1)
})
