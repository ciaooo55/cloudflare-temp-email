<script setup>
import { onBeforeUnmount, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { useMessage } from 'naive-ui'
import { useGlobalState } from '../../store'
import { api } from '../../api'
import { processItem, releaseMailResources } from '../../utils/email-parser'
import MailContentRenderer from '../../components/MailContentRenderer.vue'

const { telegramApp } = useGlobalState()
const route = useRoute()
const message = useMessage()
const curMail = ref(null)
let version = 0

watch([() => telegramApp.value.initData, () => route.query.mail_id], async ([initData, mailId]) => {
    const currentVersion = ++version
    releaseMailResources(curMail.value)
    curMail.value = null
    if (!initData || !mailId) return
    try {
        const mail = await api.fetch('/telegram/get_mail', {
            method: 'POST',
            body: JSON.stringify({ initData, mailId }),
        })
        if (currentVersion !== version) return
        const parsed = await processItem(mail)
        if (currentVersion !== version) {
            releaseMailResources(parsed)
            return
        }
        curMail.value = parsed
    } catch (error) {
        if (currentVersion === version) message.error(error.message || 'error')
    }
}, { immediate: true })

onBeforeUnmount(() => {
    version++
    releaseMailResources(curMail.value)
})
</script>

<template>
    <main class="telegram-mail">
        <n-card v-if="curMail" :bordered="false" embedded>
            <MailContentRenderer :mail="curMail" />
        </n-card>
    </main>
</template>

<style scoped>
.telegram-mail { max-width: 900px; margin: 20px auto; padding: 0 12px; min-width: 0; }
</style>
