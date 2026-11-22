import { MESSAGE_REGISTRY, getMessageSource } from './message-registry'

import type { MessageKey, MessageNamespace } from './message-registry'

import type { SupportedLocale } from './locale-registry'

interface LocaleTree { [key: string]: string | LocaleTree }
type SourceLocale = Extract<SupportedLocale, 'en' | 'zh'>
type AdditionalLocale = Exclude<SupportedLocale, SourceLocale>

const additionalLocaleSources: Partial<Record<AdditionalLocale, Record<string, string>>> = {}
const localeLoaders = {
  es: () => import('./locales/source/es').then(module => module.esMessages),
  'pt-BR': () => import('./locales/source/ptBR').then(module => module.ptBRMessages),
  ja: () => import('./locales/source/ja').then(module => module.jaMessages),
  de: () => import('./locales/source/de').then(module => module.deMessages),
}

const setNestedValue = (target: LocaleTree, path: string, value: string | LocaleTree) => {
  const segments = path.split('.')
  let current: LocaleTree = target

  for (const segment of segments.slice(0, -1)) {
    const existing = current[segment]
    if (typeof existing === 'object' && existing !== null && !Array.isArray(existing)) {
      current = existing as LocaleTree
      continue
    }

    current[segment] = {}
    current = current[segment] as LocaleTree
  }

  current[segments.at(-1) as string] = value
}

const buildSourceLocaleMessages = (locale: SourceLocale) => {
  const messages: LocaleTree = {}

  for (const namespace of Object.keys(MESSAGE_REGISTRY) as MessageNamespace[]) {
    const keys = Object.keys(MESSAGE_REGISTRY[namespace]) as MessageKey<typeof namespace>[]
    for (const key of keys) {
      const message = getMessageSource(namespace, key, locale)
      if (message === undefined) continue
      setNestedValue(messages, `${namespace}.${key}`, message)
    }
  }

  return messages
}

const buildAdditionalLocaleMessages = (locale: AdditionalLocale) => {
  const messages: LocaleTree = {}

  for (const [key, value] of Object.entries(additionalLocaleSources[locale] || {})) {
    setNestedValue(messages, key, value)
  }

  return messages
}

export const I18N_MESSAGES: Record<SupportedLocale, LocaleTree> = {
  zh: buildSourceLocaleMessages('zh'),
  en: buildSourceLocaleMessages('en'),
  es: {},
  'pt-BR': {},
  ja: {},
  de: {},
}

export const loadLocaleMessages = async (locale: SupportedLocale) => {
  if (locale === 'zh' || locale === 'en') return I18N_MESSAGES[locale]
  additionalLocaleSources[locale] ||= await localeLoaders[locale]()
  return buildAdditionalLocaleMessages(locale)
}
