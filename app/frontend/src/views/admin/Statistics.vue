<script setup>
import { onMounted, ref } from 'vue'
import { useScopedI18n } from '@/i18n/app'
import { api } from '../../api'
const { t } = useScopedI18n('views.admin.Statistics')
const message = useMessage()
const statistics = ref(null)
onMounted(async () => {
  try { statistics.value = await api.fetch('/admin/statistics') }
  catch (error) { message.error(error.message || 'error') }
})
</script>
<template>
  <div class="statistics-grid">
    <div v-for="[key, label] in [['mailCount', 'mailCount'], ['sendMailCount', 'sendMailCount'], ['addressCount', 'addressCount']]"
      :key="key" class="statistic">
      <span>{{ t(label) }}</span>
      <strong>{{ statistics ? (statistics[key] ?? 0).toLocaleString() : '—' }}</strong>
    </div>
  </div>
</template>
<style scoped>
.statistics-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 16px; }
.statistic { background: var(--mail-panel); border: 1px solid var(--mail-border); border-radius: 12px; padding: 24px; display: flex; flex-direction: column; gap: 18px; }
.statistic span { color: var(--mail-muted); font-size: 12px; }
.statistic strong { font-size: 32px; letter-spacing: -.04em; font-weight: 550; color: #e2e8fa; }
@media (max-width: 767px) { .statistics-grid { grid-template-columns: 1fr; gap: 12px; } .statistic { padding: 20px; flex-direction: row; align-items: center; justify-content: space-between; } .statistic strong { font-size: 26px; } }
</style>
