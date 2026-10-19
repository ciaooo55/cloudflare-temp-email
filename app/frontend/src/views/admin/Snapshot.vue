<script setup lang="ts">
import { computed, h, onMounted, ref, watch } from 'vue'
import { useScopedI18n } from '@/i18n/app'
import { NButton, NSpace, NTag, useMessage, useDialog } from 'naive-ui'
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
// 绑定快照边缘缓存：开关默认关闭（实时），时间挡位 10秒/30秒/1分钟/5分钟
const boundCacheEnabled = ref(false)
const boundCacheTtl = ref(10)
const boundCachePresets = ref<number[]>([10, 30, 60, 300])
const boundCacheTtlOptions = computed(() =>
    boundCachePresets.value.map(v => ({
        label: v < 60 ? `${v} ${t('seconds')}` : `${v / 60} ${t('minutes')}`,
        value: v,
    }))
)
const bindings = ref<Binding[]>([])
const newAddress = ref('')
const batchInput = ref('')
const batchBinding = ref(false)

// 有效期选择器：预设（含永久）+ 自定义小时数
function useDurationPicker(defaultValue = 168) {
    const preset = ref<number | 'custom'>(defaultValue)
    const custom = ref<number | null>(null)
    const value = computed(() =>
        preset.value === 'custom' ? (custom.value || defaultValue) : (preset.value as number)
    )
    return { preset, custom, value }
}
const newDur = useDurationPicker(168)
const batchDur = useDurationPicker(168)
// 批量操作栏的有效期：预设即可
const batchOpDuration = ref(168)
const batchOpLoading = ref(false)

// 永久有效哨兵：与后端 SNAPSHOT_BINDING_PERMANENT_MS 对应
const PERMANENT_MS = 4102444800000
const isPermanent = (expiresAt: number) => expiresAt >= PERMANENT_MS

// 表格：搜索 + 多选（n-data-table 内置跨页多选）+ 分页
const searchKw = ref('')
const checkedRowKeys = ref<string[]>([])
const tablePage = ref(1)
const filteredBindings = computed(() => {
    const kw = searchKw.value.trim().toLowerCase()
    if (!kw) return bindings.value
    return bindings.value.filter(b => b.address.toLowerCase().includes(kw))
})
watch(searchKw, () => { tablePage.value = 1 })
// 绑定列表变化时清理已不存在的选中项
const pruneChecked = () => {
    const set = new Set(bindings.value.map(b => b.address))
    checkedRowKeys.value = checkedRowKeys.value.filter(a => set.has(a))
}

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
        boundCacheEnabled.value = s.boundCacheEnabled === true
        boundCacheTtl.value = s.boundCacheTtl || 10
        if (Array.isArray(s.boundCacheTtlPresets) && s.boundCacheTtlPresets.length) {
            boundCachePresets.value = s.boundCacheTtlPresets
        }
        allowedDomains.value = Array.isArray(s.allowedDomains) ? s.allowedDomains : []
        const b = await api.fetch(`/admin/notify/snapshot_bindings`)
        // Defensive: if the API ever returns non-array (null/error shape),
        // keep [] so the template never throws (blank tab).
        bindings.value = Array.isArray(b) ? b : []
        pruneChecked()
    } catch (error) {
        message.error((error as Error).message || "error");
    }
}

const saveSettings = async () => {
    try {
        await api.fetch(`/admin/notify/snapshot`, {
            method: 'POST',
            body: JSON.stringify({
                ttlHours: ttlHours.value,
                boundCacheEnabled: boundCacheEnabled.value,
                boundCacheTtl: boundCacheTtl.value,
            }),
        })
        message.success(t('successTip'))
    } catch (error) {
        message.error((error as Error).message || "error");
    }
}

const fmtTime = (ts: number) => formatLocalDateTime(new Date(ts))

// 到期状态徽章
const expiryTag = (row: Binding) => {
    if (isPermanent(row.expiresAt)) {
        return h(NTag, { size: 'small', type: 'success', bordered: false }, { default: () => t('permanent') })
    }
    const ms = row.expiresAt - Date.now()
    if (ms <= 0) {
        return h(NTag, { size: 'small', type: 'error', bordered: false }, { default: () => t('expired') })
    }
    const h_ = Math.floor(ms / 3600000)
    if (h_ < 24) {
        return h(NTag, { size: 'small', type: 'warning', bordered: false }, { default: () => t('remainHours', { h: h_ }) })
    }
    return h('span', { style: 'font-size: 12px; opacity: 0.6;' },
        t('remainDays', { d: Math.floor(h_ / 24) }))
}

