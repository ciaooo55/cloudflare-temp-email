<script setup>
import { ref } from 'vue';
import { useScopedI18n } from '@/i18n/app'

import { useGlobalState } from '../../store'
import { api } from '../../api'
import MailBox from '../../components/MailBox.vue';
import { buildReplyModel, buildForwardModel } from '../../utils/mail-actions';

const { adminMailTabAddress, adminTab, sendMailModel, openSettings } = useGlobalState()

const { t } = useScopedI18n('views.admin.Mails')

const { t: mailText } = useScopedI18n('components.MailBox')
const compose = model => {
    Object.assign(sendMailModel.value, model);
    adminTab.value = 'sendMail';
}
const reply = mail => compose(buildReplyModel(mail, mailText('reply')));
const forward = mail => compose(buildForwardModel(mail, mailText('forwardMail')));

const mailBoxKey = ref("")
const address = ref(adminMailTabAddress.value)

const queryMail = () => {
    adminMailTabAddress.value = address.value.trim();
    mailBoxKey.value = Date.now();
}

const fetchMailData = async (limit, offset) => {
    return await api.fetch(
        `/admin/mails`
        + `?limit=${limit}`
        + `&offset=${offset}`
        + (adminMailTabAddress.value ? `&address=${encodeURIComponent(adminMailTabAddress.value)}` : ''),
        { showLoading: false }
    );
}

const updateMailReadStatus = (id, isUnread) => api.fetch(`/admin/mails/${id}/read`, {
    method: 'PATCH', body: JSON.stringify({ isUnread }), showLoading: false
});

const deleteMail = async (curMailId) => {
    await api.fetch(`/admin/mails/${curMailId}`, { method: 'DELETE' });
};
</script>

<template>
    <MailBox :key="mailBoxKey" :enableUserDeleteEmail="true" :fetchMailData="fetchMailData"
        :deleteMail="deleteMail" :showFilterInput="true" :showReply="true" :enableMailReadStatus="openSettings.enableMailReadStatus" :updateMailReadStatus="updateMailReadStatus" @reply="reply" @forward="forward">
        <template #filters>
            <n-input-group class="address-query">
                <n-input v-model:value="address" :placeholder="t('addressQueryTip')" :aria-label="t('addressQueryTip')"
                    @keydown.enter="queryMail" clearable />
                <n-button @click="queryMail" secondary>{{ t('query') }}</n-button>
            </n-input-group>
        </template>
    </MailBox>
</template>
<style scoped>.address-query { flex: 1 1 240px; min-width: 0; }</style>
