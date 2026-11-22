import { readFileSync } from 'node:fs'
import { expect, it } from 'vitest'
import { MESSAGE_REGISTRY } from '../i18n/message-registry'

const source = path => readFileSync(new URL(path, import.meta.url), 'utf8')

it('gives every minute-based deletion control explicit minute labels and integer input', () => {
    const view = source('../views/admin/Maintenance.vue')
    const inputs = [...view.matchAll(/<n-input-number\b[^>]*v-model:value="cleanupModel\.\w+Minutes"[\s\S]*?<\/n-input-number>/g)]
    expect(inputs).toHaveLength(3)
    for (const [input] of inputs) {
        expect(input).toContain("t('minutesPlaceholder')")
        expect(input).toContain("t('minutesUnit')")
        expect(input).toContain(':precision="0"')
        expect(input).not.toContain("t('tip')")
    }
    for (const language of ['en', 'zh']) {
        const text = MESSAGE_REGISTRY['views.admin.Maintenance']
        expect(text.minutesPlaceholder[language]).toBeTruthy()
        expect(text.cronTip[language]).toMatch(language === 'zh' ? /分钟.*天/ : /minutes.*days/)
    }
})

it('keeps access saving below its own controls and outside the protection card', () => {
    const view = source('../views/admin/IpBlacklistSettings.vue')
    expect(view.indexOf("t('saveAccess')")).toBeGreaterThan(view.indexOf('v-model:value="dailyRequestLimit"'))
    expect(view.indexOf("t('accessTitle')")).toBeGreaterThan(view.indexOf('<AbuseProtection />'))
})

it('scrolls snapshot columns inside the table rather than growing the mobile document', () => {
    expect(source('../views/admin/Snapshot.vue')).toContain(':scroll-x="900"')
})
