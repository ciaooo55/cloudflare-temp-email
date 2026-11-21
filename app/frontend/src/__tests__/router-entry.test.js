// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import router from '../router'

vi.mock('../store', () => ({ useGlobalState: () => ({ preferredLocale: { value: '' } }) }))
vi.mock('../i18n', () => ({
    default: { global: { locale: { value: 'zh' } } },
    ensureLocaleMessages: async () => {},
}))

describe('mail workspace entry', () => {
    it.each([['/', '/admin'], ['/zh/', '/admin'], ['/en/', '/en/admin'], ['/de/', '/de/admin']])(
        'preserves the language when redirecting %s to the inbox', (path, expected) => {
            expect(router.options.routes[0].redirect({ path, query: {}, hash: '' }).path).toBe(expected)
        })
})
