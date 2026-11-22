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

it('sets only frame-embedding CSP and the legacy frame header globally', () => {
  const headers = readFileSync(new URL('../../public/_headers', import.meta.url), 'utf8')
  expect(headers).toContain("/*\n  Content-Security-Policy: frame-ancestors 'self'\n  X-Frame-Options: SAMEORIGIN")
  expect(headers).not.toContain('default-src')
})
