<script setup>
import { computed, onMounted, ref } from 'vue'
import { useHead } from '@unhead/vue'
import { useRoute, useRouter } from 'vue-router'
import { useScopedI18n } from '@/i18n/app'
import { useGlobalState } from '../store'
import { api } from '../api'
import { hashPassword } from '../utils'
import { DEFAULT_LOCALE, isSupportedLocale, replaceLocaleInFullPath } from '../i18n/utils'
import { getLocaleLabel, SUPPORTED_LOCALES } from '../i18n/locale-registry'
import Turnstile from '../components/Turnstile.vue'

const { showAuth, auth, loading, openSettings, preferredLocale } = useGlobalState()
const { t, locale } = useScopedI18n('views.Header')
const route = useRoute()
const router = useRouter()
const message = useMessage()
const notification = useNotification()
const cfToken = ref('')
const turnstileRef = ref(null)
const languageOptions = SUPPORTED_LOCALES.map(value => ({ label: getLocaleLabel(value), key: value }))
const localeLabel = computed(() => getLocaleLabel(locale.value))
const changeLocale = async lang => {
  if (!isSupportedLocale(lang)) return
  const path = replaceLocaleInFullPath(route.fullPath, lang)
  if (lang === DEFAULT_LOCALE) preferredLocale.value = lang
  await router.push({ path, force: true })
  preferredLocale.value = lang
}
const authFunc = async () => {
  try {
    await api.fetch('/open_api/site_login', {
      method: 'POST', body: JSON.stringify({ password: await hashPassword(auth.value), cf_token: cfToken.value })
    })
    location.reload()
  } catch (error) {
    message.error(error.message || 'error')
    turnstileRef.value?.refresh?.()
  }
}
useHead({ title: () => openSettings.value.title || t('title') })
onMounted(() => api.getOpenSettings(message, notification))
</script>

<template>
  <header class="site-header">
    <a class="site-brand" href="/" :aria-label="openSettings.title || t('title')">
      <span class="brand-symbol" aria-hidden="true">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6">
          <rect x="3" y="5" width="18" height="14" rx="4" /><path d="m4 7 8 6 8-6" />
        </svg>
      </span>
      <span>{{ openSettings.title || t('title') }}</span>
    </a>
    <n-dropdown :options="languageOptions" @select="changeLocale" trigger="click">
      <n-button text size="small" class="language-button" :aria-label="localeLabel">
        {{ localeLabel }} <span aria-hidden="true" class="language-arrow">⌄</span>
      </n-button>
    </n-dropdown>
  </header>
  <n-modal v-model:show="showAuth" :closable="false" :close-on-esc="false" :mask-closable="false"
    preset="dialog" :title="t('accessHeader')">
    <p>{{ t('accessTip') }}</p>
    <n-input v-model:value="auth" type="password" :aria-label="t('accessHeader')"
      show-password-on="click" @keyup.enter="authFunc" />
    <Turnstile v-if="openSettings.enableGlobalTurnstileCheck" ref="turnstileRef" v-model:value="cfToken" />
    <template #action>
      <n-button :loading="loading" @click="authFunc" type="primary">{{ t('ok') }}</n-button>
    </template>
  </n-modal>
</template>

<style scoped>
.site-header { height: 76px; display: flex; align-items: center; justify-content: space-between; gap: 16px; border-bottom: 1px solid var(--mail-border); }
.site-brand { display: inline-flex; align-items: center; gap: 12px; min-width: 0; color: #eef1fa; text-decoration: none; font-weight: 650; font-size: 16px; letter-spacing: -.03em; }
.site-brand > span:last-child { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.brand-symbol { display: grid; place-items: center; background: #222b49; color: #b7c4ff; width: 36px; height: 36px; border: 1px solid #34426b; border-radius: 11px; flex: none; }
.brand-symbol svg { width: 23px; height: 23px; }
.language-button { flex: none; }
.language-arrow { margin-left: 9px; color: var(--mail-muted); }
@media (max-width: 767px) { .site-header { height: 64px; } .site-brand { font-size: 15px; gap: 9px; } }
</style>