const columns = computed(() => [
    { type: 'selection' as const },
    {
        title: t('address'),
        key: 'address',
        ellipsis: { tooltip: true },
        minWidth: 180,
    },
    {
        title: t('snapshotUrl'),
        key: 'url',
        minWidth: 220,
        render: (row: Binding) =>
            h('a', { href: row.url, target: '_blank', style: 'font-size: 12px; word-break: break-all;' }, row.url),
    },
    {
        title: t('expiresAt'),
        key: 'expiresAt',
        width: 170,
        render: (row: Binding) =>
            h(NSpace, { vertical: true, size: 2 }, {
                default: () => [
                    isPermanent(row.expiresAt)
                        ? h('span', { style: 'font-size: 13px;' }, '—')
                        : h('span', { style: 'font-size: 13px;' }, fmtTime(row.expiresAt)),
                    expiryTag(row),
                ],
            }),
    },
    {
        title: t('actions'),
        key: 'actions',
        width: 210,
        render: (row: Binding) =>
            h(NSpace, { size: 4 }, {
                default: () => [
                    h(NButton, { size: 'small', text: true, type: 'primary', onClick: () => copyBindingInfo(row) },
                        { default: () => t('copyInfo') }),
                    h(NButton, { size: 'small', text: true, type: 'primary', onClick: () => replaceBinding(row) },
                        { default: () => t('replaceLink') }),
                    h(NButton, { size: 'small', text: true, type: 'error', onClick: () => invalidate(row) },
                        { default: () => t('invalidate') }),
                ],
            }),
    },
])

// 选中行的完整绑定对象（保持列表顺序）
const selectedBindings = computed(() => {
    const set = new Set(checkedRowKeys.value)
    return bindings.value.filter(b => set.has(b.address))
})

const upsertBinding = (b: Binding) => {
    const idx = bindings.value.findIndex(x => x.address.toLowerCase() === b.address?.toLowerCase())
    if (idx >= 0) {
        bindings.value[idx] = b
    } else {
        bindings.value.unshift(b)
    }
}

const addBinding = async () => {
    if (!newAddress.value.trim()) {
        message.warning(t('addressPlaceholder'));
        return;
    }
    try {
        const res = await api.fetch(`/admin/notify/snapshot_bindings`, {
            method: 'POST',
            body: JSON.stringify({ address: newAddress.value, durationHours: newDur.value.value }),
        })
        if (res.binding) {
            message.success(t('successTip'))
            newAddress.value = '';
            // Optimistic update: KV.list is eventually consistent, so add the new
            // binding directly instead of waiting for fetchAll to see it
            upsertBinding(res.binding);
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
                const idx = bindings.value.findIndex(x => x.address.toLowerCase() === b.address.toLowerCase());
                if (idx >= 0) {
                    bindings.value.splice(idx, 1);
                    pruneChecked();
                }
            } catch (error) {
                message.error((error as Error).message || "error");
            }
        }
    })
}

const copyText = async (text: string) => {
    try {
        await navigator.clipboard.writeText(text)
        message.success(t('copied'))
    } catch {
        message.warning(text)
    }
}
const copyUrl = async (url: string) => copyText(url)

// 复制用的有效期格式：2026年10月5日14时30分，永久绑定显示“永久有效”
const formatCopyDate = (ts: number): string => {
    if (isPermanent(ts)) return t('permanent')
    const d = new Date(ts)
    const p = (n: number) => String(n).padStart(2, '0')
    return `${d.getFullYear()}年${p(d.getMonth() + 1)}月${p(d.getDate())}日${p(d.getHours())}时${p(d.getMinutes())}分`
}

const bindingCopyText = (b: Binding): string =>
    `邮箱：${b.address} 查看邮件：${b.url} 有效期：${formatCopyDate(b.expiresAt)}`

// 单个邮箱复制信息
const copyBindingInfo = (b: Binding) => copyText(bindingCopyText(b))

// 复制选中的绑定信息
const copySelected = () => {
    if (!selectedBindings.value.length) return
    copyText(selectedBindings.value.map(bindingCopyText).join('\n'))
}

// 一键复制全部绑定信息
const copyAll = () => {
    if (!bindings.value.length) return
    copyText(bindings.value.map(bindingCopyText).join('\n'))
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
                body: JSON.stringify({ address: addr, durationHours: batchDur.value.value }),
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
        for (const b of newBindings) upsertBinding(b);
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
                    body: JSON.stringify({ address: b.address, durationHours: newDur.value.value }),
                });
                if (res.binding) {
                    message.success(t('linkReplaced'));
                    // Optimistic update: replace the binding in place
                    upsertBinding(res.binding);
                } else {
                    message.error(res.error || "error");
                }
            } catch (error) {
                message.error((error as Error).message || "error");
            }
        }
    })
}

