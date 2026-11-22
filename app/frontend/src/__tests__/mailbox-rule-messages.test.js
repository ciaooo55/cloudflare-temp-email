import { expect, it } from 'vitest'
import { createI18n } from 'vue-i18n'
import { MESSAGE_REGISTRY } from '../i18n/message-registry'

for (const locale of ['en', 'zh']) {
  it(`renders all mailbox examples intact with the real ${locale} message compiler`, () => {
    const keys = ['fromExample', 'domainExample', 'mailboxExample', 'blockedSenderDomain']
    const source = MESSAGE_REGISTRY['views.admin.AccountSettings']
    const messages = Object.fromEntries(keys.map(key => [key, source[key][locale]]))
    const i18n = createI18n({ legacy: false, locale, messages: { [locale]: messages } })
    for (const key of keys) {
      expect(i18n.global.t(key)).toBe(messages[key].replaceAll("{'@'}", '@'))
      expect(i18n.global.t(key)).toContain('@')
    }
  })
}
