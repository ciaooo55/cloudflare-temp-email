<script setup>
import { computed, onMounted, ref } from 'vue';
import { useScopedI18n } from '@/i18n/app'

import { useGlobalState } from '../../store'
import { api } from '../../api'

const { loading, openSettings } = useGlobalState()
const message = useMessage()

const { t } = useScopedI18n('views.admin.AccountSettings')

const addressBlockList = ref([])
const sendAddressBlockList = ref([])
const noLimitSendAddressList = ref([])
const verifiedAddressList = ref([])
const fromBlockList = ref([])
const emailRuleSettings = ref({
    blockReceiveUnknowAddressEmail: false
})
const ADDRESS_CREATION_SUBDOMAIN_MATCH_MODE = {
    FOLLOW_ENV: 'follow_env',
    FORCE_ENABLE: 'force_enable',
    FORCE_DISABLE: 'force_disable'
}
const DEFAULT_SEND_MAIL_DAILY_LIMIT = 100
const DEFAULT_SEND_MAIL_MONTHLY_LIMIT = 3000
const addressCreationSubdomainMatchMode = ref(ADDRESS_CREATION_SUBDOMAIN_MATCH_MODE.FOLLOW_ENV)
const sendMailDailyLimitEnabled = ref(false)
const sendMailMonthlyLimitEnabled = ref(false)
const sendMailDailyLimit = ref(DEFAULT_SEND_MAIL_DAILY_LIMIT)
const sendMailMonthlyLimit = ref(DEFAULT_SEND_MAIL_MONTHLY_LIMIT)
// 打开开关时若无值，填入默认值，避免空值提交
const onDailyLimitToggle = (v) => {
    if (v && sendMailDailyLimit.value == null) sendMailDailyLimit.value = DEFAULT_SEND_MAIL_DAILY_LIMIT
}
const onMonthlyLimitToggle = (v) => {
    if (v && sendMailMonthlyLimit.value == null) sendMailMonthlyLimit.value = DEFAULT_SEND_MAIL_MONTHLY_LIMIT
}
const addressCreationSubdomainMatchStatus = ref({
    envConfigured: false,
    envEnabled: false,
    storedEnabled: undefined,
    effectiveEnabled: false
})
const subdomainMatchEnvLocked = computed(() => {
    return addressCreationSubdomainMatchStatus.value.envConfigured
        && !addressCreationSubdomainMatchStatus.value.envEnabled
})
const subdomainMatchModeOptions = computed(() => {
    return [
        {
            value: ADDRESS_CREATION_SUBDOMAIN_MATCH_MODE.FOLLOW_ENV,
            label: t('create_address_subdomain_match_follow_env')
        },
        {
            value: ADDRESS_CREATION_SUBDOMAIN_MATCH_MODE.FORCE_ENABLE,
            label: t('create_address_subdomain_match_force_enable')
        },
        {
            value: ADDRESS_CREATION_SUBDOMAIN_MATCH_MODE.FORCE_DISABLE,
            label: t('create_address_subdomain_match_force_disable')
        }
    ]
})

const getSubdomainMatchModeByStoredValue = (storedEnabled) => {
    if (storedEnabled === true) {
        return ADDRESS_CREATION_SUBDOMAIN_MATCH_MODE.FORCE_ENABLE
    }
    if (storedEnabled === false) {
        return ADDRESS_CREATION_SUBDOMAIN_MATCH_MODE.FORCE_DISABLE
    }
    return ADDRESS_CREATION_SUBDOMAIN_MATCH_MODE.FOLLOW_ENV
}

const getSubdomainMatchPayloadValue = (mode) => {
    if (mode === ADDRESS_CREATION_SUBDOMAIN_MATCH_MODE.FORCE_ENABLE) {
        return true
    }
    if (mode === ADDRESS_CREATION_SUBDOMAIN_MATCH_MODE.FORCE_DISABLE) {
        return false
    }
    return null
}

const getSendMailLimitPayload = () => {
    return {
        dailyEnabled: sendMailDailyLimitEnabled.value,
        monthlyEnabled: sendMailMonthlyLimitEnabled.value,
        dailyLimit: sendMailDailyLimitEnabled.value ? sendMailDailyLimit.value : null,
        monthlyLimit: sendMailMonthlyLimitEnabled.value ? sendMailMonthlyLimit.value : null
    }
}

