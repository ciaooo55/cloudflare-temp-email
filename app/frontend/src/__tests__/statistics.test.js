// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { createApp, h } from 'vue'
import Statistics from '../views/admin/Statistics.vue'
const fetch = vi.hoisted(() => vi.fn())
const usagePath = '/admin/cloudflare_usage'
vi.mock('../api', () => ({ api: { fetch } }))
vi.mock('../i18n/app', () => ({ useScopedI18n: () => ({ t: key => key }) }))
vi.mock('naive-ui', async () => {
  const { h } = await import('vue')
  return { NButton: { props: ['attrType'], setup: (props, { slots }) => () => h('button', { type: props.attrType || 'button' }, slots.default?.()) },
    NPopconfirm: { setup: (_, { slots }) => () => h('div', slots.trigger?.()) },
    NPagination: { setup: () => () => null } }
})
const data = { mailCount: 8, sendMailCount: 3, addressCount: 2, period: { start: '2026-11-16', end: '2026-11-22', startedAt: '2026-11-16T10:00:00.000Z' },
  days: Array.from({ length: 7 }, (_, i) => ({ day: `2026-11-${16 + i}`, received: i, sent: 1 })),
  mailboxes: { results: [{ address: 'busy@example.com', received: 8, sent: 3 }, { address: 'idle@example.com', received: 0, sent: 0 }],
    most: { address: 'busy@example.com', count: 8 }, least: { address: 'idle@example.com', count: 0 } } }
const budget = { days: [{ day: '2026-11-22', usage: { row_reads: 90, row_writes: 20 } },
  { day: '2026-11-21', usage: { row_reads: 40, row_writes: 5 } }], hard: { reads: 100, writes: 25 }, soft: { reads: 80, writes: 20 }, free: { reads: 5000000, writes: 100000 } }
let app, host
const defaultResult = path => path === usagePath ? { state: 'unconfigured' } : path.startsWith('/admin/statistics') ? structuredClone(data) : { budget: structuredClone(budget) }
beforeEach(() => { fetch.mockReset(); fetch.mockImplementation(async path => defaultResult(path)) })
afterEach(() => { app?.unmount(); host?.remove() })
function mount() { host = document.createElement('div'); document.body.append(host); app = createApp({ render: () => h(Statistics) }); app.mount(host) }

it('shows seven days, idle/active mailboxes, two-day reservations and clamped remaining budgets', async () => {
  mount()
  await vi.waitFor(() => expect(host.querySelectorAll('.chart-day')).toHaveLength(7))
  expect(host.querySelector('.mailbox-highlights').textContent).toContain('busy@example.com')
  expect(host.querySelector('.mailbox-highlights').textContent).toContain('idle@example.com')
  const cells = [...host.querySelectorAll('.budget-table tbody tr:first-child td')].map(cell => cell.textContent)
  expect(cells).toEqual(['40', '90', '130', '0', '10', '100'])
  expect(host.textContent).toContain('accountNotConnected')
  expect(host.textContent).toContain('resetHelp')
  expect(host.querySelector('.history-start').textContent).toContain('historyStart')
  expect(fetch).toHaveBeenCalledTimes(3)
})

it('shows unavailable history as dashes rather than invented zeros', async () => {
  fetch.mockImplementation(async path => path.startsWith('/admin/statistics') ? {
    ...structuredClone(data), days: [{ day: '2026-11-21', received: null, sent: null }, { day: '2026-11-22', received: 2, sent: 1 }]
  } : { budget: structuredClone(budget) })
  mount()
  await vi.waitFor(() => expect(host.querySelectorAll('.chart-day')).toHaveLength(2))
  expect(host.querySelector('.chart-values').textContent).toBe('— / —')
  expect(host.querySelector('.chart-legend').textContent).toContain('received 2')
  expect(host.innerHTML).not.toContain('NaN')
})

it('sorts per-mailbox counts without re-reading budget counters', async () => {
  mount()
  await vi.waitFor(() => expect(host.querySelectorAll('.chart-day')).toHaveLength(7))
  const select = host.querySelector('select')
  select.value = 'sent'; select.dispatchEvent(new Event('change', { bubbles: true }))
  await vi.waitFor(() => expect(fetch).toHaveBeenCalledWith('/admin/statistics?offset=0&sort=sent'))
  expect(fetch.mock.calls.filter(([path]) => path === '/admin/storage_status')).toHaveLength(1)
})

it('keeps budget readable when message statistics fail and does not invent zero usage on budget errors', async () => {
  fetch.mockImplementation(async path => { if (path.startsWith('/admin/statistics')) throw Error('paused'); return { budget: structuredClone(budget) } })
  mount()
  await vi.waitFor(() => expect(host.querySelector('.budget-table')).not.toBeNull())
  expect(host.textContent).toContain('loadFailed')
  app.unmount(); host.remove()
  fetch.mockRejectedValue(Error('unavailable'))
  mount()
  await vi.waitFor(() => expect(host.textContent).toContain('budgetUnavailable'))
  expect(host.querySelector('.budget-table')).toBeNull()
})

it('saves the analytics token only to its admin endpoint and renders real D1 totals separately', async () => {
  fetch.mockImplementation(async (path, options) => options?.method === 'PUT' ? {
    state: 'connected', accountId: 'a'.repeat(32),
    usage: { day: '2026-11-22', totals: { rowsRead: 8000, rowsWritten: 20 }, fetchedAt: '2026-11-22T05:00:00Z' }
  } : defaultResult(path))
  mount()
  const button = text => [...host.querySelectorAll('button')].find(button => button.textContent === text)
  await vi.waitFor(() => expect(button('accountConfigure')).toBeTruthy())
  button('accountConfigure').click()
  await vi.waitFor(() => expect(host.querySelector('input[type=password]')).not.toBeNull())
  const inputs = [...host.querySelectorAll('.analytics-form input')]
  for (const [i, value] of ['a'.repeat(32), 'x'.repeat(40)].entries()) {
    inputs[i].value = value
    inputs[i].dispatchEvent(new Event('input', { bubbles: true }))
  }
  host.querySelector('.analytics-form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
  await vi.waitFor(() => expect(host.querySelector('.account-usage')?.textContent).toContain('8,000'))
  expect(fetch).toHaveBeenCalledWith(usagePath, { method: 'PUT', showLoading: false,
    body: JSON.stringify({ accountId: 'a'.repeat(32), token: 'x'.repeat(40) }) })
  expect(host.querySelector('input[type=password]')).toBeNull()
  button('accountReplace').click()
  await vi.waitFor(() => expect(host.querySelector('input[type=password]')?.value).toBe(''))
})

it('keeps the application budget and mail stats displayed when analytics fails', async () => {
  fetch.mockImplementation(async path => {
    if (path === usagePath) throw Error('unavailable')
    return defaultResult(path)
  })
  mount()
  await vi.waitFor(() => expect(host.textContent).toContain('accountUnavailable'))
  expect(host.querySelector('.budget-table')).not.toBeNull()
  expect(host.querySelectorAll('.chart-day')).toHaveLength(7)
  expect(host.querySelector('.account-usage')).toBeNull()
})
