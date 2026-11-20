<script setup>
import { darkTheme } from 'naive-ui'
import { computed, onMounted, watchEffect } from 'vue'
import { useI18n } from 'vue-i18n'
import { useGlobalState } from './store'
import Header from './views/Header.vue'
import Footer from './views/Footer.vue'
import { getNaiveLocaleConfig } from './i18n/naive-locale'
import { DEFAULT_LOCALE, isSupportedLocale } from './i18n/utils'
import { APP_CONFIG } from './config'

const { isDark, loading, telegramApp, isTelegram } = useGlobalState()
isDark.value = true
const { locale } = useI18n({ useScope: 'global' })
const localeConfig = computed(() => getNaiveLocaleConfig(isSupportedLocale(locale.value) ? locale.value : DEFAULT_LOCALE))
const themeOverrides = {
  common: {
    primaryColor: '#a2b2ff', primaryColorHover: '#bdc8ff', primaryColorPressed: '#8599f0',
    primaryColorSuppl: '#a2b2ff', bodyColor: '#0d0f14', cardColor: '#151820',
    modalColor: '#191d27', popoverColor: '#202531', inputColor: '#10131a',
    tableColor: '#151820', borderColor: '#2a303d', dividerColor: '#272d39',
    textColorBase: '#e8ebf3', textColor1: '#e8ebf3', textColor2: '#b0b8ca',
    textColor3: '#929bad', borderRadius: '9px',
    fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", "Noto Sans SC", sans-serif'
  }
}
watchEffect(() => {
  document.documentElement.lang = isSupportedLocale(locale.value) ? locale.value : DEFAULT_LOCALE
})
onMounted(async () => {
  if (APP_CONFIG.IS_TELEGRAM !== true && APP_CONFIG.IS_TELEGRAM !== 'true') return
  if (!window.Telegram?.WebApp) {
    await new Promise((resolve, reject) => {
      const script = document.createElement('script')
      script.src = 'https://telegram.org/js/telegram-web-app.js'
      script.onload = resolve
      script.onerror = reject
      document.body.appendChild(script)
    })
  }
  telegramApp.value = window.Telegram?.WebApp || {}
  isTelegram.value = !!window.Telegram?.WebApp?.initData
})
</script>

<template>
  <n-config-provider :locale="localeConfig.locale" :date-locale="localeConfig.dateLocale"
    :theme="darkTheme" :theme-overrides="themeOverrides">
    <n-global-style />
    <n-notification-provider container-style="margin-top: 60px;">
      <n-message-provider>
        <n-dialog-provider>
          <n-spin :show="loading">
            <div class="app-shell">
              <Header />
              <router-view />
              <Footer />
            </div>
          </n-spin>
        </n-dialog-provider>
      </n-message-provider>
    </n-notification-provider>
  </n-config-provider>
</template>

<style>
:root { color-scheme: dark; --mail-bg: #0d0f14; --mail-panel: #151820; --mail-border: #272d39; --mail-muted: #929bad; --mail-accent: #a2b2ff; }
* { box-sizing: border-box; }
body { margin: 0; background: var(--mail-bg); }
button, a, input, textarea { -webkit-tap-highlight-color: transparent; }
button:focus-visible, a:focus-visible { outline: 2px solid var(--mail-accent); outline-offset: 3px; }
.app-shell { min-height: 100dvh; max-width: 1800px; margin: auto; padding: 0 28px; }
.n-card { --n-color-embedded: var(--mail-panel) !important; }
.n-card .n-card { border: 1px solid var(--mail-border); }
.n-switch { margin: 0 8px; }
@media (max-width: 767px) {
  .app-shell { padding: 0 14px; }
  :where(input, textarea, select, [contenteditable="true"]) { font-size: 16px !important; }
  :where(.n-input, .n-input-number, .n-base-selection) { --n-font-size: 16px !important; }
}
</style>
