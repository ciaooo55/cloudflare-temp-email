<script setup>
import { ref, onMounted } from 'vue';
import { useDialog } from 'naive-ui'
import { useScopedI18n } from '@/i18n/app'
import { CleaningServicesFilled, AddFilled, DeleteFilled } from '@vicons/material'
import { formatLocalDateTime } from '../../utils'

import { useGlobalState } from '../../store'
import { api } from '../../api'

const { loading } = useGlobalState()
const message = useMessage()
const dialog = useDialog()
const cleanupModel = ref({
    enableMailsAutoCleanup: false,
    cleanMailsDays: 30,
    enableUnknowMailsAutoCleanup: false,
    cleanUnknowMailsDays: 30,
    enableSendBoxAutoCleanup: false,
    cleanSendBoxDays: 30,
    enableAddressAutoCleanup: false,
    cleanAddressDays: 30,
    enableInactiveAddressAutoCleanup: false,
    cleanInactiveAddressDays: 30,
    enableEmptyAddressAutoCleanup: false,
    cleanEmptyAddressDays: 30,
    // 定时任务调度（网页可配）
    enableRawMailsAutoCleanup: true,
    cleanRawMailsMinutes: 10,
    rawMailsIntervalMinutes: 10,
    autoCleanupIntervalMinutes: 60,
    customSqlCleanupList: []
})
const scheduledStatus = ref({ rawMails: null, autoCleanup: null })

const { t } = useScopedI18n('views.admin.Maintenance')

const cleanup = async (cleanType, cleanDays) => {
    dialog.warning({
        title: t('confirmTitle'),
        content: t('confirmCleanup'),
        positiveText: t('positiveText'),
        negativeText: t('negativeText'),
        onPositiveClick: async () => {
            try {
                await api.fetch('/admin/cleanup', {
                    method: 'POST',
                    body: JSON.stringify({ cleanType, cleanDays })
                });
                message.success(t('cleanupSuccess'));
            } catch (error) {
                message.error(error.message || "error");
            }
        }
    })
}

const addCustomSql = () => {
    if (!cleanupModel.value.customSqlCleanupList) {
        cleanupModel.value.customSqlCleanupList = [];
    }
    cleanupModel.value.customSqlCleanupList.push({
        id: Date.now().toString(),
        name: '',
        sql: '',
        enabled: false
    });
}

const removeCustomSql = (index) => {
    cleanupModel.value.customSqlCleanupList.splice(index, 1);
}

const fetchScheduledStatus = async () => {
    try {
        const res = await api.fetch('/admin/scheduled_status');
        if (res) scheduledStatus.value = res;
    } catch (error) {
        // 状态查询失败不影响配置页
    }
}

const formatLastRun = (info) => {
    if (!info || !info.at) return t('neverRun');
    const d = formatLocalDateTime(new Date(info.at));
    return info.affected != null ? `${d} (${t('rawMailsDeleted')} ${info.affected} ${t('rows')})` : d;
}

const cleanupRawMailsNow = async () => {
    dialog.warning({
        title: t('confirmTitle'),
        content: t('confirmCleanup'),
        positiveText: t('positiveText'),
        negativeText: t('negativeText'),
        onPositiveClick: async () => {
            try {
                const res = await api.fetch('/admin/cleanup_raw_mails', {
                    method: 'POST',
                    body: JSON.stringify({ minutes: cleanupModel.value.cleanRawMailsMinutes })
                });
                message.success(`${t('cleanupSuccess')} (${t('rawMailsDeleted')} ${res?.deleted ?? 0} ${t('rows')})`);
                await fetchScheduledStatus();
            } catch (error) {
                message.error(error.message || "error");
            }
        }
    })
}

const fetchData = async () => {
    try {
        const res = await api.fetch('/admin/auto_cleanup');
        if (res) Object.assign(cleanupModel.value, res);
        if (!cleanupModel.value.customSqlCleanupList) {
            cleanupModel.value.customSqlCleanupList = [];
        }
        // 兼容旧配置：缺失的新字段补默认值
        const defaults = {
            enableRawMailsAutoCleanup: true,
            cleanRawMailsMinutes: 10,
            rawMailsIntervalMinutes: 10,
            autoCleanupIntervalMinutes: 60,
        };
        for (const [k, v] of Object.entries(defaults)) {
            if (cleanupModel.value[k] === undefined || cleanupModel.value[k] === null) {
                cleanupModel.value[k] = v;
            }
        }
    } catch (error) {
        message.error(error.message || "error");
    }
    await fetchScheduledStatus();
}

