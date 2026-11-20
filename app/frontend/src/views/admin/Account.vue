<script setup>
import { h, onMounted, ref, watch } from 'vue'
import { NButton, NDropdown, useDialog, useMessage } from 'naive-ui'
import { useScopedI18n } from '@/i18n/app'
import { useGlobalState } from '../../store'
import { api } from '../../api'
import { hashPassword, utcToLocalDate } from '../../utils'
import AddressCredentialModal from '../../components/AddressCredentialModal.vue'

const { t, locale } = useScopedI18n('views.admin.Account')
const { adminTab, adminMailTabAddress, adminSendBoxTabAddress, useUTCDate } = useGlobalState()
const message = useMessage()
const dialog = useDialog()
const rows = ref([])
const count = ref(0)
const page = ref(1)
const pageSize = ref(20)
const query = ref('')
const fetching = ref(false)
const credential = ref('')
const credentialAddress = ref('')
const showCredential = ref(false)
const resetRow = ref(null)
const password = ref('')
const showReset = ref(false)
const selected = ref([])
const fetchData = async () => {
  fetching.value = true
  try {
    const response = await api.fetch('/admin/address?include_received=1&limit=' + pageSize.value +
      '&offset=' + (page.value - 1) * pageSize.value + '&query=' + encodeURIComponent(query.value.trim()), { showLoading: false })
    rows.value = response.results || []
    if (page.value === 1 || response.count > 0) count.value = Number(response.count) || 0
    selected.value = []
  } catch (error) { message.error(error.message || 'error') }
  finally { fetching.value = false }
}
const search = () => { if (page.value === 1) void fetchData(); else page.value = 1 }
const viewMails = row => { adminMailTabAddress.value = row.name; adminTab.value = 'mails' }
const copy = async value => {
  try { await navigator.clipboard.writeText(value); message.success(t('success')) }
  catch (error) { message.error(error.message || 'error') }
}
const confirm = (content, action) => dialog.warning({
  title: t('actions'), content, positiveText: t('ok'), negativeText: locale.value === 'zh' ? '取消' : 'Cancel',
  onPositiveClick: async () => {
    try { await action(); await fetchData(); message.success(t('success')) }
    catch (error) { message.error(error.message || 'error') }
  }
})
const action = async (key, row) => {
  try {
    if (key === 'credential') {
      credential.value = await api.adminShowAddressCredential(row.id)
      credentialAddress.value = row.name
      showCredential.value = true
    } else if (key === 'reset') {
      resetRow.value = row; password.value = ''; showReset.value = true
    } else if (key === 'sent') {
      adminSendBoxTabAddress.value = row.name; adminTab.value = 'sendBox'
    } else if (key === 'clear') {
      confirm(t('clearInbox'), () => api.fetch('/admin/clear_inbox/' + row.id, { method: 'DELETE' }))
    } else if (key === 'clearSent') {
      confirm(t('clearSentItems'), () => api.fetch('/admin/clear_sent_items/' + row.id, { method: 'DELETE' }))
    } else if (key === 'delete') {
      confirm(t('delete'), () => api.adminDeleteAddress(row.id))
    }
  } catch (error) { message.error(error.message || 'error') }
}
const reset = async () => {
  if (!password.value.trim()) return
  try {
    await api.fetch('/admin/address/' + resetRow.value.id + '/reset_password', {
      method: 'POST', body: JSON.stringify({ password: await hashPassword(password.value.trim()) })
    })
    showReset.value = false; password.value = ''; message.success(t('passwordResetSuccess'))
  } catch (error) { message.error(error.message || 'error') }
}
const columns = [
  { type: 'selection' },
  { title: t('emailAddress'), key: 'name', minWidth: 240,
    render: row => h(NButton, { text: true, onClick: () => viewMails(row), style: 'max-width:100%;white-space:normal;overflow-wrap:anywhere' }, { default: () => row.name }) },
  { title: t('mail_count'), key: 'mail_count', width: 100 },
  { title: t('send_count'), key: 'send_count', width: 100 },
  { title: t('updated_at'), key: 'updated_at', width: 165,
    render: row => row.updated_at ? utcToLocalDate(row.updated_at, useUTCDate.value) : '—' },
  { title: t('actions'), key: 'actions', width: 160, render: row => h('div', { style: 'display:flex;gap:16px;align-items:center' }, [
    h(NButton, { text: true, onClick: () => copy(row.name) }, { default: () => locale.value === 'zh' ? '复制' : 'Copy' }),
    row.id ? h(NDropdown, { trigger: 'click', options: [
      { key: 'credential', label: t('showCredential') }, { key: 'sent', label: t('viewSendBox') },
      { key: 'reset', label: t('resetPassword') }, { key: 'clear', label: t('clearInbox') },
      { key: 'clearSent', label: t('clearSentItems') }, { key: 'delete', label: t('delete') },
    ], onSelect: key => action(key, row) }, { default: () => h(NButton, { text: true, 'aria-label': t('actions') }, { default: () => '•••' }) }) : null
  ]) },
]
watch([page, pageSize], fetchData)
onMounted(fetchData)
</script>

<template>
  <div class="mailbox-directory">
    <p class="directory-hint">{{ locale === 'zh' ? '域名内任意地址均可收信，无需创建。这里列出已有记录的邮箱；也可以直接在收件箱查询完整地址。' : 'No mailbox creation needed. Any address on your domain can receive mail. Addresses with records appear here; search any full address in Inbox.' }}</p>
    <div class="directory-toolbar">
      <n-input-group>
        <n-input v-model:value="query" :placeholder="t('addressQueryTip')" :aria-label="t('addressQueryTip')" clearable @keydown.enter="search" />
        <n-button @click="search" :loading="fetching" secondary>{{ t('query') }}</n-button>
      </n-input-group>
      <n-button :disabled="!selected.length" @click="copy(selected.join('\n'))" secondary>
        {{ locale === 'zh' ? '复制选中地址' : 'Copy selected' }} <span v-if="selected.length"> ({{ selected.length }})</span>
      </n-button>
    </div>
    <n-data-table :columns="columns" :data="rows" :loading="fetching" :row-key="row => row.name"
      v-model:checked-row-keys="selected" :bordered="false" :scroll-x="865" />
    <div class="directory-pagination">
      <n-pagination v-model:page="page" v-model:page-size="pageSize" :item-count="count" simple />
    </div>
    <AddressCredentialModal v-model:show="showCredential" :address="credentialAddress" :jwt="credential" />
    <n-modal v-model:show="showReset" preset="dialog" :title="t('resetPassword')">
      <p>{{ resetRow?.name }}</p>
      <n-input v-model:value="password" type="password" :aria-label="t('newPassword')" :placeholder="t('newPassword')" />
      <template #action><n-button type="primary" :disabled="!password.trim()" @click="reset">{{ t('ok') }}</n-button></template>
    </n-modal>
  </div>
</template>
<style scoped>
.directory-hint { margin: 0 0 22px; font-size: 12px; line-height: 1.8; color: var(--mail-muted); max-width: 65em; }
.directory-toolbar { display: flex; gap: 14px; margin-bottom: 18px; }
.directory-toolbar .n-input-group { max-width: 480px; }
.directory-pagination { display: flex; justify-content: flex-end; padding-top: 20px; }
@media (max-width: 767px) { .directory-toolbar { flex-wrap: wrap; } }
</style>
