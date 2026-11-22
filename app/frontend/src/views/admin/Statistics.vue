<script setup>
import { computed, onMounted, ref } from 'vue'
import { useScopedI18n } from '@/i18n/app'
import { api } from '../../api'
const { t } = useScopedI18n('views.admin.Statistics')
const statistics = ref(null), budget = ref(null), page = ref(1), sort = ref('received')
const loading = ref(false), budgetLoading = ref(false), failed = ref(false), budgetFailed = ref(false)
const analyticsPath = '/admin/cloudflare_usage'
const analytics = ref(null), analyticsLoading = ref(false), analyticsEditing = ref(false), analyticsError = ref('')
const accountId = ref(''), analyticsToken = ref('')
const number = value => typeof value === 'number' && Number.isFinite(value) ? value.toLocaleString() : '—'
const total = key => (statistics.value?.days || []).reduce((sum, day) => sum + (day[key] ?? 0), 0)
const peak = computed(() => Math.max(1, ...(statistics.value?.days || []).flatMap(day => [day.received, day.sent])))
const hasBudget = computed(() => budget.value?.days?.length === 2 && budget.value.days.every(row =>
  Number.isFinite(row.usage?.row_reads) && Number.isFinite(row.usage?.row_writes)))
const budgetRows = computed(() => ['reads', 'writes'].map(key => {
  const field = key === 'reads' ? 'row_reads' : 'row_writes'
  const today = budget.value?.days?.[0]?.usage?.[field], yesterday = budget.value?.days?.[1]?.usage?.[field]
  const hard = budget.value?.hard?.[key], soft = budget.value?.soft?.[key]
  return { key, today, yesterday, total: today + yesterday, hard, softRemaining: Math.max(0, soft - today), remaining: Math.max(0, hard - today) }
}))
const loadStatistics = async () => {
  loading.value = true; failed.value = false
  try { statistics.value = await api.fetch(`/admin/statistics?offset=${(page.value - 1) * 20}&sort=${sort.value}`) }
  catch { failed.value = true; statistics.value = null }
  finally { loading.value = false }
}
const loadBudget = async () => {
  budgetLoading.value = true; budgetFailed.value = false
  try { budget.value = (await api.fetch('/admin/storage_status')).budget }
  catch { budgetFailed.value = true; budget.value = null }
  finally { budgetLoading.value = false }
}
const loadAnalytics = async () => {
  if (analyticsLoading.value) return
  analyticsLoading.value = true
  try { analytics.value = await api.fetch(analyticsPath, { showLoading: false }) }
  catch { analytics.value = { state: 'unavailable', accountId: analytics.value?.accountId } }
  finally { analyticsLoading.value = false }
}
const editAnalytics = () => {
  accountId.value = analytics.value?.accountId || ''
  analyticsToken.value = ''
  analyticsError.value = ''
  analyticsEditing.value = true
}
const cancelAnalytics = () => {
  analyticsToken.value = ''
  analyticsEditing.value = false
  analyticsError.value = ''
}
const updateAnalytics = async method => {
  if (analyticsLoading.value) return
  analyticsLoading.value = true
  analyticsError.value = ''
  try {
    const body = method === 'PUT' ? JSON.stringify({ accountId: accountId.value, token: analyticsToken.value }) : undefined
    analytics.value = await api.fetch(analyticsPath, { method, showLoading: false, body })
    cancelAnalytics()
  } catch { analyticsError.value = method === 'PUT' ? 'accountSaveFailed' : 'accountDisconnectFailed' }
  finally { analyticsToken.value = ''; analyticsLoading.value = false }
}
const refresh = () => Promise.all([loadStatistics(), loadBudget(), loadAnalytics()])
const changeSort = () => { page.value = 1; void loadStatistics() }
onMounted(refresh)
</script>
<template>
  <div class="statistics-page">
    <header class="statistics-heading"><p>{{ t('scope') }}</p><n-button secondary :loading="loading || budgetLoading" @click="refresh">{{ t('refresh') }}</n-button></header>
    <p v-if="failed" role="alert" class="notice">{{ t('loadFailed') }}</p>
    <div class="statistics-grid"><div v-for="key in ['mailCount', 'sendMailCount', 'addressCount']" :key="key" class="statistic"><span>{{ t(key) }}</span><strong>{{ number(statistics?.[key]) }}</strong></div></div>
    <section class="statistics-surface">
      <h2>{{ t('weekTitle') }}</h2><p v-if="statistics?.period">{{ statistics.period.start }} — {{ statistics.period.end }} · UTC</p>
      <p v-if="statistics?.period?.startedAt" class="history-start">{{ t('historyStart', { start: statistics.period.startedAt.replace('T', ' ').replace('Z', '') }) }}</p>
      <div class="chart-legend"><span class="received">{{ t('received') }} {{ number(statistics ? total('received') : undefined) }}</span><span class="sent">{{ t('sent') }} {{ number(statistics ? total('sent') : undefined) }}</span></div>
      <div class="week-chart" :aria-label="t('weekTitle')"><div v-for="day in statistics?.days || []" :key="day.day" class="chart-day" :title="day.day"><div class="bar-pair"><div class="bar received-bar" :style="{ height: `${day.received / peak * 100}%` }"></div><div class="bar sent-bar" :style="{ height: `${day.sent / peak * 100}%` }"></div></div><span class="chart-values"><span class="received">{{ number(day.received) }}</span> / <span class="sent">{{ number(day.sent) }}</span></span><span>{{ day.day.slice(5) }}</span></div></div>
      <div class="mailbox-highlights"><div v-for="key in ['most', 'least']" :key="key"><span>{{ t(key) }}</span><strong>{{ statistics?.mailboxes?.[key]?.address || '—' }}</strong><span>{{ number(statistics?.mailboxes?.[key]?.count) }} {{ t('messages') }}</span></div></div>
      <p>{{ t('rankingScope') }}</p>
    </section>
    <section class="statistics-surface">
      <div class="statistics-heading"><h2>{{ t('mailboxTitle') }}</h2><select v-model="sort" :disabled="loading" :aria-label="t('sort')" @change="changeSort"><option value="received">{{ t('sortReceived') }}</option><option value="sent">{{ t('sortSent') }}</option></select></div>
      <div class="table-scroll"><table><thead><tr><th>{{ t('mailbox') }}</th><th>{{ t('received') }}</th><th>{{ t('sent') }}</th></tr></thead><tbody><tr v-for="row in statistics?.mailboxes?.results || []" :key="row.address"><td>{{ row.address }}</td><td>{{ number(row.received) }}</td><td>{{ number(row.sent) }}</td></tr></tbody></table></div>
      <p v-if="statistics && !statistics.mailboxes?.results.length">{{ t('noMailboxes') }}</p>
      <n-pagination v-if="statistics?.addressCount > 20" v-model:page="page" :page-size="20" :item-count="statistics.addressCount" :disabled="loading" simple @update:page="loadStatistics" />
    </section>
    <section class="statistics-surface">
      <h2>{{ t('budgetTitle') }}</h2><p>{{ t('budgetHelp') }}</p>
      <p v-if="budgetFailed || (!budgetLoading && !hasBudget)" role="status" class="notice">{{ t('budgetUnavailable') }}</p>
      <template v-if="hasBudget">
        <p>{{ t('today') }} {{ budget.days[0].day }} · {{ t('yesterday') }} {{ budget.days[1].day }} · UTC</p>
        <div class="table-scroll"><table class="budget-table"><thead><tr><th>{{ t('metric') }}</th><th>{{ t('yesterday') }}</th><th>{{ t('today') }}</th><th>{{ t('twoDays') }}</th><th>{{ t('softRemaining') }}</th><th>{{ t('hardRemaining') }}</th><th>{{ t('hardLimit') }}</th></tr></thead><tbody><tr v-for="row in budgetRows" :key="row.key"><th>{{ t(row.key) }}</th><td>{{ number(row.yesterday) }}</td><td>{{ number(row.today) }}</td><td>{{ number(row.total) }}</td><td>{{ number(row.softRemaining) }}</td><td>{{ number(row.remaining) }}</td><td>{{ number(row.hard) }}</td></tr></tbody></table></div>
        <p>{{ t('freeReference', { reads: number(budget.free?.reads), writes: number(budget.free?.writes) }) }}</p><p>{{ t('resetHelp') }}</p>
      </template>
    </section>
    <section class="statistics-surface" aria-labelledby="account-usage-heading">
      <h2 id="account-usage-heading">{{ t('accountTitle') }}</h2>
      <p>{{ t('accountHelp') }}</p>
      <template v-if="analytics?.state === 'connected'">
        <p>{{ analytics.usage.day }} · UTC</p>
        <dl v-if="analytics.usage.totals" class="account-usage">
          <div><dt>{{ t('reads') }}</dt><dd>{{ number(analytics.usage.totals.rowsRead) }}</dd></div>
          <div><dt>{{ t('writes') }}</dt><dd>{{ number(analytics.usage.totals.rowsWritten) }}</dd></div>
        </dl>
        <p v-else role="status">{{ t('accountNoData') }}</p>
        <p>{{ t('accountFetched', { timestamp: analytics.usage.fetchedAt.replace('T', ' ').slice(0, 19) }) }}</p>
      </template>
      <p v-else-if="analytics?.state === 'unconfigured'">{{ t('accountNotConnected') }}</p>
      <p v-else-if="analytics?.state === 'locked'">{{ t('accountLocked') }}</p>
      <p v-else-if="analytics?.state === 'unavailable'" role="status" class="notice">{{ t('accountUnavailable') }}</p>
      <p v-else-if="analyticsLoading" role="status">{{ t('accountLoading') }}</p>
      <p><a href="https://dash.cloudflare.com/?to=/:account/billing" target="_blank" rel="noopener noreferrer">{{ t('accountLink') }}</a></p>
      <form v-if="analyticsEditing" class="analytics-form" @submit.prevent="updateAnalytics('PUT')">
        <p>{{ t('accountSetupHelp') }}</p>
        <label>{{ t('accountId') }}<input v-model.trim="accountId" required maxlength="32" pattern="[0-9a-fA-F]{32}" autocomplete="off" /></label>
        <label>{{ t('accountToken') }}<input v-model.trim="analyticsToken" type="password" required minlength="40" maxlength="80" autocomplete="new-password" spellcheck="false" /></label>
        <div class="analytics-actions">
          <n-button type="primary" attr-type="submit" :loading="analyticsLoading">{{ t('accountSave') }}</n-button>
          <n-button :disabled="analyticsLoading" @click="cancelAnalytics">{{ t('accountCancel') }}</n-button>
        </div>
      </form>
      <div v-else-if="analytics && analytics.state !== 'locked'" class="analytics-actions">
        <n-button :disabled="analyticsLoading" @click="editAnalytics">{{ t(analytics.accountId ? 'accountReplace' : 'accountConfigure') }}</n-button>
        <n-popconfirm v-if="analytics.accountId" @positive-click="updateAnalytics('DELETE')">
          <template #trigger><n-button :disabled="analyticsLoading">{{ t('accountDisconnect') }}</n-button></template>
          {{ t('accountDisconnectConfirm') }}
        </n-popconfirm>
      </div>
      <p v-if="analyticsError" role="alert" class="notice">{{ t(analyticsError) }}</p>
    </section>
  </div>