const save = async () => {
    try {
        await api.fetch('/admin/auto_cleanup', {
            method: 'POST',
            body: JSON.stringify(cleanupModel.value)
        });
        message.success(t('saveSuccess'));
    } catch (error) {
        message.error(error.message || "error");
    }
}

onMounted(async () => {
    await fetchData();
})
</script>


<template>
    <div class="center">
        <n-card :bordered="false" embedded>
            <n-alert :show-icon="false" :bordered="false" type="warning">
                <span>{{ t('cronTip') }}</span>
            </n-alert>
            <n-flex justify="end">
                <n-button @click="save" type="primary" :loading="loading">
                    {{ t('save') }}
                </n-button>
            </n-flex>
            <n-tabs type="segment" style="margin-top: 16px;">
                <n-tab-pane name="scheduled" :tab="t('scheduleTab')">
                    <n-alert :show-icon="false" :bordered="false" type="info" style="margin-bottom: 16px;">
                        <span>{{ t('scheduledTip') }}</span>
                    </n-alert>
                    <n-form :model="cleanupModel">
                        <n-form-item-row :label="t('rawMailsEnableLabel')">
                            <n-checkbox v-model:checked="cleanupModel.enableRawMailsAutoCleanup">
                                {{ t('autoCleanup') }}
                            </n-checkbox>
                        </n-form-item-row>
                        <div class="task-desc">{{ t('rawMailsDesc') }}</div>
                        <n-form-item-row :label="t('rawMailsIntervalLabel')">
                            <n-input-number v-model:value="cleanupModel.rawMailsIntervalMinutes" :min="1" :placeholder="t('tip')" />
                        </n-form-item-row>
                        <n-form-item-row :label="t('rawMailsOlderThanLabel')">
                            <n-input-number v-model:value="cleanupModel.cleanRawMailsMinutes" :min="1" :placeholder="t('tip')" />
                            <n-button @click="cleanupRawMailsNow">
                                <template #icon>
                                    <n-icon :component="CleaningServicesFilled" />
                                </template>
                                {{ t('cleanupNow') }}
                            </n-button>
                        </n-form-item-row>
                        <n-form-item-row :label="t('lastRun')">
                            <span>{{ formatLastRun(scheduledStatus.rawMails) }}</span>
                        </n-form-item-row>
                        <n-divider />
                        <n-form-item-row :label="t('autoCleanupIntervalLabel')">
                            <n-input-number v-model:value="cleanupModel.autoCleanupIntervalMinutes" :min="1" :placeholder="t('tip')" />
                        </n-form-item-row>
                        <div class="task-desc">{{ t('autoCleanupDesc') }}</div>
                        <n-form-item-row :label="t('lastRun')">
                            <span>{{ formatLastRun(scheduledStatus.autoCleanup) }}</span>
                        </n-form-item-row>
                    </n-form>
                </n-tab-pane>
                <n-tab-pane name="basic" :tab="t('basicCleanup')">
                    <n-form :model="cleanupModel">
                        <n-form-item-row :label="t('mailBoxLabel')">
                            <n-checkbox v-model:checked="cleanupModel.enableMailsAutoCleanup">
                                {{ t('autoCleanup') }}
                            </n-checkbox>
                            <n-input-number v-model:value="cleanupModel.cleanMailsDays" :min="1" :placeholder="t('tip')" />
                            <n-button @click="cleanup('mails', cleanupModel.cleanMailsDays)">
                                <template #icon>
                                    <n-icon :component="CleaningServicesFilled" />
                                </template>
                                {{ t('cleanupNow') }}
                            </n-button>
                        </n-form-item-row>
                        <n-form-item-row :label="t('mailUnknowLabel')">
                            <n-checkbox v-model:checked="cleanupModel.enableUnknowMailsAutoCleanup">
                                {{ t('autoCleanup') }}
                            </n-checkbox>
                            <n-input-number v-model:value="cleanupModel.cleanUnknowMailsDays" :min="1" :placeholder="t('tip')" />
                            <n-button @click="cleanup('mails_unknow', cleanupModel.cleanUnknowMailsDays)">
                                <template #icon>
                                    <n-icon :component="CleaningServicesFilled" />
                                </template>
                                {{ t('cleanupNow') }}
                            </n-button>
                        </n-form-item-row>
                        <n-form-item-row :label="t('sendBoxLabel')">
                            <n-checkbox v-model:checked="cleanupModel.enableSendBoxAutoCleanup">
                                {{ t('autoCleanup') }}
                            </n-checkbox>
                            <n-input-number v-model:value="cleanupModel.cleanSendBoxDays" :min="1" :placeholder="t('tip')" />
                            <n-button @click="cleanup('sendbox', cleanupModel.cleanSendBoxDays)">
                                <template #icon>
                                    <n-icon :component="CleaningServicesFilled" />
                                </template>
                                {{ t('cleanupNow') }}
                            </n-button>
                        </n-form-item-row>
                        <n-form-item-row :label="t('addressCreateLabel')">
                            <n-checkbox v-model:checked="cleanupModel.enableAddressAutoCleanup">
                                {{ t('autoCleanup') }}
                            </n-checkbox>
                            <n-input-number v-model:value="cleanupModel.cleanAddressDays" :min="1" :placeholder="t('tip')" />
                            <n-button @click="cleanup('addressCreated', cleanupModel.cleanAddressDays)">
                                <template #icon>
                                    <n-icon :component="CleaningServicesFilled" />
                                </template>
                                {{ t('cleanupNow') }}
                            </n-button>
                        </n-form-item-row>
                        <n-form-item-row :label="t('inactiveAddressLabel')">
                            <n-checkbox v-model:checked="cleanupModel.enableInactiveAddressAutoCleanup">
                                {{ t('autoCleanup') }}
                            </n-checkbox>
                            <n-input-number v-model:value="cleanupModel.cleanInactiveAddressDays" :min="1" :placeholder="t('tip')" />
                            <n-button @click="cleanup('inactiveAddress', cleanupModel.cleanInactiveAddressDays)">
                                <template #icon>
                                    <n-icon :component="CleaningServicesFilled" />
                                </template>
                                {{ t('cleanupNow') }}
                            </n-button>
                        </n-form-item-row>
                        <n-form-item-row :label="t('emptyAddressLabel')">
                            <n-checkbox v-model:checked="cleanupModel.enableEmptyAddressAutoCleanup">
                                {{ t('autoCleanup') }}
                            </n-checkbox>
                            <n-input-number v-model:value="cleanupModel.cleanEmptyAddressDays" :min="1" :placeholder="t('tip')" />
                            <n-button @click="cleanup('emptyAddress', cleanupModel.cleanEmptyAddressDays)">
                                <template #icon>
                                    <n-icon :component="CleaningServicesFilled" />
                                </template>
                                {{ t('cleanupNow') }}
                            </n-button>
                        </n-form-item-row>
                    </n-form>
                </n-tab-pane>
                <n-tab-pane name="custom_sql" :tab="t('customSqlCleanup')">
                    <n-alert :show-icon="false" :bordered="false" type="info" style="margin-bottom: 16px;">
                        <span>{{ t('customSqlTip') }}</span>
                    </n-alert>
                    <n-space vertical>
                        <n-card v-for="(item, index) in cleanupModel.customSqlCleanupList" :key="item.id" size="small">
                            <n-space vertical>
                                <n-space align="center">
                                    <n-checkbox v-model:checked="item.enabled">
                                        {{ t('autoCleanup') }}
                                    </n-checkbox>
                                    <n-input v-model:value="item.name" :placeholder="t('sqlNamePlaceholder')" style="width: 200px;" />
                                    <n-button @click="removeCustomSql(index)" type="error" quaternary>
                                        <template #icon>
                                            <n-icon :component="DeleteFilled" />
                                        </template>
                                        {{ t('deleteCustomSql') }}
                                    </n-button>
                                </n-space>
                                <n-input
                                    v-model:value="item.sql"
                                    type="textarea"
                                    :placeholder="t('sqlPlaceholder')"
                                    :autosize="{ minRows: 2 }"
                                    class="sql-input"
                                />
                            </n-space>
                        </n-card>
                        <n-button @click="addCustomSql">
                            <template #icon>
                                <n-icon :component="AddFilled" />
                            </template>
                            {{ t('addCustomSql') }}
                        </n-button>
                    </n-space>
                </n-tab-pane>
            </n-tabs>
        </n-card>
    </div>
</template>

<style scoped>
.n-card {
    max-width: 800px;
}

.center {
    display: flex;
    text-align: center;
    place-items: center;
    justify-content: center;
}

.n-alert {
    margin-bottom: 20px;
}

.sql-input {
    text-align: left;
}

.task-desc {
    text-align: left;
    color: #909399;
    font-size: 13px;
    line-height: 1.7;
    margin: -4px 0 14px 0;
}
</style>
