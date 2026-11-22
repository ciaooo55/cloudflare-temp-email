<script setup>
import { onMounted, ref } from 'vue'
import { useScopedI18n } from '@/i18n/app'
import { api } from '../../api'

const { t } = useScopedI18n('views.admin.AccountSettings')
const message = useMessage()
const settings = ref(null)
const busy = ref(false)
const fetchData = async () => {
  const response = await api.fetch('/admin/account_settings')
  settings.value = {
    ...response,
    blockList: response.blockList || [],
    sendBlockList: response.sendBlockList || [],
    verifiedAddressList: response.verifiedAddressList || [],
    noLimitSendAddressList: response.noLimitSendAddressList || [],
    fromBlockList: response.fromBlockList || [],
    blockedMailboxList: response.blockedMailboxList || [],
    mailboxDomainBlockList: response.mailboxDomainBlockList || [],
    sendMailLimitConfig: { dailyEnabled: false, monthlyEnabled: false, dailyLimit: 100, monthlyLimit: 3000, ...response.sendMailLimitConfig }
  }
}
const save = async () => {
  if (!settings.value || busy.value) return
  busy.value = true
  try {
    await api.fetch('/admin/account_settings', { method: 'POST', body: JSON.stringify(settings.value) })
    message.success(t('successTip'))
    await fetchData()
  } catch (error) { message.error(error.message || 'error') }
  finally { busy.value = false }
}
onMounted(async () => { try { await fetchData() } catch (error) { message.error(error.message || 'error') } })
</script>
<template>
  <div v-if="settings" class="rules-panel">
    <p class="rule-guide">{{ t('guide') }}</p>
    <section class="rule-section">
      <h2>{{ t('fromBlockList') }}</h2>
      <p>{{ t('fromHelp') }}</p>
      <n-select v-model:value="settings.fromBlockList" filterable multiple tag :placeholder="t('manualInputPrompt')" :aria-label="t('fromBlockList')" />
      <p class="rule-example">{{ t('fromExample') }}</p>
    </section>
    <section class="rule-section">
      <h2>{{ t('mailboxDomainBlockList') }}</h2><p>{{ t('domainHelp') }}</p>
      <n-dynamic-input v-model:value="settings.mailboxDomainBlockList" :on-create="() => ({ address: '', domain: '' })">
        <template #default="{ value }">
          <div class="domain-rule">
            <n-input v-model:value="value.address" :placeholder="t('mailboxAddress')" :aria-label="t('mailboxAddress')" />
            <n-input v-model:value="value.domain" :placeholder="t('blockedSenderDomain')" :aria-label="t('blockedSenderDomain')" />
          </div>
        </template>
      </n-dynamic-input>
      <p class="rule-example">{{ t('domainExample') }}</p>
    </section>
    <section class="rule-section">
      <h2>{{ t('blockedMailboxList') }}</h2>
      <p>{{ t('mailboxHelp') }}</p>
      <n-select v-model:value="settings.blockedMailboxList" filterable multiple tag :placeholder="t('manualInputPrompt')" :aria-label="t('blockedMailboxList')" />
      <p class="rule-example">{{ t('mailboxExample') }}</p>
    </section>
    <n-collapse class="send-limits">
      <n-collapse-item name="send-limits" :title="t('send_mail_limit')">
        <p class="rule-guide">{{ t('sendingGuide') }}</p>
        <n-form-item-row :label="t('send_address_block_list')" :feedback="t('sendBlockHelp')">
          <n-select v-model:value="settings.sendBlockList" filterable multiple tag :placeholder="t('manualInputPrompt')" />
        </n-form-item-row>
        <n-form-item-row :label="t('noLimitSendAddressList')" :feedback="t('unlimitedHelp')">
          <n-select v-model:value="settings.noLimitSendAddressList" filterable multiple tag :placeholder="t('manualInputPrompt')" />
        </n-form-item-row>
        <n-form-item-row :label="t('send_mail_daily_limit')" :feedback="t('dailyLimitHelp')">
          <n-switch v-model:value="settings.sendMailLimitConfig.dailyEnabled" />
          <n-input-number v-model:value="settings.sendMailLimitConfig.dailyLimit" :min="-1" :precision="0" :disabled="!settings.sendMailLimitConfig.dailyEnabled" />
        </n-form-item-row>
        <n-form-item-row :label="t('send_mail_monthly_limit')" :feedback="t('monthlyLimitHelp')">
          <n-switch v-model:value="settings.sendMailLimitConfig.monthlyEnabled" />
          <n-input-number v-model:value="settings.sendMailLimitConfig.monthlyLimit" :min="-1" :precision="0" :disabled="!settings.sendMailLimitConfig.monthlyEnabled" />
        </n-form-item-row>
      </n-collapse-item>
    </n-collapse>
    <div class="rules-actions"><n-button type="primary" :loading="busy" @click="save">{{ t('save') }}</n-button></div>
  </div>
</template>
<style scoped>
.rules-panel { max-width: 820px; }
.rule-section { padding: 22px; border: 1px solid var(--mail-border); border-radius: 12px; background: var(--mail-panel); margin-bottom: 16px; }
.rule-section h2 { margin: 0 0 14px; font-size: 14px; font-weight: 550; }
.rule-section p { font-size: 12px; color: var(--mail-muted); margin: -6px 0 15px; line-height: 1.8; }
.rule-guide { color: var(--mail-muted); font-size: 13px; line-height: 1.8; margin: 0 0 18px; }
.rule-section .rule-example { margin: 12px 0 0; color: #94a3b8; }
.domain-rule { display: flex; gap: 10px; min-width: 0; width: 100%; }
.rules-actions { display: flex; justify-content: flex-end; padding: 20px 0; }
.send-limits { padding: 16px 22px; border: 1px solid var(--mail-border); border-radius: 12px; }
@media (max-width: 767px) { .rule-section { padding: 18px 14px; } .domain-rule { flex-direction: column; } }
</style>
