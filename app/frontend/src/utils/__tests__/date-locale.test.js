// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { formatLocalDateTime, utcToLocalDate } from '../index'

afterEach(() => {
    localStorage.removeItem('preferredLocale')
    vi.restoreAllMocks()
})

describe('date locale lookup', () => {
    it.each([
        ['zh', 'zh-CN'], ['en', 'en-US'], ['es', 'es-ES'],
        ['de', 'de-DE'], ['ja', 'ja-JP'], ['pt-BR', 'pt-BR'],
    ])('formats %s using %s', (locale, expected) => {
        localStorage.setItem('preferredLocale', locale)
        const date = new Date('2026-01-02T03:04:05Z')
        const format = vi.spyOn(date, 'toLocaleString').mockReturnValue('formatted')
        expect(formatLocalDateTime(date)).toBe('formatted')
        expect(format).toHaveBeenCalledWith(expected)
    })

    it.each([null, '', 'invalid', 'ptBR'])('falls back to Chinese for %s', locale => {
        if (locale !== null) localStorage.setItem('preferredLocale', locale)
        const date = new Date('2026-01-02T03:04:05Z')
        const format = vi.spyOn(date, 'toLocaleString').mockReturnValue('formatted')
        expect(formatLocalDateTime(date)).toBe('formatted')
        expect(format).toHaveBeenCalledWith('zh-CN')
    })

    it('preserves empty, invalid and explicit UTC date handling', () => {
        expect(utcToLocalDate(null, false)).toBe('')
        expect(utcToLocalDate('', false)).toBe('')
        expect(utcToLocalDate('not a date', false)).toBe('not a date UTC')
        expect(utcToLocalDate('2026-01-02 03:04:05', true)).toBe('2026-01-02 03:04:05 UTC')
    })
})