const isValidSendMailLimit = (value) => {
    return Number.isInteger(value) && value >= -1
}

const validateSendMailLimit = () => {
    if (sendMailDailyLimitEnabled.value && !isValidSendMailLimit(sendMailDailyLimit.value)) {
        message.error(t('send_mail_daily_limit_invalid'))
        return false
    }
    if (sendMailMonthlyLimitEnabled.value && !isValidSendMailLimit(sendMailMonthlyLimit.value)) {
        message.error(t('send_mail_monthly_limit_invalid'))
        return false
    }
    return true
}

const fetchData = async ({ suppressErrorMessage = false } = {}) => {
    try {
        const res = await api.fetch(`/admin/account_settings`)
        addressBlockList.value = res.blockList || []
        sendAddressBlockList.value = res.sendBlockList || []
        verifiedAddressList.value = res.verifiedAddressList || []
        fromBlockList.value = res.fromBlockList || []
        noLimitSendAddressList.value = res.noLimitSendAddressList || []
        emailRuleSettings.value = {
            blockReceiveUnknowAddressEmail: res.emailRuleSettings?.blockReceiveUnknowAddressEmail || false
        }
        addressCreationSubdomainMatchStatus.value = {
            envConfigured: !!res.addressCreationSubdomainMatchStatus?.envConfigured,
            envEnabled: !!res.addressCreationSubdomainMatchStatus?.envEnabled,
            storedEnabled: typeof res.addressCreationSubdomainMatchStatus?.storedEnabled === 'boolean'
                ? res.addressCreationSubdomainMatchStatus.storedEnabled
                : undefined,
            effectiveEnabled: !!res.addressCreationSubdomainMatchStatus?.effectiveEnabled
        }
        addressCreationSubdomainMatchMode.value = getSubdomainMatchModeByStoredValue(
            addressCreationSubdomainMatchStatus.value.storedEnabled
        )
        const sendMailLimitConfig = res.sendMailLimitConfig
        sendMailDailyLimitEnabled.value = !!sendMailLimitConfig?.dailyEnabled
        sendMailMonthlyLimitEnabled.value = !!sendMailLimitConfig?.monthlyEnabled
        sendMailDailyLimit.value = sendMailDailyLimitEnabled.value
            ? sendMailLimitConfig.dailyLimit
            : null
        sendMailMonthlyLimit.value = sendMailMonthlyLimitEnabled.value
            ? sendMailLimitConfig.monthlyLimit
            : null
    } catch (error) {
        if (!suppressErrorMessage) {
            message.error(error.message || "error");
        }
        throw error
    }
}

const save = async () => {
    if (!validateSendMailLimit()) {
        return
    }
    try {
        const payload = {
            blockList: addressBlockList.value || [],
            sendBlockList: sendAddressBlockList.value || [],
            verifiedAddressList: verifiedAddressList.value || [],
            fromBlockList: fromBlockList.value || [],
            noLimitSendAddressList: noLimitSendAddressList.value || [],
            emailRuleSettings: emailRuleSettings.value,
            addressCreationSettings: {
                enableSubdomainMatch: getSubdomainMatchPayloadValue(addressCreationSubdomainMatchMode.value)
            },
            sendMailLimitConfig: getSendMailLimitPayload()
        }
        await api.fetch(`/admin/account_settings`, {
            method: 'POST',
            body: JSON.stringify(payload)
        })
        message.success(t('successTip'))
    } catch (error) {
        message.error(error.message || "error");
        return
    }

    try {
        await fetchData({ suppressErrorMessage: true })
    } catch (error) {
        console.warn('Failed to refresh account settings after save', error)
        message.warning(error.message || "error");
    }
}


onMounted(async () => {
    try {
        await fetchData();
    } catch {
        // 首次加载失败时，错误提示已经在 fetchData 内部统一处理，这里无需重复提示。
    }
})
</script>

