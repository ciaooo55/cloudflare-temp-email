<script setup>
import { computed, defineAsyncComponent, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useMessage } from 'naive-ui'
import { useScopedI18n } from '@/i18n/app'
import { useGlobalState } from '../store'
import { useIsMobile } from '../utils/composables'
import { processItem, refreshParsedItem, releaseMailResources } from '../utils/email-parser'
import { utcToLocalDate } from '../utils'
import AiExtractInfo from './AiExtractInfo.vue'

const MailContentRenderer = defineAsyncComponent(() => import('./MailContentRenderer.vue'))

const props = defineProps({
  fetchMailData: { type: Function, required: true },
  processMail: { type: Function, default: processItem },
  deleteMail: { type: Function, default: async () => {} },
  enableUserDeleteEmail: Boolean,
  showEMailTo: { type: Boolean, default: true },
  showReply: Boolean, showSaveS3: Boolean, showFilterInput: Boolean, enableMailReadStatus: Boolean,
  saveToS3: { type: Function, default: async () => {} },
  updateMailReadStatus: { type: Function, default: async () => {} },
})
const { t } = useScopedI18n('components.MailBox')
const emit = defineEmits(['reply', 'forward'])
const { useUTCDate, autoRefresh, configAutoRefreshInterval, loading } = useGlobalState()
const message = useMessage()
const isMobile = useIsMobile()
const rawData = ref([])
const curMail = ref(null)
const keyword = ref('')
const page = ref(1)
const pageSize = ref(20)
const count = ref(0)
const refreshing = ref(false)
const multiActionMode = ref(false)
const selected = ref([])
const seconds = ref(configAutoRefreshInterval.value)
const data = computed(() => {
  const query = keyword.value.trim().toLowerCase()
  return query ? rawData.value.filter(mail =>
    [mail.subject, mail.text, mail.preview, mail.source, mail.originalSource, mail.address, mail.originalRecipient].some(value => String(value || '').toLowerCase().includes(query))
  ) : rawData.value
})
const drawerOpen = computed({ get: () => !!curMail.value, set: value => { if (!value) curMail.value = null } })
const activeIndex = computed(() => data.value.findIndex(mail => mail.id === curMail.value?.id))
let version = 0
let disposed = false
let timer
const refresh = async () => {
  if (refreshing.value) return
  const currentVersion = ++version
  refreshing.value = true
  try {
    const response = await props.fetchMailData(pageSize.value, (page.value - 1) * pageSize.value)
    if (disposed || currentVersion !== version) return
    const previous = new Map(rawData.value.map(mail => [mail.id, mail]))
    const next = await Promise.all((response.results || []).map(item => {
      const cached = previous.get(item.id)
      return cached && cached.raw === item.raw
        ? refreshParsedItem(cached, item)
        : props.processMail({ ...item })
    }))
    if (disposed || currentVersion !== version) {
      next.forEach(mail => { if (mail.attachments !== previous.get(mail.id)?.attachments) releaseMailResources(mail) })
      return
    }
    rawData.value.forEach(mail => {
      if (!next.some(item => item.attachments === mail.attachments)) releaseMailResources(mail)
    })
    const selectedId = curMail.value?.id
    rawData.value = next
    if (page.value === 1 || response.count > 0) count.value = Number(response.count) || 0
    curMail.value = next.find(mail => mail.id === selectedId) || null
    selected.value = selected.value.filter(id => next.some(mail => mail.id === id))
  } catch (error) {
    message.error(error.message || 'error')
  } finally { if (currentVersion === version) refreshing.value = false }
}
const refreshFirstPage = () => {
  if (refreshing.value) return
  if (page.value !== 1) page.value = 1
  else void refresh()
}
const openMail = mail => {
  if (multiActionMode.value) {
    selected.value = selected.value.includes(mail.id) ? selected.value.filter(id => id !== mail.id) : [...selected.value, mail.id]
    return
  }
  curMail.value = mail
  if (props.enableMailReadStatus && mail.is_unread === 1) {
    mail.is_unread = 0
    void props.updateMailReadStatus(mail.id, false).catch(() => { mail.is_unread = 1 })
  }
}
const copyOriginalRecipient = async mail => {
  const address = mail.originalRecipient || mail.address
  if (!address) return
  try {
    await navigator.clipboard.writeText(address)
    message.success(t('copied'))
  } catch { message.error(t('copyFailed')) }
}
const toggleReadStatus = async () => {
  const mail = curMail.value
  const previous = mail.is_unread
  mail.is_unread = previous === 1 ? 0 : 1
  try { await props.updateMailReadStatus(mail.id, mail.is_unread === 1) }
  catch (error) { mail.is_unread = previous; throw error }
}
const deleteCurrent = async () => {
  try {
    await props.deleteMail(curMail.value.id)
    curMail.value = null
    await refresh()
    message.success(t('success'))
  } catch (error) { message.error(error.message || 'error') }
}
const deleteSelected = async () => {
  if (!selected.value.length) return
  try {
    for (const id of selected.value) await props.deleteMail(id)
    selected.value = []
    await refresh()
  } catch (error) { message.error(error.message || 'error'); await refresh() }
}
const downloadSelected = async () => {
  if (!selected.value.length) return
  const { default: JSZip } = await import('jszip')
  const zip = new JSZip()
  rawData.value.filter(mail => selected.value.includes(mail.id)).forEach(mail => zip.file(mail.id + (mail.rawFormat === 'json' ? '.json' : '.eml'), mail.raw))
  const url = URL.createObjectURL(await zip.generateAsync({ type: 'blob' }))
  const link = document.createElement('a')
  link.href = url
  link.download = 'mails.zip'
  link.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
const reply = () => emit('reply', curMail.value)
const forward = () => emit('forward', curMail.value)
const rendererProps = computed(() => ({
  mail: curMail.value, showEMailTo: props.showEMailTo,
  enableUserDeleteEmail: props.enableUserDeleteEmail, showReply: props.showReply,
  showSaveS3: props.showSaveS3, enableMailReadStatus: props.enableMailReadStatus,
  onDelete: deleteCurrent, onReply: reply, onForward: forward, onUpdateMailReadStatus: toggleReadStatus,
  onSaveToS3: (filename, blob) => props.saveToS3(curMail.value.id, filename, blob),
}))
watch([page, pageSize], () => { curMail.value = null; void refresh() })
watch(configAutoRefreshInterval, value => { seconds.value = value })
onMounted(() => {
  void refresh()
  timer = setInterval(() => {
    if (!autoRefresh.value || document.hidden || loading.value || refreshing.value || multiActionMode.value) return
    if (--seconds.value <= 0) {
      seconds.value = configAutoRefreshInterval.value
      refreshFirstPage()
    }
  }, 1000)
})
onBeforeUnmount(() => {
  disposed = true
  version++
  clearInterval(timer)
  rawData.value.forEach(releaseMailResources)
})
</script>

<template>
  <div class="mailbox">
    <div class="mailbox-toolbar">
      <slot name="filters" />
      <n-input v-if="showFilterInput" v-model:value="keyword" :placeholder="t('keywordQueryTip')"
        :aria-label="t('keywordQueryTip')" clearable class="mail-search" />
      <div class="refresh-controls">
        <label class="auto-refresh"><n-switch v-model:value="autoRefresh" size="small" :aria-label="t('autoRefresh')" />{{ t('autoRefresh') }}</label>
        <n-button :loading="refreshing" @click="refreshFirstPage" secondary size="small">{{ t('refresh') }}</n-button>
        <n-button @click="multiActionMode = !multiActionMode; selected = []" text size="small">{{ multiActionMode ? t('cancelMultiAction') : t('multiAction') }}</n-button>
      </div>
    </div>
    <div v-if="multiActionMode" class="batch-controls">
      <n-button size="small" @click="selected = data.map(mail => mail.id)">{{ t('selectAll') }}</n-button>
      <n-button size="small" @click="selected = []">{{ t('unselectAll') }}</n-button>
      <n-button size="small" :disabled="!selected.length" @click="downloadSelected">{{ t('downloadMail') }}</n-button>
      <n-popconfirm v-if="enableUserDeleteEmail" @positive-click="deleteSelected">
        <template #trigger><n-button size="small" type="error" secondary :disabled="!selected.length">{{ t('delete') }} ({{ selected.length }})</n-button></template>
        {{ t('deleteMailTip') }}
      </n-popconfirm>
    </div>
    <div class="mailbox-panes">
      <section class="message-list">
        <div class="list-caption"><span>{{ keyword.trim() ? t('filteredCount', { matched: data.length, total: count }) : t('messageCount', { total: count }) }}</span><span v-if="autoRefresh">{{ seconds }}s</span></div>
        <div v-if="!data.length" class="mail-empty">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1"><path d="M4 4h16v16H4z M4 13h5l2 3h2l2-3h5" /></svg>
          <p>{{ t(keyword.trim() ? 'noFilterMatches' : 'emptyMessages') }}</p>
        </div>
        <div class="message-rows">
          <div v-for="row in data" :key="row.id" class="message-row"
            :class="{ selected: curMail?.id === row.id || selected.includes(row.id), unread: enableMailReadStatus && row.is_unread === 1 }"
            @click="openMail(row)">
            <button type="button" class="message-open" :aria-label="row.subject"
              :aria-pressed="curMail?.id === row.id || selected.includes(row.id)" @click.stop="openMail(row)">
              <div class="message-sender"><span>{{ row.listSource || row.source }}</span><time>{{ utcToLocalDate(row.created_at, useUTCDate) }}</time></div>
              <div class="message-subject">{{ row.subject }}</div>
              <div v-if="row.preview || row.text" class="message-preview">{{ row.preview || row.text }}</div>
              <div class="message-recipient" v-if="showEMailTo">{{ row.address }}</div>
            </button>
            <div class="message-original-addresses">
              <div v-if="row.originalSource || row.source" class="message-address message-original-sender">
                <span class="message-address-label">{{ t('originalSender') }}</span>
                <span class="message-address-value" :title="row.originalSource || row.source">{{ row.originalSource || row.source }}</span>
              </div>
              <div v-if="row.originalRecipient || row.address" class="message-address message-original-recipient">
                <span class="message-address-label">{{ t('originalRecipient') }}</span>
                <span class="message-address-value" :title="row.originalRecipient || row.address">{{ row.originalRecipient || row.address }}</span>
                <button type="button" class="message-copy" :aria-label="t('copyOriginalRecipient')"
                  :title="t('copyOriginalRecipient')" @click.stop="copyOriginalRecipient(row)">{{ t('copy') }}</button>
              </div>
            </div>
            <AiExtractInfo :metadata="row.metadata" compact />
          </div>
        </div>
        <div class="mailbox-pagination">
          <n-pagination v-model:page="page" v-model:page-size="pageSize" :item-count="count"
            :disabled="refreshing" simple size="small" />
        </div>
      </section>
      <section v-if="!isMobile" class="message-reader">
        <template v-if="curMail">
          <div class="reader-navigation">
            <span>#{{ curMail.id }}</span>
            <n-space>
              <n-button text size="small" :disabled="activeIndex <= 0" @click="openMail(data[activeIndex - 1])">{{ t('prevMail') }}</n-button>
              <n-button text size="small" :disabled="activeIndex < 0 || activeIndex >= data.length - 1" @click="openMail(data[activeIndex + 1])">{{ t('nextMail') }}</n-button>
            </n-space>
          </div>
          <h2 class="reader-subject">{{ curMail.subject }}</h2>
          <MailContentRenderer :key="curMail.id" v-bind="rendererProps" />
        </template>
        <div v-else class="reader-placeholder">
          <svg viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="1.2"><rect x="6" y="10" width="36" height="28" rx="7" /><path d="m8 13 16 13 16-13" /></svg>
          <p>{{ locale === 'zh' ? '选择一封邮件' : 'Select a message' }}</p>
          <span>{{ locale === 'zh' ? '文字优先 · 图片仅在点击后加载' : 'Text first · Images load only on request' }}</span>
        </div>
      </section>
    </div>
    <n-drawer v-if="isMobile" v-model:show="drawerOpen" placement="bottom" height="94dvh">
      <n-drawer-content :title="curMail?.subject || ''" closable>
        <MailContentRenderer v-if="curMail" :key="curMail.id" v-bind="rendererProps" />
      </n-drawer-content>
    </n-drawer>
  </div>
</template>

<style scoped>
.mailbox-toolbar { display: flex; align-items: center; gap: 12px; padding-bottom: 16px; }
.mail-search { max-width: 300px; flex: 1 1 200px; }
.refresh-controls { display: flex; align-items: center; justify-content: flex-end; gap: 14px; flex: 1; white-space: nowrap; }
.auto-refresh { display: inline-flex; align-items: center; color: var(--mail-muted); font-size: 12px; }
.batch-controls { display: flex; flex-wrap: wrap; gap: 8px; padding-bottom: 14px; }
.mailbox-panes { display: grid; grid-template-columns: minmax(270px, 34%) minmax(0, 1fr); border: 1px solid var(--mail-border); border-radius: 12px; overflow: hidden; min-height: 65vh; background: var(--mail-panel); }
.message-list { min-width: 0; border-right: 1px solid var(--mail-border); display: flex; flex-direction: column; }
.list-caption { display: flex; justify-content: space-between; padding: 14px 18px; color: #8590a6; font-size: 11px; border-bottom: 1px solid var(--mail-border); }
.message-rows { max-height: 66vh; overflow-y: auto; }
.message-row { display: block; background: transparent; color: #c5cddd; border: 0; border-bottom: 1px solid #232936; width: 100%; text-align: left; padding: 18px; cursor: pointer; font: inherit; position: relative; }
.message-row:hover { background: #1a1f2b; }
.message-row.selected { background: #20283f; box-shadow: inset 3px 0 #a2b2ff; }
.message-open { display: block; width: 100%; padding: 0; border: 0; background: transparent; color: inherit; text-align: inherit; font: inherit; cursor: pointer; }
.message-open:focus-visible, .message-copy:focus-visible { outline: 2px solid #a2b2ff; outline-offset: 3px; border-radius: 3px; }
.message-sender { display: flex; justify-content: space-between; gap: 12px; font-size: 12px; margin-bottom: 9px; }
.message-sender > span { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.message-sender time { font-size: 10px; color: #8994aa; flex: none; }
.message-subject { font-size: 13px; font-weight: 580; color: #e0e5f1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.message-preview { font-size: 12px; color: #8e99af; margin-top: 5px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.message-recipient { font-size: 10px; color: #818da5; margin-top: 11px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.message-original-addresses { display: grid; gap: 5px; margin-top: 9px; font-size: 11px; }
.message-address { display: flex; align-items: center; gap: 7px; min-width: 0; }
.message-address-label { flex: none; color: #818da5; }
.message-address-value { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.message-copy { flex: none; padding: 0 2px; border: 0; background: transparent; color: #a2b2ff; font: inherit; cursor: pointer; }
.message-row :deep(.ai-extract-info) { margin-top: 10px; margin-bottom: 0; }
.message-reader { min-width: 0; padding: 22px 26px; max-height: 80vh; overflow-y: auto; }
.reader-navigation { display: flex; justify-content: space-between; align-items: center; gap: 12px; color: #768298; font-size: 11px; }
.reader-subject { font-size: 21px; line-height: 1.5; font-weight: 550; letter-spacing: -.025em; margin: 25px 0 22px; overflow-wrap: anywhere; }
.reader-placeholder, .mail-empty { display: flex; flex-direction: column; justify-content: center; align-items: center; text-align: center; min-height: 56vh; color: #8994aa; }
.reader-placeholder svg { width: 56px; height: 56px; color: #53607d; }
.reader-placeholder p { font-size: 16px; color: #bac3d7; margin-bottom: 7px; }
.reader-placeholder span { font-size: 12px; }
.mail-empty { min-height: 35vh; padding: 18px; }
.mail-empty svg { width: 36px; height: 36px; color: #53607d; }
.mailbox-pagination { margin-top: auto; padding: 14px 18px; border-top: 1px solid var(--mail-border); }
.unread .message-subject { color: #c7d1ff; }
@media (max-width: 1100px) {
  .mailbox-toolbar { flex-wrap: wrap; }
  .mail-search { max-width: none; width: 100%; }
  .message-sender { flex-wrap: wrap; gap: 4px; }
  .message-reader { padding: 18px; }
}
@media (max-width: 767px) {
  .mailbox-panes { grid-template-columns: minmax(0, 1fr); min-height: 55vh; }
  .message-list { border-right: 0; }
  .message-rows { max-height: none; }
  .refresh-controls { justify-content: space-between; gap: 8px; }
  .message-sender { flex-wrap: nowrap; }
  .message-row { padding: 18px 16px; }
}
</style>
