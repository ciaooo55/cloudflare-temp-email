import { describe, expect, it } from 'vitest'
import { adminGroups, createAdminSelectOptions, normalizeAdminSection } from '../admin-navigation'

describe('admin workspace navigation', () => {
    const keys = adminGroups.flatMap(group => group.items.map(([key]) => key))

    it('keeps each working admin tool accessible exactly once', () => {
        expect(new Set(keys).size).toBe(keys.length)
        expect(keys).toHaveLength(22)
        expect(keys).toEqual(expect.arrayContaining([
            'mails', 'unknow', 'sendBox', 'sendMail', 'mailWebhook',
            'account', 'account_create', 'account_settings', 'senderAccess',
            'ipBlacklistSettings', 'aiExtractSettings', 'webhook',
            'telegram', 'bark', 'snapshot', 'statistics', 'database',
            'workerconfig', 'maintenance_tasks', 'appearance', 'adminAccount', 'about',
        ]))
    })

    it('migrates duplicate and legacy setup tabs without stranding existing sessions', () => {
        for (const tab of ['qucickSetup', 'quickSetup', 'maintenance']) {
            expect(normalizeAdminSection(tab)).toBe('database')
        }
        for (const tab of keys) expect(normalizeAdminSection(tab)).toBe(tab)
        expect(normalizeAdminSection('removed')).toBe('mails')
    })

    it('separates daily mail from rules and integrations without duplicating pages', () => {
        expect(adminGroups.find(group => group.key === 'mail').items.map(([key]) => key))
            .toEqual(['mails', 'sendMail', 'sendBox'])
        expect(adminGroups.find(group => group.key === 'notifications').items.map(([key]) => key))
            .toContain('mailWebhook')
        expect(adminGroups.find(group => group.key === 'rules').items.map(([key]) => key))
            .toContain('account_settings')
        expect(adminGroups.every(group => group.description)).toBe(true)
    })

    it('gives mobile select groups unique stable keys across locale changes', () => {
        const options = createAdminSelectOptions(label => `zh:${label}`)
        const translated = createAdminSelectOptions(label => `en:${label}`)
        expect(options.map(group => group.key)).toEqual(adminGroups.map(group => group.key))
        expect(new Set(options.map(group => group.key)).size).toBe(5)
        expect(translated.map(group => group.key)).toEqual(options.map(group => group.key))
        expect(options.flatMap(group => group.children.map(item => item.value))).toEqual(keys)
        expect(options.every(group => group.type === 'group' && group.label.startsWith('zh:'))).toBe(true)
        expect(translated.every(group => group.label.startsWith('en:'))).toBe(true)
    })
})