</template>
<style scoped>
.statistics-page { display: grid; gap: 18px; min-width: 0; }
.statistics-heading { display: flex; align-items: center; justify-content: space-between; gap: 14px; flex-wrap: wrap; }
.statistics-heading p { margin: 0; flex: 1; min-width: 200px; }
.statistics-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 16px; }
.statistic, .statistics-surface { background: var(--mail-panel); border: 1px solid var(--mail-border); border-radius: 12px; padding: 22px; min-width: 0; }
.statistic { display: flex; flex-direction: column; gap: 18px; }
.statistic span, p, .chart-day, .mailbox-highlights span { color: var(--mail-muted); font-size: 12px; line-height: 1.8; }
.statistic strong { font-size: 32px; font-weight: 550; color: #e2e8fa; } h2 { margin: 0 0 12px; font-size: 15px; font-weight: 550; }.notice { color: #fbbf24; }
.chart-legend { display: flex; gap: 20px; margin-bottom: 12px; font-size: 13px; }.received { color: #67e8f9; }.sent { color: #a5b4fc; }
.week-chart { display: grid; grid-template-columns: repeat(7, minmax(0, 1fr)); gap: 8px; }.chart-day { display: flex; flex-direction: column; align-items: center; gap: 4px; min-width: 0; }
.bar-pair { height: 100px; display: flex; align-items: flex-end; gap: 4px; width: 70%; border-bottom: 1px solid var(--mail-border); }.bar { width: 50%; border-radius: 3px 3px 0 0; }.received-bar { background: #22d3ee; }.sent-bar { background: #818cf8; }.chart-values { white-space: nowrap; font-size: 11px; }
.mailbox-highlights { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 20px; border-top: 1px solid var(--mail-border); margin-top: 20px; padding-top: 18px; }.mailbox-highlights div { display: flex; flex-direction: column; gap: 7px; }.mailbox-highlights strong { font-size: 14px; font-weight: 500; overflow-wrap: anywhere; }
.table-scroll { max-width: 100%; overflow-x: auto; margin: 10px 0 16px; } table { width: 100%; border-collapse: collapse; font-size: 13px; text-align: left; } td, th { border-bottom: 1px solid var(--mail-border); padding: 12px 10px; font-weight: 400; } th { color: var(--mail-muted); } td:first-child { overflow-wrap: anywhere; }.budget-table { min-width: 760px; font-variant-numeric: tabular-nums; }
select { color: #e2e8fa; background: var(--mail-panel); border: 1px solid var(--mail-border); padding: 7px 10px; border-radius: 7px; } a { color: #67e8f9; }
@media (max-width: 767px) { .statistics-grid { grid-template-columns: 1fr; gap: 10px; }.statistic { padding: 16px; flex-direction: row; align-items: center; justify-content: space-between; }.statistic strong { font-size: 25px; }.statistics-surface { padding: 18px 14px; }.mailbox-highlights { grid-template-columns: 1fr; }.week-chart { gap: 3px; }.chart-values { font-size: 9px; } td, th { padding: 10px 7px; } }
.account-usage, .analytics-actions { display: flex; flex-wrap: wrap; gap: 12px 28px; }
.account-usage div, .analytics-form label { display: grid; gap: 6px; }
.account-usage dd { margin: 0; font-variant-numeric: tabular-nums; }
.analytics-form { max-width: 420px; display: grid; gap: 12px; }
.analytics-form input { color: inherit; background: var(--mail-bg); border: 1px solid var(--mail-border); border-radius: 8px; padding: 8px 12px; min-width: 0; }
</style>
