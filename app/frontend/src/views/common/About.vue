<script setup>
import { computed } from 'vue'
import { GithubAlt, Discord, Telegram } from '@vicons/fa'
import { useGlobalState } from '../../store'
import { useScopedI18n } from '../../i18n/app'
import { sanitizeHtml } from '../../utils/sanitize-html'
const { announcement } = useGlobalState()
const { t } = useScopedI18n('views.Admin')
const safeAnnouncement = computed(() => sanitizeHtml(announcement.value))
const hasAnnouncement = computed(() => safeAnnouncement.value.trim().length > 0)
</script>

<template>
    <div class="center">
        <n-card :bordered="false" embedded>
            <div v-if="hasAnnouncement" v-html="safeAnnouncement"></div>
            <n-empty v-else :description="t('noAnnouncement')" />
            <n-button tag="a" target="_blank" href="https://github.com/dreamhunter2333/cloudflare_temp_email">
                <template #icon>
                    <n-icon :component="GithubAlt" />
                </template>
                Github
            </n-button>
            <n-button tag="a" target="_blank" href="https://discord.gg/dQEwTWhA6Q">
                <template #icon>
                    <n-icon :component="Discord" />
                </template>
                Discord
            </n-button>
            <n-button tag="a" target="_blank" href="https://t.me/cloudflare_temp_email">
                <template #icon>
                    <n-icon :component="Telegram" />
                </template>
                Telegram
            </n-button>
        </n-card>
    </div>
</template>

<style scoped>
.center {
    display: flex;
    justify-content: center;
}

.n-card {
    max-width: 800px;
}

.n-button {
    margin-top: 10px;
    margin-left: 10px;
}
</style>
