<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useScopedI18n } from '@/i18n/app'
import { useMessage } from 'naive-ui'
// @ts-ignore
import { api } from '../../api'

const message = useMessage()

const { t } = useScopedI18n('views.admin.AiExtractSettings')

type AiExtractSettings = {
    enableAllowList: boolean
    allowList: string[]
    mode: string
    customApiUrl: string
    customApiKey: string
    customModel: string
    hasCustomApiKey: boolean
}

const settings = ref<AiExtractSettings>({
    enableAllowList: false,
    allowList: [],
    mode: '',
    customApiUrl: '',
    customApiKey: '',
    customModel: '',
    hasCustomApiKey: false,
})

const modeOptions = [
    { value: '' },
    { value: 'local' },
    { value: 'ai' },
    { value: 'custom' },
]

const sampleText = ref('')
const testResult = ref('')
const testing = ref(false)

const testCustomAi = async () => {
    testResult.value = '';
    testing.value = true;
    try {
        const res = await api.fetch(`/admin/ai_extract/test`, {
            method: 'POST',
            body: JSON.stringify({ sampleText: sampleText.value }),
        })
        testResult.value = res.ok
            ? `${t('testOk')} [${res.model}]\n${JSON.stringify(res.result, null, 2)}`
            : `${t('testFail')}${res.error || ''}`;
        if (res.ok) message.success(t('successTip'));
    } catch (error) {
        testResult.value = `${t('testFail')}${(error as Error).message || ''}`;
    } finally {
        testing.value = false;
    }
}

const fetchData = async () => {
    try {
        const res = await api.fetch(`/admin/ai_extract/settings`) as AiExtractSettings
        Object.assign(settings.value, res)
    } catch (error) {
        message.error((error as Error).message || "error");
    }
}

const saveSettings = async () => {
    try {
        await api.fetch(`/admin/ai_extract/settings`, {
            method: 'POST',
            body: JSON.stringify(settings.value),
        })
        message.success(t('successTip'))
    } catch (error) {
        message.error((error as Error).message || "error");
    }
}

onMounted(async () => {
    await fetchData();
})
</script>

<template>
    <div class="center">
        <n-card :title="t('title')" :bordered="false" embedded style="max-width: 800px; overflow: auto;">
            <n-flex justify="end">
                <n-button @click="saveSettings" type="primary">
                    {{ t('save') }}
                </n-button>
            </n-flex>

            <n-divider>{{ t('customAiTitle') }}</n-divider>
            <n-form-item-row :label="t('mode')">
                <n-select v-model:value="settings.mode" :options="modeOptions.map(o => ({
                    label: t(o.value === '' ? 'modeFollowEnv' : o.value === 'local' ? 'modeLocal' : o.value === 'ai' ? 'modeAi' : 'modeCustom'),
                    value: o.value
                }))" style="width: 100%;" />
                <template #feedback>
                    <n-text depth="3" style="font-size: 12px;">{{ t('modeTip') }}</n-text>
                </template>
            </n-form-item-row>
            <n-form-item-row :label="t('customApiUrl')">
                <n-input v-model:value="settings.customApiUrl" :placeholder="t('customApiUrlTip')" />
            </n-form-item-row>
            <n-form-item-row :label="t('customApiKey')">
                <n-input v-model:value="settings.customApiKey" type="password" show-password-on="click"
                    :placeholder="settings.hasCustomApiKey ? t('customApiKeyKept') : t('customApiKeyTip')" />
            </n-form-item-row>
            <n-form-item-row :label="t('customModel')">
                <n-input v-model:value="settings.customModel" :placeholder="t('customModelTip')" />
            </n-form-item-row>
            <n-form-item-row :label="t('testSample')">
                <n-input v-model:value="sampleText" type="textarea" :placeholder="t('testSampleTip')"
                    :autosize="{ minRows: 2, maxRows: 4 }" />
            </n-form-item-row>
            <n-flex justify="end" style="margin-bottom: 12px;">
                <n-button @click="testCustomAi" :loading="testing" secondary>{{ t('test') }}</n-button>
            </n-flex>
            <n-text v-if="testResult" depth="3"
                style="font-size: 12px; white-space: pre-wrap; display: block; margin-bottom: 12px;">{{ testResult }}</n-text>
            <n-text depth="3" style="font-size: 12px; display: block; margin-bottom: 12px;">{{ t('fallbackTip') }}</n-text>

            <n-divider>{{ t('allowListTitle') }}</n-divider>
            <n-form-item-row :label="t('enableAllowList')">
                <n-switch v-model:value="settings.enableAllowList" :round="false" />
            </n-form-item-row>

            <n-alert v-if="!settings.enableAllowList" type="info" style="margin-bottom: 16px;">
                {{ t('disabledTip') }}
            </n-alert>

            <div v-if="settings.enableAllowList">
                <n-alert type="warning" style="margin-bottom: 16px;">
                    {{ t('enableAllowListTip') }}
                </n-alert>

                <n-form-item-row :label="t('allowList')">
                    <n-select v-model:value="settings.allowList" filterable multiple tag
                        :placeholder="t('allowListTip')">
                        <template #empty>
                            <n-text depth="3">
                                {{ t('manualInputPrompt') }}
                            </n-text>
                        </template>
                    </n-select>
                </n-form-item-row>

                <n-text depth="3" style="font-size: 12px;">
                    {{ t('allowListTip') }}
                </n-text>
            </div>
        </n-card>
    </div>
</template>

<style scoped>
.center {
    display: flex;
    text-align: left;
    place-items: center;
    justify-content: center;
}

.n-button {
    margin-top: 10px;
}
</style>
