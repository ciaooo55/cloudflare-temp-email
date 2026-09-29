<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useScopedI18n } from '@/i18n/app'
import { useDialog } from 'naive-ui'

// @ts-ignore
import { useGlobalState } from '../../store'
// @ts-ignore
import { api } from '../../api'
// @ts-ignore
const message = useMessage()
const dialog = useDialog()

const { t } = useScopedI18n('views.admin.Telegram')

const status = ref({
    fetched: false,
})

const fetchStatus = async () => {
    try {
        const res = await api.fetch(`/admin/telegram/status`)
        Object.assign(status.value, res)
        status.value.fetched = true
    } catch (error) {
        message.error((error as Error).message || "error");
    }
}

const init = async () => {
    try {
        await api.fetch(`/admin/telegram/init`, {
            method: 'POST',
        })
        message.success(t('successTip'))
    } catch (error) {
        message.error((error as Error).message || "error");
    }
}

type BotItem = {
    id: string;
    name: string;
    enabled: boolean;
    createdAt: string;
    maskedToken: string;
    allowedChatIds: string;
    allowedGroupIds: string;
}

const bots = ref<BotItem[]>([])
const newBotName = ref('')
const newBotToken = ref('')
const newBotChatIds = ref('')
const newBotGroupIds = ref('')
const showTestModal = ref(false)
const testBotId = ref('')
const testChatId = ref('')
const testResult = ref('')

const fetchBots = async () => {
    try {
        bots.value = await api.fetch(`/admin/notify/telegram_bots`)
    } catch (error) {
        message.error((error as Error).message || "error");
    }
}

const addBot = async () => {
    if (!newBotToken.value.trim()) {
        message.warning(t('tokenPlaceholder'));
        return;
    }
    try {
        await api.fetch(`/admin/notify/telegram_bots`, {
            method: 'POST',
            body: JSON.stringify({
                name: newBotName.value,
                token: newBotToken.value,
                allowedChatIds: newBotChatIds.value,
                allowedGroupIds: newBotGroupIds.value,
            }),
        })
        newBotName.value = '';
        newBotToken.value = '';
        newBotChatIds.value = '';
        newBotGroupIds.value = '';
        message.success(t('successTip'))
        await fetchBots();
    } catch (error) {
        message.error((error as Error).message || "error");
    }
}

const saveBotWhitelist = async (bot: BotItem) => {
    try {
        await api.fetch(`/admin/notify/telegram_bots/${bot.id}`, {
            method: 'PUT',
            body: JSON.stringify({
                allowedChatIds: bot.allowedChatIds,
                allowedGroupIds: bot.allowedGroupIds,
            }),
        })
        message.success(t('successTip'))
    } catch (error) {
        message.error((error as Error).message || "error");
    }
}

const toggleBot = async (bot: BotItem) => {
    try {
        await api.fetch(`/admin/notify/telegram_bots/${bot.id}`, {
            method: 'PUT',
            body: JSON.stringify({ enabled: bot.enabled }),
        })
        message.success(t('successTip'))
    } catch (error) {
        bot.enabled = !bot.enabled;
        message.error((error as Error).message || "error");
    }
}

const deleteBot = async (bot: BotItem) => {
    dialog.warning({
        title: '确认操作',
        content: t('confirmDelete'),
        positiveText: '确定',
        negativeText: '取消',
        onPositiveClick: async () => {
            try {
                await api.fetch(`/admin/notify/telegram_bots/${bot.id}`, { method: 'DELETE' })
                message.success(t('successTip'))
                await fetchBots();
            } catch (error) {
                message.error((error as Error).message || "error");
            }
        }
    })
}

const openTestModal = (bot: BotItem) => {
    testBotId.value = bot.id;
    testResult.value = '';
    showTestModal.value = true;
}

