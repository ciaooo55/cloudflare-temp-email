<script setup>
import { computed, defineAsyncComponent, onMounted, ref } from 'vue';
import { useScopedI18n } from '@/i18n/app'
import { useRouter } from 'vue-router'

import { useGlobalState } from '../store'
import { api } from '../api'
import { getRouterPathWithLang, hashPassword } from '../utils'
import Turnstile from '../components/Turnstile.vue'
import { useIsMobile } from '../utils/composables'
import { adminGroups, normalizeAdminSection } from '../utils/admin-navigation'

// Only the active tool is mounted and its chunk downloaded.
const SenderAccess = defineAsyncComponent(() => import('./admin/SenderAccess.vue'));
const Statistics = defineAsyncComponent(() => import("./admin/Statistics.vue"));
const SendBox = defineAsyncComponent(() => import('./admin/SendBox.vue'));
const Account = defineAsyncComponent(() => import('./admin/Account.vue'));
const CreateAccount = defineAsyncComponent(() => import('./admin/CreateAccount.vue'));
const AccountSettings = defineAsyncComponent(() => import('./admin/AccountSettings.vue'));
const Mails = defineAsyncComponent(() => import('./admin/Mails.vue'));
const MailsUnknown = defineAsyncComponent(() => import('./admin/MailsUnknown.vue'));
const About = defineAsyncComponent(() => import('./common/About.vue'));
const Maintenance = defineAsyncComponent(() => import('./admin/Maintenance.vue'));
const DatabaseManager = defineAsyncComponent(() => import('./admin/DatabaseManager.vue'));
const Appearance = defineAsyncComponent(() => import('./common/Appearance.vue'));
const Telegram = defineAsyncComponent(() => import('./admin/Telegram.vue'));
const Bark = defineAsyncComponent(() => import('./admin/Bark.vue'));
const Snapshot = defineAsyncComponent(() => import('./admin/Snapshot.vue'));
const Webhook = defineAsyncComponent(() => import('./admin/Webhook.vue'));
const MailWebhook = defineAsyncComponent(() => import('./admin/MailWebhook.vue'));
const WorkerConfig = defineAsyncComponent(() => import('./admin/WorkerConfig.vue'));
const IpBlacklistSettings = defineAsyncComponent(() => import('./admin/IpBlacklistSettings.vue'));
const AiExtractSettings = defineAsyncComponent(() => import('./admin/AiExtractSettings.vue'));

const {
  adminAuth, showAdminAuth, adminTab, loading,
  showAdminPage,
  openSettings
} = useGlobalState()
const message = useMessage()
const router = useRouter()

const SendMail = defineAsyncComponent(() => {
  loading.value = true;
  return import('./admin/SendMail.vue')
    .finally(() => loading.value = false);
});

const cfToken = ref('')
const turnstileRef = ref(null)

const authFunc = async () => {
  try {
    await api.fetch('/open_api/admin_login', {
      method: 'POST',
      body: JSON.stringify({
        password: await hashPassword(tmpAdminAuth.value),
        cf_token: cfToken.value
      })
    });
    adminAuth.value = tmpAdminAuth.value;
    location.reload()
  } catch (error) {
    message.error(error.message || "error");
    turnstileRef.value?.refresh?.();
  }
}

const showLogoutModal = ref(false)

const handleLogout = async () => {
  // 清空管理员认证
  adminAuth.value = '';
  // 重置管理员相关状态
  showAdminAuth.value = false;
  adminTab.value = 'account';
  // 显示成功提示并跳转
  message.success(t('logoutSuccess'));
  await router.push(getRouterPathWithLang('/', locale.value));
}

const { t, locale } = useScopedI18n('views.Admin')

const showAdminPasswordModal = computed(() => !showAdminPage.value || showAdminAuth.value)
const tmpAdminAuth = ref('')
// 判断是否通过 admin password 登录（而非用户管理员权限）
const isAdminPasswordLogin = computed(() => !!adminAuth.value)

// 获取当前登录方式
const currentLoginMethod = computed(() => {
  if (adminAuth.value) {
    return t('loginViaPassword');
  } else if (openSettings.value.disableAdminPasswordCheck) {
    return t('loginViaDisabledCheck');
  }
  return '';
})

onMounted(async () => {
  // make sure openSettings is fetched for turnstile check
  if (!openSettings.value.fetched) await api.getOpenSettings(message);
})

const isMobile = useIsMobile()
const sections = {
  account: Account, account_create: CreateAccount, account_settings: AccountSettings,
  senderAccess: SenderAccess, ipBlacklistSettings: IpBlacklistSettings,
  aiExtractSettings: AiExtractSettings, webhook: Webhook,
  mails: Mails, unknow: MailsUnknown, sendBox: SendBox, sendMail: SendMail,
  mailWebhook: MailWebhook, telegram: Telegram, bark: Bark, snapshot: Snapshot,
  statistics: Statistics, database: DatabaseManager, workerconfig: WorkerConfig,
  maintenance_tasks: Maintenance, appearance: Appearance, about: About
}
adminTab.value = normalizeAdminSection(adminTab.value)
const navigation = computed(() => adminGroups.map(group => ({
  key: group.key, label: t(group.label),
  children: group.items.map(([key, label]) => ({ key, label: t(label) }))
})))
const mobileOptions = computed(() => navigation.value.map(group => ({
  type: 'group', label: group.label,
  children: group.children.map(item => ({ label: item.label, value: item.key }))
})))
const activeLabel = computed(() => navigation.value.flatMap(group => group.children)
  .find(item => item.key === adminTab.value)?.label || '')
