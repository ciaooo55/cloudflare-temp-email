<script setup>
import { ref } from 'vue'
import { useScopedI18n } from '@/i18n/app'
import { useGlobalState } from '../../store'
import { api } from '../../api'
import MailBox from '../../components/MailBox.vue'
const { adminSendBoxTabAddress } = useGlobalState()
const { t } = useScopedI18n('views.admin.SendBox')
const mailboxKey = ref(0)
const address = ref(adminSendBoxTabAddress.value)
const search = () => { adminSendBoxTabAddress.value = address.value.trim(); mailboxKey.value++ }
const fetchMailData = async (limit, offset) => {
  const response = await api.fetch('/admin/sendbox?limit=' + limit + '&offset=' + offset +
    (adminSendBoxTabAddress.value ? '&address=' + encodeURIComponent(adminSendBoxTabAddress.value) : ''), { showLoading: false })
  return { ...response, results: (response.results || []).map(mail => ({ ...mail, source: mail.address })) }
}
const deleteMail = id => api.fetch('/admin/sendbox/' + id, { method: 'DELETE' })
</script>
<template>
  <MailBox :key="mailboxKey" :enableUserDeleteEmail="true" :fetchMailData="fetchMailData" :deleteMail="deleteMail" :showEMailTo="false" :showFilterInput="true">
    <template #filters>
      <n-input-group class="address-query">
        <n-input v-model:value="address" :placeholder="t('queryTip')" :aria-label="t('queryTip')" clearable @keydown.enter="search" />
        <n-button secondary @click="search">{{ t('query') }}</n-button>
      </n-input-group>
    </template>
  </MailBox>
</template>
<style scoped>.address-query { flex: 1 1 240px; min-width: 0; }</style>