// 批量删除选中绑定
const batchDelete = async () => {
    const addrs = [...checkedRowKeys.value]
    if (!addrs.length) return
    dialog.warning({
        title: t('confirmTitle'),
        content: t('confirmBatchDelete', { n: addrs.length }),
        positiveText: t('positiveText'),
        negativeText: t('negativeText'),
        onPositiveClick: async () => {
            batchOpLoading.value = true
            try {
                const res = await api.fetch(`/admin/notify/snapshot_bindings/batch_delete`, {
                    method: 'POST',
                    body: JSON.stringify({ addresses: addrs }),
                })
                const failed = res.failed || []
                if (failed.length) {
                    message.error(t('batchOpDone', { success: res.deleted || 0, failed: failed.length }) + '\n' + failed.join('\n'), { duration: 8000 })
                } else {
                    message.success(t('batchOpDone', { success: res.deleted || 0, failed: 0 }))
                }
                // 乐观更新：从列表移除
                const delSet = new Set(addrs.map(a => a.toLowerCase()))
                bindings.value = bindings.value.filter(b => !delSet.has(b.address.toLowerCase()))
                checkedRowKeys.value = []
            } catch (error) {
                message.error((error as Error).message || "error")
            } finally {
                batchOpLoading.value = false
            }
        }
    })
}

// 批量调整有效期：只改到期时间，不换链接
const batchExtend = async () => {
    const addrs = [...checkedRowKeys.value]
    if (!addrs.length) return
    dialog.warning({
        title: t('confirmTitle'),
        content: t('confirmBatchExtend', { n: addrs.length, duration: durationLabel(batchOpDuration.value) }),
        positiveText: t('positiveText'),
        negativeText: t('negativeText'),
        onPositiveClick: async () => {
            batchOpLoading.value = true
            try {
                const res = await api.fetch(`/admin/notify/snapshot_bindings/batch_extend`, {
                    method: 'POST',
                    body: JSON.stringify({ addresses: addrs, durationHours: batchOpDuration.value }),
                })
                const failed = res.failed || []
                if (failed.length) {
                    message.error(t('batchOpDone', { success: res.updated || 0, failed: failed.length }) + '\n' + failed.join('\n'), { duration: 8000 })
                } else {
                    message.success(t('batchOpDone', { success: res.updated || 0, failed: 0 }))
                }
                // 乐观更新：用返回的新绑定替换
                for (const b of (res.bindings || [])) upsertBinding(b);
                checkedRowKeys.value = []
            } catch (error) {
                message.error((error as Error).message || "error")
            } finally {
                batchOpLoading.value = false
            }
        }
    })
}

// 批量更换链接：生成新 token，旧链接立即失效
const batchReplace = async () => {
    const addrs = [...checkedRowKeys.value]
    if (!addrs.length) return
    dialog.warning({
        title: t('confirmTitle'),
        content: t('confirmBatchReplace', { n: addrs.length }),
        positiveText: t('positiveText'),
        negativeText: t('negativeText'),
        onPositiveClick: async () => {
            batchOpLoading.value = true
            try {
                const res = await api.fetch(`/admin/notify/snapshot_bindings/batch_replace`, {
                    method: 'POST',
                    body: JSON.stringify({ addresses: addrs, durationHours: batchOpDuration.value }),
                })
                const failed = res.failed || []
                if (failed.length) {
                    message.error(t('batchOpDone', { success: res.replaced || 0, failed: failed.length }) + '\n' + failed.join('\n'), { duration: 8000 })
                } else {
                    message.success(t('batchOpDone', { success: res.replaced || 0, failed: 0 }))
                }
                for (const b of (res.bindings || [])) upsertBinding(b);
                checkedRowKeys.value = []
            } catch (error) {
                message.error((error as Error).message || "error")
            } finally {
                batchOpLoading.value = false
            }
        }
    })
}

const quickDurations = computed(() => [
    { label: `24 ${t('hours')}`, value: 24 },
    { label: `7 ${t('days')}`, value: 168 },
    { label: `30 ${t('days')}`, value: 720 },
    { label: `365 ${t('days')}`, value: 8760 },
    { label: t('permanent'), value: 0 },
])

// 有效期下拉选项：预设 + 自定义
const durationOptions = computed(() => [
    ...quickDurations.value,
    { label: t('custom'), value: 'custom' as const },
])

const durationLabel = (v: number) => {
    const opt = quickDurations.value.find(o => o.value === v)
    return opt ? opt.label : `${v} ${t('hours')}`
}

onMounted(fetchAll)
</script>

