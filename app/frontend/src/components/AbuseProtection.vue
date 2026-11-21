<script setup>
import { onMounted, ref } from 'vue'
import { useMessage } from 'naive-ui'
import { useScopedI18n } from '@/i18n/app'
import { api } from '../api'

const { t } = useScopedI18n('components.AbuseProtection')
const message = useMessage()
const settings = ref(null)
const busy = ref(false)
const fields = [
  ['inboundWindowMinutes', 1440], ['inboundPairLimit', 10000],
  ['inboundSenderLimit', 100000], ['inboundBanMinutes', 10080],
]
const snapshotFields = [['snapshotWindowSeconds', 3600], ['snapshotLimit', 10000], ['snapshotBanMinutes', 10080]]
onMounted(async () => {
  try { settings.value = await api.fetch('/admin/abuse_protection') }
  catch (error) { message.error(error.message || 'error') }
})
const save = async () => {
  if (!settings.value || busy.value) return
  busy.value = true
  try {
    await api.fetch('/admin/abuse_protection', { method: 'POST', body: JSON.stringify(settings.value) })
    message.success(t('saved'))
  } catch (error) { message.error(error.message || 'error') }
  finally { busy.value = false }
}
</script>

<template>
  <section class="settings-section protection-settings">
    <h2>{{ t('title') }}</h2>
    <p>{{ t('scope') }}</p>
    <template v-if="settings">
      <n-form-item-row :label="t('inboundEnabled')" :feedback="t('inboundEnabledHelp')">
        <n-switch v-model:value="settings.inboundEnabled" :aria-label="t('inboundEnabled')" />
      </n-form-item-row>
      <n-form-item-row v-for="[key, max] in fields" :key="key" :label="t(key)" :feedback="t(key + 'Help')">
        <n-input-number v-model:value="settings[key]" :min="1" :max="max" :precision="0"
          :disabled="!settings.inboundEnabled" :aria-label="t(key)" />
      </n-form-item-row>
      <n-form-item-row :label="t('snapshotEnabled')" :feedback="t('snapshotEnabledHelp')">
        <n-switch v-model:value="settings.snapshotEnabled" :aria-label="t('snapshotEnabled')" />
      </n-form-item-row>
      <n-form-item-row v-for="[key, max] in snapshotFields" :key="key" :label="t(key)" :feedback="t(key + 'Help')">
        <n-input-number v-model:value="settings[key]" :min="1" :max="max" :precision="0"
          :disabled="!settings.snapshotEnabled" :aria-label="t(key)" />
      </n-form-item-row>
      <p>{{ t('costHelp') }}</p>
      <n-button type="primary" :loading="busy" @click="save">{{ t('save') }}</n-button>
    </template>
    <n-text v-else depth="3">{{ t('unavailable') }}</n-text>
  </section>
</template>

<style scoped>
.protection-settings { grid-column: 1 / -1; }
h2 { margin: 0 0 12px; }
p { color: var(--mail-muted); font-size: 12px; line-height: 1.7; }
</style>