const activeGroup = computed(() => adminGroups.find(group => group.items.some(([key]) => key === adminTab.value)))
const activeComponent = computed(() => sections[adminTab.value])
</script>

<template>
  <div v-if="openSettings.fetched" class="admin-workspace">
    <n-modal v-model:show="showAdminPasswordModal" :closable="false" :closeOnEsc="false" :maskClosable="false"
      preset="dialog" :title="t('accessHeader')">
      <p>{{ t('accessTip') }}</p>
      <n-input v-model:value="tmpAdminAuth" type="password" show-password-on="click" @keyup.enter="authFunc" />
      <Turnstile ref="turnstileRef" v-if="openSettings.enableGlobalTurnstileCheck" v-model:value="cfToken" />
      <template #action>
        <n-button @click="authFunc" type="primary" :loading="loading">
          {{ t('ok') }}
        </n-button>
      </template>
    </n-modal>

    <div v-if="showAdminPage" class="workspace-grid">
      <aside v-if="!isMobile" class="workspace-sidebar">
        <div class="workspace-brand">{{ t('workspace') }}</div>
        <n-menu v-model:value="adminTab" :options="navigation"
          :default-expanded-keys="['mail', 'mailboxes']" :indent="16" />
      </aside>
      <main class="workspace-content">
        <n-select v-if="isMobile" v-model:value="adminTab" :options="mobileOptions"
          :aria-label="t('workspace')" filterable class="workspace-mobile-nav" />
        <div class="workspace-heading">
          <div>
            <n-text depth="3" class="workspace-eyebrow">{{ activeGroup && t(activeGroup.label) }}</n-text>
            <h1>{{ activeLabel }}</h1>
            <p class="workspace-description">{{ activeGroup && t(activeGroup.description) }}</p>
          </div>
          <n-tag round :bordered="false" type="success">{{ t('privacyFirst') }}</n-tag>
        </div>
        <section class="workspace-panel" :aria-label="activeLabel">
          <component :is="activeComponent" v-if="activeComponent" :key="adminTab" />
          <template v-else-if="adminTab === 'adminAccount'">
        <div style="display: flex; justify-content: center; padding: 20px;">
          <n-card style="width: 100%; max-width: 600px;">
            <n-space vertical>
              <n-alert type="info" :bordered="false">
                {{ t('adminAccountTip') }}
              </n-alert>
              <n-text strong>{{ t('loginMethod') }}</n-text>
              <n-text>{{ currentLoginMethod }}</n-text>
              <n-divider v-if="isAdminPasswordLogin" />
              <n-button v-if="isAdminPasswordLogin" type="warning" @click="showLogoutModal = true" block>
                {{ t('logout') }}
              </n-button>
            </n-space>
          </n-card>
        </div>

          </template>
        </section>
      </main>
    </div>
    <n-modal v-model:show="showLogoutModal" preset="dialog" :title="t('logoutConfirmTitle')">
      <p>{{ t('logoutConfirmContent') }}</p>
      <template #action>
        <n-button :loading="loading" @click="handleLogout" size="small" tertiary type="warning">
          {{ t('confirm') }}
        </n-button>
      </template>
    </n-modal>

  </div>
</template>

<style scoped>
.workspace-grid { display: grid; grid-template-columns: 216px minmax(0, 1fr); gap: 28px; align-items: start; }
.workspace-sidebar { position: sticky; top: 20px; text-align: left; padding: 12px 0; }
.workspace-brand { padding: 0 24px 14px; font-size: 12px; letter-spacing: .08em; opacity: .55; }
.workspace-content { min-width: 0; text-align: left; padding: 24px 0; }
.workspace-heading { display: flex; justify-content: space-between; align-items: center; gap: 12px; margin-bottom: 22px; }
.workspace-heading h1 { font-size: 26px; line-height: 1.3; margin: 5px 0 0; font-weight: 650; letter-spacing: -.03em; }
.workspace-eyebrow { font-size: 12px; }
.workspace-description { margin: 8px 0 0; opacity: .65; font-size: 13px; max-width: 48em; }
.workspace-panel { min-height: 65vh; }
.workspace-sidebar :deep(.n-menu-item-content) { border-radius: 8px; }
.workspace-mobile-nav { margin-bottom: 20px; }
@media (max-width: 767px) {
  .workspace-grid { grid-template-columns: minmax(0, 1fr); gap: 0; }
  .workspace-content { padding-top: 16px; }
  .workspace-heading { margin-bottom: 16px; }
  .workspace-heading h1 { font-size: 22px; }
}
</style>