<template>
    <div class="center">
        <n-card :bordered="false" embedded :title="t('title')" style="max-width: 980px; overflow: auto;">
            <n-form-item-row :label="t('ttlHours')">
                <n-input-group>
                    <n-input-number v-model:value="ttlHours" :min="1" :max="8760" style="width: 200px;" />
                    <n-button type="primary" @click="saveSettings">{{ t('save') }}</n-button>
                </n-input-group>
                <template #feedback>
                    <n-text depth="3" style="font-size: 12px;">{{ t('ttlTip') }}</n-text>
                </template>
            </n-form-item-row>

            <n-form-item-row :label="t('boundCache')">
                <n-flex align="center">
                    <n-switch v-model:value="boundCacheEnabled" />
                    <n-select v-model:value="boundCacheTtl" :options="boundCacheTtlOptions"
                        :disabled="!boundCacheEnabled" style="width: 140px;" />
                    <n-button type="primary" @click="saveSettings">{{ t('save') }}</n-button>
                </n-flex>
                <template #feedback>
                    <n-text depth="3" style="font-size: 12px;">{{ t('boundCacheTip') }}</n-text>
                </template>
            </n-form-item-row>

            <n-divider>{{ t('bindings') }}</n-divider>
            <n-text depth="3" style="font-size: 12px;">{{ t('bindingsTip') }}</n-text>

            <!-- 工具栏：搜索 + 复制全部 -->
            <n-flex justify="space-between" align="center" style="margin: 12px 0 8px;">
                <n-input v-model:value="searchKw" :placeholder="t('searchPlaceholder')" clearable style="width: 260px;" />
                <n-button v-if="bindings.length" size="small" @click="copyAll">{{ t('copyAll') }}</n-button>
            </n-flex>

            <n-data-table v-model:checked-row-keys="checkedRowKeys" v-model:page="tablePage" :columns="columns"
                :data="filteredBindings" :row-key="(row: Binding) => row.address"
                :pagination="{ pageSize: 10 }" :bordered="false" />

            <!-- 批量操作栏：常驻，未选中时禁用 -->
            <n-flex align="center" style="margin-top: 12px; padding: 10px 12px; background: rgba(127, 127, 127, 0.07); border-radius: 8px;">
                <n-tag type="info" :bordered="false">{{ t('selectedCount', { n: checkedRowKeys.length }) }}</n-tag>
                <n-select v-model:value="batchOpDuration" :options="quickDurations" style="width: 140px;"
                    :disabled="!checkedRowKeys.length" />
                <n-button size="small" :disabled="!checkedRowKeys.length" @click="copySelected">{{ t('copySelected') }}</n-button>
                <n-button size="small" :disabled="!checkedRowKeys.length" :loading="batchOpLoading" @click="batchExtend">{{ t('batchExtend') }}</n-button>
                <n-button size="small" :disabled="!checkedRowKeys.length" :loading="batchOpLoading" @click="batchReplace">{{ t('batchReplace') }}</n-button>
                <n-button size="small" type="error" ghost :disabled="!checkedRowKeys.length" :loading="batchOpLoading" @click="batchDelete">{{ t('batchDelete') }}</n-button>
            </n-flex>

            <n-divider>{{ t('addBinding') }}</n-divider>
            <n-form inline :show-feedback="false">
                <n-form-item :label="t('address')">
                    <n-input v-model:value="newAddress" :placeholder="t('addressPlaceholder')" style="width: 240px;" />
                </n-form-item>
                <n-form-item :label="t('duration')">
                    <n-flex align="center">
                        <n-select v-model:value="newDur.preset" :options="durationOptions" style="width: 150px;" />
                        <n-input-number v-if="newDur.preset === 'custom'" v-model:value="newDur.custom"
                            :min="1" :max="8760" :placeholder="t('durationPlaceholder')" style="width: 120px;" />
                    </n-flex>
                </n-form-item>
                <n-form-item>
                    <n-button type="primary" @click="addBinding">{{ t('bind') }}</n-button>
                </n-form-item>
            </n-form>
            <n-text depth="3" style="font-size: 12px; margin-top: 8px; display: block;">{{ t('durationTip') }}</n-text>

            <n-divider>{{ t('batchBind') }}</n-divider>
            <n-text depth="3" style="font-size: 12px;">{{ t('batchBindTip') }}</n-text>
            <n-input v-model:value="batchInput" type="textarea" :rows="5"
                :placeholder="t('batchPlaceholder')"
                style="margin-top: 8px; font-family: monospace;" />
            <n-flex style="margin-top: 8px;" align="center">
                <n-form-item :label="t('duration')" :show-feedback="false">
                    <n-flex align="center">
                        <n-select v-model:value="batchDur.preset" :options="durationOptions" style="width: 150px;" />
                        <n-input-number v-if="batchDur.preset === 'custom'" v-model:value="batchDur.custom"
                            :min="1" :max="8760" :placeholder="t('durationPlaceholder')" style="width: 120px;" />
                    </n-flex>
                </n-form-item>
                <n-button type="primary" :loading="batchBinding" @click="batchBind">{{ t('batchBind') }}</n-button>
                <n-button @click="batchInput = ''">{{ t('clear') }}</n-button>
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
