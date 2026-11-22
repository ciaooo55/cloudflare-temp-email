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

    it.each(['de', 'es', 'ja', 'pt-BR'])('translates workspace and original-address labels in %s without Chinese fallback', async locale => {
        await ensureLocaleMessages(locale)
        const messages = i18n.global.getLocaleMessage(locale)
        const source = i18n.global.getLocaleMessage('zh')
        for (const key of ['workspace', 'notifications', 'dailyMail', 'dailyMailHint', 'mailboxesHint', 'mailRules', 'mailRulesHint', 'notificationsHint', 'systemHint', 'privacyFirst']) {
            expect(messages.views.Admin[key]).toBeTruthy()
            expect(messages.views.Admin[key]).not.toBe(source.views.Admin[key])
        }
        for (const key of ['originalSender', 'originalRecipient', 'loadRemoteImages']) {
            expect(messages.components.MailContentRenderer[key]).toBeTruthy()
            expect(messages.components.MailContentRenderer[key]).not.toBe(source.components.MailContentRenderer[key])
        }
        expect(messages.components.MailBox.originalRecipient).toBeTruthy()
    })

    it.each([
        ['en', 'No messages'], ['zh', '暂无邮件'], ['de', 'Keine Nachrichten'],
        ['es', 'No hay mensajes'], ['ja', 'メールはありません'], ['pt-BR', 'Nenhuma mensagem'],
    ])('uses a folder-neutral empty state in %s', async (locale, expected) => {
        await ensureLocaleMessages(locale)
        const messages = i18n.global.getLocaleMessage(locale).components.MailBox
        expect(messages.emptyMessages).toBe(expected)
        expect(messages.emptyInbox).toBeUndefined()
    })

    it.each(['en', 'zh', 'de', 'es', 'ja', 'pt-BR'])('explains filtering, cleanup units and save scopes in %s', async locale => {
        await ensureLocaleMessages(locale)
        const messages = i18n.global.getLocaleMessage(locale)
        expect(messages.components.MailBox.filteredCount).toContain('{matched}')
        expect(messages.components.MailBox.filteredCount).toContain('{total}')
        expect(messages.views.admin.Maintenance.minutesPlaceholder).toBeTruthy()
        expect(messages.views.admin.Maintenance.minutesUnit).toBeTruthy()
        expect(messages.views.admin.IpBlacklistSettings.saveAccess).toBeTruthy()
    })
})
