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
  },
  Button: {
    fontWeight: '500', heightMedium: '34px', heightSmall: '29px', fontSizeMedium: '12px',
    borderRadiusMedium: '8px', borderRadiusSmall: '7px', paddingMedium: '0 14px',
  },
  Card: { paddingMedium: '22px', titleFontSizeMedium: '14px', titleFontWeight: '550', borderRadius: '12px' },
  Input: { heightMedium: '36px', borderRadius: '8px', fontSizeMedium: '13px' },
  DataTable: {
    thColor: '#12161e', tdColor: '#151820', tdColorHover: '#1b2230',
    thFontWeight: '500', thTextColor: '#8e9ab0', borderColor: '#272d39', tdPaddingMedium: '15px 16px',
  },
  Table: { thColor: '#12161e', tdColor: '#151820', thFontWeight: '500', borderColor: '#272d39' },
  Divider: { color: '#272d39', textColor: '#a1abc0', fontWeight: '500' },
  Tag: { borderRadius: '6px' },
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
.workspace-panel { font-size: 13px; }
.workspace-panel .n-button__icon { font-size: 16px; }
.settings-page { width: 100%; max-width: 1120px; }
.settings-surface { padding: 24px; border: 1px solid var(--mail-border); border-radius: 12px; background: var(--mail-panel); min-width: 0; }
.settings-surface > .n-card { background: transparent; border-radius: 0; border: 0; border-top: 1px solid var(--mail-border); margin-top: 22px; }
.settings-surface > .n-card > .n-card-header { padding: 22px 0 16px; }
.settings-surface > .n-card > .n-card__content { padding: 0; }
.settings-surface > .n-card > .n-card-header .n-card-header__main { font-size: 14px; font-weight: 550; }
.settings-page .n-form-item-label { color: #aab4c9; font-size: 12px; }
.settings-page .n-form-item-feedback-wrapper { min-height: 14px; }
.settings-page .n-form-item { margin-bottom: 5px; }
.settings-page .n-divider { margin: 26px 0 20px; font-size: 12px; }
.settings-page .n-data-table, .settings-page .n-table { font-size: 12px; }
.settings-disclosure { border-top: 1px solid var(--mail-border); margin-top: 22px; padding-top: 4px; }
.settings-disclosure > summary { cursor: pointer; font-size: 13px; color: #b6c2db; padding: 17px 0; list-style: none; display: flex; justify-content: space-between; }
.settings-disclosure > summary::after { content: '+'; color: #a2b2ff; }
.settings-disclosure[open] > summary::after { content: '−'; }
.page-actions { display: flex; align-items: center; justify-content: flex-end; gap: 10px; margin-bottom: 20px; }
.settings-grid { display: grid; gap: 18px; grid-template-columns: repeat(2, minmax(0, 1fr)); }
.settings-section { border: 1px solid var(--mail-border); border-radius: 12px; background: var(--mail-panel); padding: 22px; min-width: 0; }
.settings-section h2 { font-size: 14px; font-weight: 550; margin: 0 0 20px; }
.settings-note { color: var(--mail-muted); font-size: 12px; line-height: 1.8; margin-bottom: 22px; }
.settings-note summary { cursor: pointer; color: #aab4c9; }
.settings-page .table-scroll { width: 100%; overflow-x: auto; }
@media (max-width: 767px) {
  .app-shell { padding: 0 14px; }
  .settings-surface, .settings-section { padding: 17px 15px; }
  .settings-grid { grid-template-columns: 1fr; }
  .settings-page .n-form--inline { display: flex; flex-direction: column; align-items: stretch; }
  .settings-page .n-form--inline .n-form-item { margin-right: 0; }
  :where(input, textarea, select, [contenteditable="true"]) { font-size: 16px !important; }
  :where(.n-input, .n-input-number, .n-base-selection) { --n-font-size: 16px !important; }
}
</style>
