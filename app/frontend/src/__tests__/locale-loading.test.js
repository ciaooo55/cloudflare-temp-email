// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import i18n, { ensureLocaleMessages } from '../i18n'

describe('on-demand translations', () => {
    it('keeps source languages ready and loads other languages before switching', async () => {
        expect(i18n.global.getLocaleMessage('zh').views.Admin.workspace).toBe('邮箱工作台')
        expect(i18n.global.getLocaleMessage('de')).toEqual({})
        const first = ensureLocaleMessages('de')
        expect(ensureLocaleMessages('de')).toBe(first)
        await first
        expect(i18n.global.getLocaleMessage('de').views).toBeDefined()
        await ensureLocaleMessages('ja')
        expect(i18n.global.getLocaleMessage('ja').views).toBeDefined()
    })
})
