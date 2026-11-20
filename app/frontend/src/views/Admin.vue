<script setup>
import { computed, defineAsyncComponent, onMounted, ref } from 'vue'
import { useScopedI18n } from '@/i18n/app'
import { useGlobalState } from '../store'
import { api } from '../api'
import { hashPassword } from '../utils'
import Turnstile from '../components/Turnstile.vue'
import { useIsMobile } from '../utils/composables'
import { adminGroups } from '../utils/admin-navigation'

const sections = {
  mails: defineAsyncComponent(() => import('./admin/Mails.vue')),
  sendMail: defineAsyncComponent(() => import('./admin/SendMail.vue')),
  sendBox: defineAsyncComponent(() => import('./admin/SendBox.vue')),
  account: defineAsyncComponent(() => import('./admin/Account.vue')),
  account_settings: defineAsyncComponent(() => import('./admin/AccountSettings.vue')),
  senderAccess: defineAsyncComponent(() => import('./admin/SenderAccess.vue')),
  ipBlacklistSettings: defineAsyncComponent(() => import('./admin/IpBlacklistSettings.vue')),
  telegram: defineAsyncComponent(() => import('./admin/Telegram.vue')),
  bark: defineAsyncComponent(() => import('./admin/Bark.vue')),
  snapshot: defineAsyncComponent(() => import('./admin/Snapshot.vue')),
  statistics: defineAsyncComponent(() => import('./admin/Statistics.vue')),
  maintenance_tasks: defineAsyncComponent(() => import('./admin/Maintenance.vue')),
}
const icons = {
  mails: 'M4 4h16v16H4z M4 13h5l2 3h2l2-3h5',
  sendMail: 'M12 5v14 M5 12h14',
  sendBox: 'm3 3 18 9-18 9 4-9-4-9 M7 12h14',
  account: 'M16 8a4 4 0 1 0 0 8 M16 8v6a2 2 0 0 0 4 0v-2a8 8 0 1 0-3 6',
  snapshot: 'm10 14 4-4 M8 16l-1 1a3 3 0 0 1-4-4l4-4a3 3 0 0 1 4 0 M13 15a3 3 0 0 0 4 0l4-4a3 3 0 0 0-4-4l-1 1',
  account_settings: 'M5 6h14 M5 12h14 M5 18h14 M9 3v6 M15 9v6 M10 15v6',
  senderAccess: 'm3 3 18 9-18 9 4-9-4-9 M7 12h14',
  ipBlacklistSettings: 'M12 3 4 6v6c0 5 8 9 8 9s8-4 8-9V6l-8-3 M9 12l2 2 4-4',
  telegram: 'm3 10 18-7-5 18-5-7-8-4 M11 14 21 3',
  bark: 'M6 8a6 6 0 0 1 12 0v7l2 3H4l2-3V8 M10 21h4',
  statistics: 'M4 4v16h16 M8 16v-5 M12 16V7 M16 16V9',
  maintenance_tasks: 'M5 7h14 M9 7V4h6v3 M7 7l1 14h8l1-14 M10 10v7 M14 10v7',
}
const { adminAuth, showAdminAuth, adminTab, loading, showAdminPage, openSettings } = useGlobalState()
const { t, locale } = useScopedI18n('views.Admin')
const message = useMessage()
const isMobile = useIsMobile()
const showNavigation = ref(false)
const cfToken = ref('')
const turnstileRef = ref(null)
const tmpAdminAuth = ref('')
const showAdminPasswordModal = computed(() => !showAdminPage.value || showAdminAuth.value)
const activeLabel = computed(() => {
  const item = adminGroups.flatMap(group => group.items).find(([key]) => key === adminTab.value)
  return item ? t(item[1]) : t('mails')
})
const activeComponent = computed(() => sections[adminTab.value] || sections.mails)
const navigate = key => { adminTab.value = key; showNavigation.value = false }
adminTab.value = 'mails'
const authFunc = async () => {
  try {
    await api.fetch('/open_api/admin_login', {
      method: 'POST',
      body: JSON.stringify({ password: await hashPassword(tmpAdminAuth.value), cf_token: cfToken.value })
    })
    adminAuth.value = tmpAdminAuth.value
    location.reload()
  } catch (error) {
    message.error(error.message || 'error')
    turnstileRef.value?.refresh?.()
  }
}
onMounted(() => { if (!openSettings.value.fetched) return api.getOpenSettings(message) })
</script>

