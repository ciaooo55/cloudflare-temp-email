<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useScopedI18n } from '@/i18n/app'
import { useMessage, useDialog } from 'naive-ui'
// @ts-ignore
import { api } from '../../api'

const message = useMessage()
const dialog = useDialog()
const { t } = useScopedI18n('views.admin.Bark')

type DeviceItem = {
    id: string;
    name: string;
    enabled: boolean;
    maskedKeys: string;
    keysInput: string;
}

const pushUrl = ref('')
const devices = ref<DeviceItem[]>([])
const newName = ref('')
const newKeys = ref('')
const testResult = ref('')

const fetchData = async () => {
    try {
        const res = await api.fetch(`/admin/notify/bark`)
        pushUrl.value = res.pushUrl || ''
        devices.value = (res.devices || []).map((d: any) => ({ ...d, keysInput: '' }))
    } catch (error) {
        message.error((error as Error).message || "error");
    }
}

const saveAll = async () => {
    try {
        await api.fetch(`/admin/notify/bark`, {
            method: 'POST',
            body: JSON.stringify({
                pushUrl: pushUrl.value,
                devices: devices.value.map(d => ({
                    id: d.id, name: d.name, enabled: d.enabled, keys: d.keysInput,
                })),
            }),
        })
        message.success(t('successTip'))
        await fetchData();
    } catch (error) {
        message.error((error as Error).message || "error");
    }
}

const addDevice = async () => {
    if (!newKeys.value.trim()) {
        message.warning(t('keysPlaceholder'));
        return;
    }
    try {
        const current = devices.value.map(d => ({ id: d.id, name: d.name, enabled: d.enabled, keys: '' }));
        await api.fetch(`/admin/notify/bark`, {
            method: 'POST',
            body: JSON.stringify({
                pushUrl: pushUrl.value,
                devices: [...current, { name: newName.value, keys: newKeys.value, enabled: true }],
            }),
        })
        newName.value = '';
        newKeys.value = '';
        message.success(t('successTip'))
        await fetchData();
    } catch (error) {
        message.error((error as Error).message || "error");
    }
}

const deleteDevice = async (device: DeviceItem) => {
    dialog.warning({
        title: t('confirmTitle'),
        content: t('confirmDelete'),
        positiveText: t('positiveText'),
        negativeText: t('negativeText'),
        onPositiveClick: async () => {
            try {
                const rest = devices.value.filter(d => d.id !== device.id)
                    .map(d => ({ id: d.id, name: d.name, enabled: d.enabled, keys: '' }));
                await api.fetch(`/admin/notify/bark`, {
                    method: 'POST',
                    body: JSON.stringify({ pushUrl: pushUrl.value, devices: rest }),
                })
                message.success(t('successTip'))
                await fetchData();
            } catch (error) {
                message.error((error as Error).message || "error");
            }
        }
    })
}

const testingDeviceId = ref<string | null>(null);

const testDevice = async (device?: DeviceItem) => {
    const testingId = device ? device.id : '__all__';
    if (testingDeviceId.value) return;
    testingDeviceId.value = testingId;
    testResult.value = '';
    try {
        const res = await api.fetch(`/admin/notify/bark/test`, {
            method: 'POST',
            body: JSON.stringify(device ? { deviceId: device.id } : {}),
        })
        testResult.value = res.ok ? t('testOk') : `${t('testFail')}${res.error || ''}`;
        if (res.ok) {
            message.success(t('successTip'));
        } else {
            message.error(testResult.value);
        }
    } catch (error) {
        testResult.value = `${t('testFail')}${(error as Error).message || ''}`;
        message.error(testResult.value);
    } finally {
        testingDeviceId.value = null;
    }
}

onMounted(fetchData)
</script>

<template>
    <div class="center">
        <n-card :bordered="false" embedded :title="t('title')" style="max-width: 800px; overflow: auto;">
            <n-flex justify="end">
                <n-button @click="testDevice()" secondary :loading="testingDeviceId === '__all__'" :disabled="!!testingDeviceId">{{ t('testAll') }}</n-button>
                <n-button @click="saveAll" type="primary">{{ t('save') }}</n-button>
            </n-flex>
            <n-form-item-row :label="t('pushUrl')" style="margin-top: 12px;">
                <n-input v-model:value="pushUrl" :placeholder="t('pushUrlTip')" />
            </n-form-item-row>
            <n-table :bordered="false" style="margin-top: 8px;">
                <thead>
                    <tr>
                        <th>{{ t('deviceName') }}</th>
                        <th>{{ t('deviceKeys') }}</th>
                        <th>{{ t('enabled') }}</th>
                        <th>{{ t('actions') }}</th>
                    </tr>
                </thead>
                <tbody>
                    <tr v-for="d in devices" :key="d.id">
                        <td><n-input v-model:value="d.name" style="min-width: 120px;" /></td>
                        <td>
                            <n-text code style="font-size: 12px;">{{ d.maskedKeys }}</n-text>
                            <n-input v-model:value="d.keysInput" :placeholder="t('keysKeepTip')"
                                style="margin-top: 4px;" type="password" show-password-on="click" />
                        </td>
                        <td><n-switch v-model:value="d.enabled" :round="false" /></td>
                        <td>
                            <n-flex>
                                <n-button size="small" @click="testDevice(d)" :loading="testingDeviceId === d.id" :disabled="!!testingDeviceId">{{ t('test') }}</n-button>
                                <n-button v-if="!d.id.startsWith('env')" size="small" type="error" ghost @click="deleteDevice(d)">{{ t('delete') }}</n-button>
                            </n-flex>
                        </td>
                    </tr>
                    <tr v-if="!devices.length">
                        <td colspan="4"><n-text depth="3">{{ t('noDevices') }}</n-text></td>
                    </tr>
                </tbody>
            </n-table>
            <n-flex style="margin-top: 12px;">
                <n-input v-model:value="newName" :placeholder="t('namePlaceholder')" style="width: 200px;" />
                <n-input v-model:value="newKeys" :placeholder="t('keysPlaceholder')" style="flex: 1;" type="password"
                    show-password-on="click" />
                <n-button type="primary" @click="addDevice">{{ t('add') }}</n-button>
            </n-flex>
            <n-text v-if="testResult" depth="3" style="font-size: 12px; margin-top: 8px; display: block;">{{ testResult }}</n-text>
            <n-text depth="3" style="font-size: 12px; margin-top: 12px; display: block;">{{ t('tip') }}</n-text>
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
