<script setup>
import { onMounted, ref } from 'vue';
import { useScopedI18n } from '@/i18n/app'

import { useGlobalState } from '../../store'
import { api } from '../../api'
import AbuseProtection from '../../components/AbuseProtection.vue'

const { loading } = useGlobalState()
const message = useMessage()

const { t } = useScopedI18n('views.admin.IpBlacklistSettings')

const enabled = ref(false)
const ipBlacklist = ref([])
const asnBlacklist = ref([])
const fingerprintBlacklist = ref([])
const enableWhitelist = ref(false)
const ipWhitelist = ref([])
const enableDailyLimit = ref(false)
const dailyRequestLimit = ref(1000)

const fetchData = async () => {
    try {
        loading.value = true
        const res = await api.fetch(`/admin/ip_blacklist/settings`)
        enabled.value = res.enabled || false
        ipBlacklist.value = res.blacklist || []
        asnBlacklist.value = res.asnBlacklist || []
        fingerprintBlacklist.value = res.fingerprintBlacklist || []
        enableWhitelist.value = res.enableWhitelist || false
        ipWhitelist.value = res.whitelist || []
        enableDailyLimit.value = res.enableDailyLimit || false
        dailyRequestLimit.value = res.dailyRequestLimit || 1000
    } catch (error) {
        message.error(error.message || "error");
    } finally {
        loading.value = false
    }
}

const save = async () => {
    if (enableWhitelist.value && (!ipWhitelist.value || ipWhitelist.value.length === 0)) {
        message.warning(t('whitelist_empty_warning'))
        return
    }
    try {
        loading.value = true
        await api.fetch(`/admin/ip_blacklist/settings`, {
            method: 'POST',
            body: JSON.stringify({
                enabled: enabled.value,
                blacklist: ipBlacklist.value || [],
                asnBlacklist: asnBlacklist.value || [],
                fingerprintBlacklist: fingerprintBlacklist.value || [],
                enableWhitelist: enableWhitelist.value,
                whitelist: ipWhitelist.value || [],
                enableDailyLimit: enableDailyLimit.value,
                dailyRequestLimit: dailyRequestLimit.value
            })
        })
        message.success(t('successTip'))
    } catch (error) {
        message.error(error.message || "error");
    } finally {
        loading.value = false
    }
}

onMounted(async () => {
    await fetchData();
})
</script>


<template>
  <div class="settings-page">
    <AbuseProtection />
    <h2 class="access-heading">{{ t('accessTitle') }}</h2>
    <p class="access-guide">{{ t('accessGuide') }}</p>
    <details class="settings-note">
      <summary>{{ t('tip_scope') }}</summary>
      <p>{{ t('tip_whitelist') }}<br>{{ t('tip_ip') }}<br>{{ t('tip_asn') }}<br>{{ t('tip_fingerprint') }}<br>{{ t('tip_daily_limit') }}</p>
    </details>
    <div class="settings-grid">
      <section class="settings-section">
        <h2>{{ t('ip_whitelist') }}</h2><p>{{ t('whitelistHelp') }}</p>
        <n-form-item-row :label="t('enable_ip_whitelist')"><n-switch v-model:value="enableWhitelist" /><n-text depth="3">{{ t('enable_whitelist_tip') }}</n-text></n-form-item-row>
        <n-select v-model:value="ipWhitelist" filterable multiple tag :placeholder="t('ip_whitelist_placeholder')" :aria-label="t('ip_whitelist')" :disabled="!enableWhitelist" />
      </section>
      <section class="settings-section">
        <h2>{{ t('ip_blacklist') }}</h2>
        <n-form-item-row :label="t('enable_ip_blacklist')"><n-switch v-model:value="enabled" /><n-text depth="3">{{ t('enable_tip') }}</n-text></n-form-item-row>
        <n-form-item-row :label="t('ip_blacklist')" :feedback="t('ipHelp')"><n-select v-model:value="ipBlacklist" filterable multiple tag :placeholder="t('ip_blacklist_placeholder')" :disabled="!enabled" /></n-form-item-row>
        <n-form-item-row :label="t('asn_blacklist')" :feedback="t('asnHelp')"><n-select v-model:value="asnBlacklist" filterable multiple tag :placeholder="t('asn_blacklist_placeholder')" :disabled="!enabled" /></n-form-item-row>
        <n-form-item-row :label="t('fingerprint_blacklist')" :feedback="t('fingerprintHelp')"><n-select v-model:value="fingerprintBlacklist" filterable multiple tag :placeholder="t('fingerprint_blacklist_placeholder')" :disabled="!enabled" /></n-form-item-row>
      </section>
      <section class="settings-section">
        <h2>{{ t('daily_request_limit') }}</h2><p>{{ t('dailyHelp') }}</p>
        <n-form-item-row :label="t('enable_daily_limit')"><n-switch v-model:value="enableDailyLimit" /><n-text depth="3">{{ t('enable_daily_limit_tip') }}</n-text></n-form-item-row>
        <n-input-number v-model:value="dailyRequestLimit" :min="1" :precision="0" :disabled="!enableDailyLimit" :aria-label="t('daily_request_limit')" />
      </section>
    </div>
    <div class="page-actions access-actions"><n-button @click="save" type="primary" :loading="loading">{{ t('saveAccess') }}</n-button></div>
  </div>
</template>

<style scoped>
.access-heading { font-size: 16px; font-weight: 550; margin: 28px 0 12px; }
.access-actions { margin-top: 18px; }
.access-guide { color: var(--mail-muted); font-size: 13px; line-height: 1.8; }
</style>
