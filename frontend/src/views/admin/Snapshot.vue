<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useScopedI18n } from '@/i18n/app'
import { useMessage, useDialog } from 'naive-ui'
import { formatLocalDateTime } from '../../utils'
// @ts-ignore
import { api } from '../../api'

const message = useMessage()
const dialog = useDialog()
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
const batchInput = ref('')
const batchBinding = ref(false)

// 允许绑定的域名：从后端 /admin/notify/snapshot 取，唯一来源是 Worker 配置的 DOMAINS
const allowedDomains = ref<string[]>([]);

// 检查域名是否在允许列表中（支持子域名，如 ciaooo55.looo.cloud 匹配 looo.cloud）
const isDomainAllowed = (domain: string): boolean => {
    const d = domain.toLowerCase();
    return allowedDomains.value.some(allowed => d === allowed || d.endsWith('.' + allowed));
};

const fetchAll = async () => {
    try {
        const s = await api.fetch(`/admin/notify/snapshot`)
        ttlHours.value = s.ttlHours || 24
        allowedDomains.value = Array.isArray(s.allowedDomains) ? s.allowedDomains : []
        const b = await api.fetch(`/admin/notify/snapshot_bindings`)
        // Defensive: if the API ever returns non-array (null/error shape),
        // keep [] so the template's `bindings.length` never throws (blank tab).
        bindings.value = Array.isArray(b) ? b : []
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

const fmtTime = (ts: number) => formatLocalDateTime(new Date(ts))
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
            // Optimistic update: KV.list is eventually consistent, so add the new
            // binding directly instead of waiting for fetchAll to see it
            const b = res.binding;
            const idx = bindings.value.findIndex(x => x.address.toLowerCase() === b.address?.toLowerCase());
            if (idx >= 0) {
                bindings.value[idx] = b;
            } else {
                bindings.value.unshift(b);
            }
        } else {
            message.error(res.error || "error");
        }
    } catch (error) {
        message.error((error as Error).message || "error");
    }
}

const invalidate = async (b: Binding) => {
    dialog.warning({
        title: t('confirmTitle'),
        content: t('confirmInvalidate'),
        positiveText: t('positiveText'),
        negativeText: t('negativeText'),
        onPositiveClick: async () => {
            try {
                await api.fetch(`/admin/notify/snapshot_bindings/${encodeURIComponent(b.address)}`, { method: 'DELETE' })
                message.success(t('successTip'))
                // Optimistic update: remove from list immediately (KV.list is eventually consistent)
                const idx = bindings.value.findIndex(x => x.address.toLowerCase() === b.address?.toLowerCase());
                if (idx >= 0) {
                    bindings.value.splice(idx, 1);
                }
            } catch (error) {
                message.error((error as Error).message || "error");
            }
        }
    })
}

const copyUrl = async (url: string) => {
    try {
        await navigator.clipboard.writeText(url)
        message.success(t('copied'))
    } catch {
        message.warning(url)
    }
}

// 批量绑定：每行一个邮箱
const batchBind = async () => {
    const lines = batchInput.value.split('\n').map(s => s.trim().toLowerCase()).filter(Boolean);
    if (!lines.length) {
        message.warning(t('enterAddressFirst'));
        return;
    }
    // 去重
    const unique = [...new Set(lines)];
    // 简单验证格式和域名
    const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const valid: string[] = [];
    const invalid: string[] = [];
    const boundSet = new Set(bindings.value.map(b => b.address?.toLowerCase()));
    for (const addr of unique) {
        if (!emailRe.test(addr)) {
            invalid.push(t('invalidFormat', { addr }));
        } else if (!isDomainAllowed(addr.split('@')[1])) {
            invalid.push(t('invalidDomain', { addr }));
        } else if (boundSet.has(addr)) {
            invalid.push(t('alreadyBound', { addr }));
        } else {
            valid.push(addr);
        }
    }
    if (invalid.length) {
        message.warning(t('skippedAddresses') + '\n' + invalid.join('\n'));
    }
    if (!valid.length) return;
    batchBinding.value = true;
    let success = 0;
    const failedList: string[] = [];
    const newBindings: Binding[] = [];
    for (const addr of valid) {
        try {
            const res = await api.fetch(`/admin/notify/snapshot_bindings`, {
                method: 'POST',
                body: JSON.stringify({ address: addr, durationHours: newDuration.value }),
            });
            if (res.binding) {
                success++;
                newBindings.push(res.binding);
            } else {
                failedList.push(`${addr} (${res.error || t('unknownError')})`);
            }
        } catch (e) {
            const msg = (e as Error).message || t('requestFailed');
            // 提取后端返回的错误信息
            const match = msg.match(/\[400\]:\s*(.+)/);
            const errMsg = match ? match[1] : msg;
            failedList.push(`${addr} (${errMsg})`);
        }
    }
    batchBinding.value = false;
    if (failedList.length) {
        message.error(t('batchDoneWithFailed', { success, failed: failedList.length }) + '\n' + failedList.join('\n'), { duration: 8000 });
    } else {
        message.success(t('batchDone', { success }));
    }
    if (success > 0) {
        batchInput.value = '';
        // Optimistic update: KV.list is eventually consistent, add new bindings directly
        for (const b of newBindings) {
            const idx = bindings.value.findIndex(x => x.address.toLowerCase() === b.address?.toLowerCase());
            if (idx >= 0) {
                bindings.value[idx] = b;
            } else {
                bindings.value.unshift(b);
            }
        }
    }
}

