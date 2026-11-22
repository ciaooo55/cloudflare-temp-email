// @vitest-environment node

import { readFileSync } from 'node:fs'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { onRequest } from '../../functions/_middleware.js'

afterEach(() => vi.unstubAllGlobals())

describe('Pages API backend selection', () => {
  const request = new Request('https://mail.example.com/admin/mails', {
    headers: { 'x-admin-auth': 'test-password' },
  })

  it('refuses to forward credentials without explicit backend configuration', async () => {
    const fetch = vi.fn()
    vi.stubGlobal('fetch', fetch)
    const response = await onRequest({ request, env: {} })
    expect(response.status).toBe(503)
    expect(await response.text()).toContain('BACKEND')
    expect(fetch).not.toHaveBeenCalled()
  })

  it('preserves an explicitly configured backend and auth headers', async () => {
    const fetch = vi.fn(async req => {
      expect(req.url).toBe('https://api.example.com/admin/mails')
      expect(req.headers.get('x-admin-auth')).toBe('test-password')
      return new Response('ok')
    })
    vi.stubGlobal('fetch', fetch)
    expect(await (await onRequest({ request, env: { BACKEND_URL: 'https://api.example.com' } })).text()).toBe('ok')
    expect(fetch).toHaveBeenCalledOnce()
  })

  it('prefers a service binding and leaves static requests alone', async () => {
    const backend = { fetch: vi.fn(async () => new Response('binding')) }
    const next = vi.fn(async () => new Response('static'))
    expect(await (await onRequest({ request, env: { BACKEND: backend }, next })).text()).toBe('binding')
    expect(backend.fetch).toHaveBeenCalledWith(request)
    const staticRequest = new Request('https://mail.example.com/')
    expect(await (await onRequest({ request: staticRequest, env: {}, next })).text()).toBe('static')
  })
})

it('protects ordinary pages but detaches frame restrictions for every Telegram Mini App route and alias', () => {
  const headers = readFileSync(new URL('../../public/_headers', import.meta.url), 'utf8')
  const router = readFileSync(new URL('../router/index.js', import.meta.url), 'utf8')
  expect(headers).toContain("/*\n  Content-Security-Policy: frame-ancestors 'self'\n  X-Frame-Options: SAMEORIGIN")
  expect(headers).not.toContain('default-src')
  const miniAppRoutes = [...router.matchAll(/path: '([^']+)',\s*alias: '([^']+)',\s*component: \(\) => import\('\.\.\/views\/telegram\/[^']+'\)/g)]
    .flatMap(match => [match[1], match[2]])
  expect(miniAppRoutes).toEqual(['/telegram_mail', '/:lang/telegram_mail'])
  const exemptPaths = miniAppRoutes.flatMap(path => [path, `${path}/`])
  const rules = headers.split(/\n(?=\/)/)
  const exemptions = rules.filter(rule => rule.includes('! X-Frame-Options') || rule.includes('! Content-Security-Policy'))
  expect(exemptions.map(rule => rule.split('\n')[0]).sort()).toEqual(exemptPaths.sort())
  for (const path of exemptPaths) {
    expect(rules).toContain(`${path}\n  ! X-Frame-Options\n  ! Content-Security-Policy`)
  }
})
