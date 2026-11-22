// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { createApp, h } from 'vue'
import Statistics from '../views/admin/Statistics.vue'
const fetch = vi.hoisted(() => vi.fn())
vi.mock('../api', () => ({ api: { fetch } }))
vi.mock('../i18n/app', () => ({ useScopedI18n: () => ({ t: key => key }) }))
vi.mock('naive-ui', async () => {
  const { h } = await import('vue')
  return { NButton: { setup: (_, { slots }) => () => h('button', slots.default?.()) },
    NPagination: { setup: () => () => null } }
})
const data = { mailCount: 8, sendMailCount: 3, addressCount: 2, period: { start: '2026-11-16', end: '2026-11-22', startedAt: '2026-11-16T10:00:00.000Z' },
  days: Array.from({ length: 7 }, (_, i) => ({ day: `2026-11-${16 + i}`, received: i, sent: 1 })),
  mailboxes: { results: [{ address: 'busy@example.com', received: 8, sent: 3 }, { address: 'idle@example.com', received: 0, sent: 0 }],
    most: { address: 'busy@example.com', count: 8 }, least: { address: 'idle@example.com', count: 0 } } }
const budget = { days: [{ day: '2026-11-22', usage: { row_reads: 90, row_writes: 20 } },
  { day: '2026-11-21', usage: { row_reads: 40, row_writes: 5 } }], hard: { reads: 100, writes: 25 }, soft: { reads: 80, writes: 20 }, free: { reads: 5000000, writes: 100000 } }
let app, host
beforeEach(() => { fetch.mockReset(); fetch.mockImplementation(async path => path.startsWith('/admin/statistics') ? structuredClone(data) : { budget: structuredClone(budget) }) })
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
  expect(fetch).toHaveBeenCalledTimes(2)
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