// 更换链接：直接重新创建绑定，后端会自动让旧链接失效（原子操作）
const replaceBinding = async (b: Binding) => {
    dialog.warning({
        title: t('confirmTitle'),
        content: t('confirmReplace'),
        positiveText: t('positiveText'),
        negativeText: t('negativeText'),
        onPositiveClick: async () => {
            try {
                const res = await api.fetch(`/admin/notify/snapshot_bindings`, {
                    method: 'POST',
                    body: JSON.stringify({ address: b.address, durationHours: newDuration.value }),
                });
                if (res.binding) {
                    message.success(t('linkReplaced'));
                    // Optimistic update: replace the binding in place
                    const idx = bindings.value.findIndex(x => x.address.toLowerCase() === b.address?.toLowerCase());
                    if (idx >= 0) {
                        bindings.value[idx] = res.binding;
                    } else {
                        bindings.value.unshift(res.binding);
                    }
                } else {
                    message.error(res.error || "error");
                }
            } catch (error) {
                message.error((error as Error).message || "error");
            }
        }
    })
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
            <div style="overflow-x: auto;">
            <n-table :bordered="false" style="margin-top: 8px; min-width: 720px;">
                <thead>
                    <tr>
                        <th style="white-space: nowrap;">{{ t('address') }}</th>
                        <th>{{ t('snapshotUrl') }}</th>
                        <th style="white-space: nowrap;">{{ t('expiresAt') }}</th>
                        <th style="white-space: nowrap;">{{ t('actions') }}</th>
                    </tr>
                </thead>
                <tbody>
                    <tr v-for="b in bindings" :key="b.address">
                        <td style="white-space: nowrap;">{{ b.address }}</td>
                        <td>
                            <a :href="b.url" target="_blank" style="font-size: 12px; word-break: break-all;">{{ b.url }}</a>
                            <div><n-text depth="3" style="font-size: 12px;">{{ t('createdAt') }}: {{ fmtTime(b.createdAt) }}</n-text></div>
                        </td>
                        <td style="white-space: nowrap;">
                            <div>{{ fmtTime(b.expiresAt) }}</div>
                            <div><n-text depth="3" style="font-size: 12px;">{{ remainText(b.expiresAt) }}</n-text></div>
                        </td>
                        <td>
                            <n-flex vertical>
                                <n-button size="small" @click="copyUrl(b.url)">{{ t('copy') }}</n-button>
                                <n-button size="small" @click="replaceBinding(b)">{{ t('replaceLink') }}
</n-button>
                                <n-button size="small" type="error" ghost @click="invalidate(b)">{{ t('invalidate') }}</n-button>
                            </n-flex>
                        </td>
                    </tr>
                    <tr v-if="!bindings.length">
                        <td colspan="4"><n-text depth="3">{{ t('noBindings') }}</n-text></td>
                    </tr>
                </tbody>
            </n-table>
            </div>
            <n-flex style="margin-top: 12px;" align="center">
                <n-input v-model:value="newAddress" :placeholder="t('addressPlaceholder')" style="width: 260px;" />
                <n-select v-model:value="newDuration" :options="quickDurations" style="width: 160px;" />
                <n-input-number v-model:value="newDuration" :min="1" :max="8760" :placeholder="t('durationPlaceholder')"
                    style="width: 140px;" />
                <n-button type="primary" @click="addBinding">{{ t('bind') }}</n-button>
            </n-flex>
            <n-text depth="3" style="font-size: 12px; margin-top: 8px; display: block;">{{ t('durationTip') }}</n-text>

            <n-divider>{{ t('batchBind') }}
</n-divider>
            <n-text depth="3" style="font-size: 12px;">{{ t('batchBindTip') }}</n-text>
            <n-input v-model:value="batchInput" type="textarea" :rows="5"
                :placeholder="t('batchPlaceholder')"
                style="margin-top: 8px; font-family: monospace;" />
            <n-flex style="margin-top: 8px;" align="center">
                <n-button type="primary" :loading="batchBinding" @click="batchBind">{{ t('batchBind') }}
</n-button>
                <n-button @click="batchInput = ''">{{ t('clear') }}
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
}
</style>
