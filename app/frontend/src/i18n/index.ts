import { createI18n } from 'vue-i18n'

import {
    FALLBACK_LOCALE,
    getInitialLocale,
} from './utils'
import { I18N_MESSAGES, loadLocaleMessages } from './messages'
import type { SupportedLocale } from './locale-registry'

const i18n = createI18n({
    legacy: false, // you must set `false`, to use Composition API
    locale: getInitialLocale(),
    fallbackLocale: FALLBACK_LOCALE,
    messages: I18N_MESSAGES,
    missingWarn: false,
    fallbackWarn: false,
})

const pendingLocales = new Map<SupportedLocale, Promise<void>>()
export const ensureLocaleMessages = (locale: SupportedLocale): Promise<void> => {
    if (locale === 'zh' || locale === 'en') return Promise.resolve()
    let pending = pendingLocales.get(locale)
    if (!pending) {
        pending = loadLocaleMessages(locale)
            .then(messages => { i18n.global.setLocaleMessage(locale, messages) })
            .catch(error => { pendingLocales.delete(locale); throw error })
        pendingLocales.set(locale, pending)
    }
    return pending
}

export default i18n;
