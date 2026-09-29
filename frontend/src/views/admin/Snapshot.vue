<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useScopedI18n } from '@/i18n/app'
import { useMessage } from 'naive-ui'
// @ts-ignore
import { api } from '../../api'

const message = useMessage()
const { t } = useScopedI18n('views.admin.Snapshot')

type Binding = {
    address: string;
    token: string;
    url: string;
    expiresAt: number;
    createdAt: number;
}

const ttlHours = ref(24)
const bindings = ref<Binding[]>([])
const newAddress = ref('')
const newDuration = ref(168)

const fetchAll = async () => {
    try {
        const s = await api.fetch(`/admin/notify/snapshot`)
        ttlHours.value = s.ttlHours || 24
        bindings.value = await api.fetch(`/admin/notify/snapshot_bindings`)
    } catch (error) {
        message.error((error as Error).message || "error");
    }
}

const saveTtl = async () => {
    try {
        await api.fetch(`/admin/notify/snapshot`, {
            method: 'POST',
            body: JSON.stringify({ ttlHours: ttlHours.value }),
        })
        message.success(t('successTip'))
    } catch (error) {
        message.error((error as Error).message || "error");
    }
}

const fmtTime = (ts: number) => new Date(ts).toLocaleString()
const remainText = (ts: number) => {
    const ms = ts - Date.now()
    if (ms <= 0) return t('expired')
    const h = Math.floor(ms / 3600000)
    if (h < 24) return t('remainHours', { h })
    return t('remainDays', { d: Math.floor(h / 24) })
}

const addBinding = async () => {
    if (!newAddress.value.trim()) {
        message.warning(t('addressPlaceholder'));
        return;
    }
    try {
        const res = await api.fetch(`/admin/notify/snapshot_bindings`, {
            method: 'POST',
            body: JSON.stringify({ address: newAddress.value, durationHours: newDuration.value }),
        })
        if (res.binding) {
            message.success(t('successTip'))
            newAddress.value = '';
            await fetchAll();
        } else {
            message.error(res.error || "error");
        }
    } catch (error) {
        message.error((error as Error).message || "error");
    }
}

const invalidate = async (b: Binding) => {
    if (!confirm(t('confirmInvalidate'))) return;
    try {
        await api.fetch(`/admin/notify/snapshot_bindings/${encodeURIComponent(b.address)}`, { method: 'DELETE' })
        message.success(t('successTip'))
        await fetchAll();
    } catch (error) {
        message.error((error as Error).message || "error");
    }
}

const copyUrl = async (url: string) => {
    try {
        await navigator.clipboard.writeText(url)
        message.success(t('copied'))
    } catch {
        message.warning(url)
    }
}

const quickDurations = computed(() => [
    { label: `24 ${t('hours')}`, value: 24 },
    { label: `7 ${t('days')}`, value: 168 },
    { label: `30 ${t('days')}`, value: 720 },
    { label: `365 ${t('days')}`, value: 8760 },
])

onMounted(fetchAll)
</script>

<template>
    <div class="center">
        <n-card :bordered="false" embedded :title="t('title')" style="max-width: 900px; overflow: auto;">
            <n-form-item-row :label="t('ttlHours')">
                <n-input-group>
                    <n-input-number v-model:value="ttlHours" :min="1" :max="8760" style="width: 200px;" />
                    <n-button type="primary" @click="saveTtl">{{ t('save') }}</n-button>
                </n-input-group>
                <template #feedback>
                    <n-text depth="3" style="font-size: 12px;">{{ t('ttlTip') }}</n-text>
                </template>
            </n-form-item-row>

            <n-divider>{{ t('bindings') }}</n-divider>
            <n-text depth="3" style="font-size: 12px;">{{ t('bindingsTip') }}</n-text>
            <n-table :bordered="false" style="margin-top: 8px;">
                <thead>
                    <tr>
                        <th>{{ t('address') }}</th>
                        <th>{{ t('snapshotUrl') }}</th>
                        <th>{{ t('expiresAt') }}</th>
                        <th>{{ t('actions') }}</th>
                    </tr>
                </thead>
                <tbody>
                    <tr v-for="b in bindings" :key="b.address">
                        <td>{{ b.address }}</td>
                        <td>
                            <a :href="b.url" target="_blank" style="font-size: 12px; word-break: break-all;">{{ b.url }}</a>
                            <div><n-text depth="3" style="font-size: 12px;">{{ t('createdAt') }}: {{ fmtTime(b.createdAt) }}</n-text></div>
                        </td>
                        <td>
                            <div>{{ fmtTime(b.expiresAt) }}</div>
                            <div><n-text depth="3" style="font-size: 12px;">{{ remainText(b.expiresAt) }}</n-text></div>
                        </td>
                        <td>
                            <n-flex vertical>
                                <n-button size="small" @click="copyUrl(b.url)">{{ t('copy') }}</n-button>
                                <n-button size="small" type="error" ghost @click="invalidate(b)">{{ t('invalidate') }}</n-button>
                            </n-flex>
                        </td>
                    </tr>
                    <tr v-if="!bindings.length">
                        <td colspan="4"><n-text depth="3">{{ t('noBindings') }}</n-text></td>
                    </tr>
                </tbody>
            </n-table>
            <n-flex style="margin-top: 12px;" align="center">
                <n-input v-model:value="newAddress" :placeholder="t('addressPlaceholder')" style="width: 260px;" />
                <n-select v-model:value="newDuration" :options="quickDurations" style="width: 160px;" />
                <n-input-number v-model:value="newDuration" :min="1" :max="8760" :placeholder="t('durationPlaceholder')"
                    style="width: 140px;" />
                <n-button type="primary" @click="addBinding">{{ t('bind') }}</n-button>
            </n-flex>
            <n-text depth="3" style="font-size: 12px; margin-top: 8px; display: block;">{{ t('durationTip') }}</n-text>
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