const runBotTest = async () => {
    testResult.value = '';
    try {
        const res = await api.fetch(`/admin/notify/telegram_bots/${testBotId.value}/test`, {
            method: 'POST',
            body: JSON.stringify({ chatId: testChatId.value }),
        })
        testResult.value = res.ok
            ? `${t('testOk')}${res.username ? ' @' + res.username : ''}${res.messageSent ? '，' + t('testMsgSent') : ''}`
            : `${t('testFail')}${res.error || ''}`;
        if (res.ok) message.success(t('successTip'));
    } catch (error) {
        testResult.value = `${t('testFail')}${(error as Error).message || ''}`;
    }
}

const setBotWebhook = async (bot: BotItem) => {
    try {
        const res = await api.fetch(`/admin/notify/telegram_bots/${bot.id}/webhook`, { method: 'POST' })
        if (res.ok) {
            message.success(`${t('webhookOk')}: ${res.webhookUrl}`);
        } else {
            message.error(`${t('testFail')}${res.error || ''}`);
        }
    } catch (error) {
        message.error((error as Error).message || "error");
    }
}

class TelegramSettings {
    enableAllowList: boolean;
    allowList: string[];
    miniAppUrl: string;
    enableGlobalMailPush: boolean;
    globalMailPushList: string[];

    constructor(
        enableAllowList: boolean, allowList: string[], miniAppUrl: string,
        enableGlobalMailPush: boolean, globalMailPushList: string[]
    ) {
        this.enableAllowList = enableAllowList;
        this.allowList = allowList;
        this.miniAppUrl = miniAppUrl;
        this.enableGlobalMailPush = enableGlobalMailPush;
        this.globalMailPushList = globalMailPushList;
    }
}

const settings = ref(new TelegramSettings(false, [], '', false, []))

const getSettings = async () => {
    try {
        const res = await api.fetch(`/admin/telegram/settings`)
        Object.assign(settings.value, res)
    } catch (error) {
        message.error((error as Error).message || "error");
    }
}

const saveSettings = async () => {
    try {
        await api.fetch(`/admin/telegram/settings`, {
            method: 'POST',
            body: JSON.stringify(settings.value),
        })
        message.success(t('successTip'))
    } catch (error) {
        message.error((error as Error).message || "error");
    }
}

onMounted(async () => {
    await getSettings();
    await fetchBots();
})
</script>