<template>
  <div v-if="openSettings.fetched" class="mail-workspace">
    <n-modal v-model:show="showAdminPasswordModal" :closable="false" :close-on-esc="false" :mask-closable="false"
      preset="dialog" :title="locale === 'zh' ? '解锁邮箱' : 'Unlock mailbox'">
      <n-input v-model:value="tmpAdminAuth" type="password" :aria-label="t('accessHeader')"
        show-password-on="click" @keyup.enter="authFunc" />
      <Turnstile v-if="openSettings.enableGlobalTurnstileCheck" ref="turnstileRef" v-model:value="cfToken" />
      <template #action>
        <n-button @click="authFunc" type="primary" :loading="loading">{{ t('ok') }}</n-button>
      </template>
    </n-modal>
    <template v-if="showAdminPage">
      <aside v-if="!isMobile" class="workspace-sidebar">
        <button class="compose-button" type="button" @click="navigate('sendMail')">
          <span aria-hidden="true">＋</span>{{ t('sendMail') }}
        </button>
        <nav :aria-label="t('workspace')">
          <div v-for="group in adminGroups" :key="group.key" class="nav-group">
            <div v-if="group.key !== 'mail'" class="nav-group-label">{{ t(group.label) }}</div>
            <template v-for="[key, label] in group.items" :key="key">
              <button v-if="key !== 'sendMail'" type="button" class="nav-item"
                :class="{ active: adminTab === key }" :aria-current="adminTab === key ? 'page' : undefined"
                @click="navigate(key)">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path :d="icons[key]" /></svg>
                {{ t(label) }}
              </button>
            </template>
          </div>
        </nav>
      </aside>
      <main class="workspace-content">
        <nav v-if="isMobile" class="mobile-navigation" :aria-label="t('workspace')">
          <button v-for="key in ['mails', 'account', 'snapshot']" :key="key" type="button"
            :class="{ active: adminTab === key }" @click="navigate(key)">
            {{ t(adminGroups.flatMap(g => g.items).find(item => item[0] === key)[1]) }}
          </button>
          <button type="button" :aria-label="t('workspace')" @click="showNavigation = true">•••</button>
        </nav>
        <header class="workspace-heading">
          <div>
            <p class="workspace-eyebrow">MAIL / {{ t('workspace') }}</p>
            <h1>{{ activeLabel }}</h1>
          </div>
          <button v-if="isMobile && adminTab !== 'sendMail'" type="button" class="mobile-compose" @click="navigate('sendMail')">
            ＋ {{ t('sendMail') }}
          </button>
        </header>
        <section class="workspace-panel" :aria-label="activeLabel">
          <component :is="activeComponent" :key="adminTab" />
        </section>
      </main>
      <n-drawer v-model:show="showNavigation" placement="right" :width="300">
        <n-drawer-content :title="t('workspace')" closable>
          <div v-for="group in adminGroups" :key="group.key" class="nav-group">
            <div class="nav-group-label">{{ t(group.label) }}</div>
            <button v-for="[key, label] in group.items" :key="key" type="button" class="nav-item"
              :class="{ active: adminTab === key }" @click="navigate(key)">
              {{ t(label) }}
            </button>
          </div>
        </n-drawer-content>
      </n-drawer>
    </template>
  </div>
</template>

<style scoped>
.mail-workspace { display: grid; grid-template-columns: 188px minmax(0, 1fr); gap: 32px; min-height: calc(100dvh - 125px); }
.workspace-sidebar { padding: 28px 0 14px; border-right: 1px solid var(--mail-border); padding-right: 20px; }
.compose-button, .mobile-compose { background: #a2b2ff; color: #101527; border: 0; border-radius: 10px; padding: 11px 16px; font: inherit; font-weight: 650; cursor: pointer; }
.compose-button { display: flex; gap: 13px; align-items: center; width: 100%; margin-bottom: 19px; }
.compose-button span { font-size: 23px; line-height: 1; font-weight: 400; }
.compose-button:hover, .mobile-compose:hover { background: #bdc8ff; }
.nav-group { margin-bottom: 17px; }
.nav-group-label { color: #7e899e; font-size: 10px; letter-spacing: .09em; padding: 10px 12px 7px; }
.nav-item { display: flex; align-items: center; gap: 12px; color: #a9b2c4; background: transparent; border: 0; border-radius: 8px; width: 100%; padding: 10px 12px; font: inherit; font-size: 13px; text-align: left; cursor: pointer; line-height: 1.5; }
.nav-item svg { width: 18px; height: 18px; flex: none; opacity: .8; }
.nav-item:hover { background: #191e29; color: #e8ebf3; }
.nav-item.active { background: #232c47; color: #bdc9ff; }
.workspace-content { min-width: 0; padding-top: 27px; }
.workspace-heading { display: flex; justify-content: space-between; align-items: center; gap: 12px; margin-bottom: 24px; }
.workspace-eyebrow { color: #7e899e; font-size: 10px; letter-spacing: .12em; margin: 0 0 8px; }
h1 { font-size: 25px; line-height: 1.3; font-weight: 620; letter-spacing: -.035em; margin: 0; }
.workspace-panel { min-height: 65vh; min-width: 0; }
.mobile-navigation { display: flex; gap: 4px; border-bottom: 1px solid var(--mail-border); padding: 10px 0; margin-bottom: 22px; }
.mobile-navigation button { border: 0; background: transparent; color: #929bad; padding: 8px 12px; border-radius: 7px; font: inherit; font-size: 12px; cursor: pointer; }
.mobile-navigation button.active { background: #232c47; color: #bdc9ff; }
.mobile-navigation button:last-child { margin-left: auto; letter-spacing: 2px; }
@media (max-width: 767px) {
  .mail-workspace { grid-template-columns: minmax(0, 1fr); gap: 0; }
  .workspace-content { padding-top: 0; }
  .workspace-heading { margin-bottom: 20px; }
  h1 { font-size: 23px; }
  .mobile-compose { padding: 8px 12px; font-size: 12px; }
}
</style>