<template>
    <div class="center">
        <n-card :bordered="false" embedded style="max-width: 600px;">
            <n-alert :show-icon="false" :bordered="false" type="warning" style="margin-bottom: 10px;">
                <span>{{ t("tip") }}</span>
            </n-alert>
            <n-flex justify="end">
                <n-button @click="save" type="primary" :loading="loading">
                    {{ t('save') }}
                </n-button>
            </n-flex>
            <n-form-item-row :label="t('address_block_list')" :feedback="t('manualInputPrompt')">
                <n-select v-model:value="addressBlockList" filterable multiple tag
                    :placeholder="t('address_block_list_placeholder')">
                </n-select>
            </n-form-item-row>
            <n-form-item-row :label="t('send_address_block_list')" :feedback="t('manualInputPrompt')">
                <n-select v-model:value="sendAddressBlockList" filterable multiple tag
                    :placeholder="t('address_block_list_placeholder')">
                </n-select>
            </n-form-item-row>
            <n-form-item-row :label="t('noLimitSendAddressList')" :feedback="t('manualInputPrompt')">
                <n-select v-model:value="noLimitSendAddressList" filterable multiple tag
                    :placeholder="t('noLimitSendAddressList')">
                </n-select>
            </n-form-item-row>
            <n-form-item-row :label="t('verified_address_list')" :feedback="t('manualInputPrompt')">
                <n-select v-model:value="verifiedAddressList" filterable multiple tag
                    :placeholder="t('verified_address_list')">
                </n-select>
            </n-form-item-row>
            <n-form-item-row :label="t('send_mail_limit')">
                <n-flex vertical style="width: 100%;">
                    <n-flex justify="space-between" align="center">
                        <n-text>{{ t('send_mail_daily_limit') }}</n-text>
                        <n-flex align="center">
                            <n-switch v-model:value="sendMailDailyLimitEnabled" :round="false"
                                @update:value="onDailyLimitToggle" />
                            <n-input-number
                                v-model:value="sendMailDailyLimit"
                                :disabled="!sendMailDailyLimitEnabled"
                                :min="-1"
                                :placeholder="t('send_mail_limit_disabled_placeholder')"
                            />
                        </n-flex>
                    </n-flex>
                    <n-flex justify="space-between" align="center">
                        <n-text>{{ t('send_mail_monthly_limit') }}</n-text>
                        <n-flex align="center">
                            <n-switch v-model:value="sendMailMonthlyLimitEnabled" :round="false"
                                @update:value="onMonthlyLimitToggle" />
                            <n-input-number
                                v-model:value="sendMailMonthlyLimit"
                                :disabled="!sendMailMonthlyLimitEnabled"
                                :min="-1"
                                :placeholder="t('send_mail_limit_disabled_placeholder')"
                            />
                        </n-flex>
                    </n-flex>
                    <n-text depth="3">
                        {{ t('send_mail_limit_tip') }}
                    </n-text>
                </n-flex>
            </n-form-item-row>
            <n-form-item-row :label="t('fromBlockList')" :feedback="t('manualInputPrompt')">
                <n-select v-model:value="fromBlockList" filterable multiple tag :placeholder="t('fromBlockList')">
                </n-select>
            </n-form-item-row>
            <n-form-item-row :label="t('block_receive_unknow_address_email')">
                <n-switch v-model:value="emailRuleSettings.blockReceiveUnknowAddressEmail" :round="false" />
            </n-form-item-row>
            <n-form-item-row :label="t('create_address_subdomain_match')">
                <n-flex vertical style="width: 100%;">
                    <n-radio-group v-model:value="addressCreationSubdomainMatchMode">
                        <n-space vertical size="small">
                            <n-radio v-for="item in subdomainMatchModeOptions" :key="item.value" :value="item.value">
                                {{ item.label }}
                            </n-radio>
                        </n-space>
                    </n-radio-group>
                    <n-text depth="3">
                        {{ t('create_address_subdomain_match_tip') }}
                    </n-text>
                    <n-text depth="3">
                        {{ t('create_address_subdomain_match_note') }}
                    </n-text>
                    <n-text depth="3">
                        {{ t('create_address_subdomain_match_follow_env_note') }}
                    </n-text>
                    <n-alert v-if="subdomainMatchEnvLocked" type="warning" :show-icon="false" :bordered="false">
                        {{ t('create_address_subdomain_match_env_locked') }}
                    </n-alert>
                </n-flex>
            </n-form-item-row>
            <n-flex justify="end" style="margin-top: 12px;">
                <n-button @click="save" type="primary" :loading="loading">
                    {{ t('save') }}
                </n-button>
            </n-flex>
        </n-card>
    </div>

</template>

<style scoped>
.center {
    display: flex;
    text-align: left;
    place-items: center;
    justify-content: center;
    margin: 20px;
}
</style>