<template>
    <div class="center">
        <n-card :bordered="false" embedded style="max-width: 800px; overflow: auto;">
            <n-flex justify="end">
                <n-button @click="fetchStatus" secondary>
                    {{ t('status') }}
                </n-button>
                <n-button @click="init" type="primary">
                    {{ t('init') }}
                </n-button>
                <n-button @click="saveSettings" type="primary">
                    {{ t('save') }}
                </n-button>
            </n-flex>
            <n-card :bordered="false" embedded :title="t('botManagement')" style="margin-top: 12px;">
                <n-text depth="3" style="font-size: 12px;">{{ t('botManagementTip') }}<br />每个机器人一行，可单独设置用户ID白名单和群组ID白名单（逗号分隔），留空表示不限制。</n-text>
                <n-table :bordered="false" style="margin-top: 8px;">
                    <thead>
                        <tr>
                            <th>{{ t('botName') }}</th>
                            <th>{{ t('botToken') }}</th>
                            <th>用户ID白名单</th>
                            <th>群组ID白名单</th>
                            <th>{{ t('enabled') }}</th>
                            <th>{{ t('actions') }}</th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr v-for="bot in bots" :key="bot.id">
                            <td>{{ bot.name }}</td>
                            <td><n-text code>{{ bot.maskedToken }}</n-text></td>
                            <td>
                                <n-input v-model:value="bot.allowedChatIds" placeholder="如：123456,789012，留空不限制"
                                    style="width: 180px;" size="small" @change="saveBotWhitelist(bot)" />
                            </td>
                            <td>
                                <n-input v-model:value="bot.allowedGroupIds" placeholder="如：-100123456，留空不限制"
                                    style="width: 180px;" size="small" @change="saveBotWhitelist(bot)" />
                            </td>
                            <td><n-switch v-model:value="bot.enabled" @update:value="toggleBot(bot)" :round="false" /></td>
                            <td>
                                <n-flex>
                                    <n-button size="small" @click="openTestModal(bot)">{{ t('test') }}</n-button>
                                    <n-button size="small" @click="setBotWebhook(bot)">{{ t('setWebhook') }}</n-button>
                                    <n-button v-if="bot.id !== 'env'" size="small" type="error" ghost @click="deleteBot(bot)">{{ t('delete') }}</n-button>
                                </n-flex>
                            </td>
                        </tr>
                        <tr v-if="!bots.length">
                            <td colspan="6"><n-text depth="3">{{ t('noBots') }}</n-text></td>
                        </tr>
                    </tbody>
                </n-table>
                <n-flex style="margin-top: 12px;" vertical>
                    <n-flex>
                        <n-input v-model:value="newBotName" :placeholder="t('namePlaceholder')" style="width: 200px;" />
                        <n-input v-model:value="newBotToken" :placeholder="t('tokenPlaceholder')" style="flex: 1;" show-password-on="click" type="password" />
                    </n-flex>
                    <n-flex>
                        <n-input v-model:value="newBotChatIds" placeholder="用户ID白名单（逗号分隔，留空不限制）" style="flex: 1;" />
                        <n-input v-model:value="newBotGroupIds" placeholder="群组ID白名单（逗号分隔，留空不限制）" style="flex: 1;" />
                        <n-button type="primary" @click="addBot">{{ t('add') }}</n-button>
                    </n-flex>
                </n-flex>
            </n-card>
            <n-modal v-model:show="showTestModal" preset="dialog" :title="t('test')">
                <n-form-item-row :label="t('testChatId')">
                    <n-input v-model:value="testChatId" :placeholder="t('testChatIdTip')" />
                </n-form-item-row>
                <n-text v-if="testResult" depth="3" style="font-size: 12px; white-space: pre-wrap;">{{ testResult }}</n-text>
                <template #action>
                    <n-button type="primary" @click="runBotTest">{{ t('test') }}</n-button>
                </template>
            </n-modal>
            <n-card :bordered="false" embedded>
                <n-form-item-row :label="t('enableTelegramAllowList')">
                    <n-input-group>
                        <n-checkbox v-model:checked="settings.enableAllowList" style="width: 20%;">
                            {{ t('enable') }}
                        </n-checkbox>
                        <n-select v-model:value="settings.allowList" filterable multiple tag style="width: 80%;"
                            :placeholder="t('telegramAllowList')">
                            <template #empty>
                                <n-text depth="3">
                                    {{ t('manualInputPrompt') }}
                                </n-text>
                            </template>
                        </n-select>
                    </n-input-group>
                </n-form-item-row>
                <br />
                <n-form-item-row :label="t('enableGlobalMailPush')">
                    <n-input-group>
                        <n-checkbox v-model:checked="settings.enableGlobalMailPush" style="width: 20%;">
                            {{ t('enable') }}
                        </n-checkbox>
                        <n-select v-model:value="settings.globalMailPushList" filterable multiple tag
                            style="width: 80%;" :placeholder="t('globalMailPushList')">
                            <template #empty>
                                <n-text depth="3">
                                    {{ t('manualInputPrompt') }}
                                </n-text>
                            </template>
                        </n-select>
                    </n-input-group>
                    <template #feedback>
                        <n-text depth="3">
                            {{ t('globalMailPushListTip') }}
                        </n-text>
                    </template>
                </n-form-item-row>
                <br />
                <n-form-item-row :label="t('miniAppUrl')">
                    <n-input v-model:value="settings.miniAppUrl"></n-input>
                </n-form-item-row>
            </n-card>
            <pre v-if="status.fetched">{{ JSON.stringify(status, null, 2) }}</pre>
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
</style>
