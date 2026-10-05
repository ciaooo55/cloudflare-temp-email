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
const newDuration = ref(168)
const batchInput = ref('')
const batchBinding = ref(false)
// 批量绑定独立的有效期选择
const batchDuration = ref(168)
// 表格多选（跨页：存的是全部选中地址，不限当前页）
const checkedAddrs = ref<string[]>([])
// 分页：每页 10 个
const page = ref(1)
const pageSize = 10
const pagedBindings = computed(() => {
    const start = (page.value - 1) * pageSize
    return bindings.value.slice(start, start + pageSize)
})
const pageCount = computed(() => Math.max(1, Math.ceil(bindings.value.length / pageSize)))
// 批量操作栏的有效期选择（更换链接 / 调整有效期共用）
const batchOpDuration = ref(168)
const batchOpLoading = ref(false)

// 永久有效哨兵：与后端 SNAPSHOT_BINDING_PERMANENT_MS 对应
const PERMANENT_MS = 4102444800000
const isPermanent = (expiresAt: number) => expiresAt >= PERMANENT_MS

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
        // keep [] so the template's `bindings.length` never throws (blank tab).
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
const remainText = (ts: number) => {
    if (isPermanent(ts)) return t('permanent')
    const ms = ts - Date.now()
    if (ms <= 0) return t('expired')
    const h = Math.floor(ms / 3600000)
    if (h < 24) return t('remainHours', { h })
    return t('remainDays', { d: Math.floor(h / 24) })
}

// 多选：全选 / 半选状态
const allChecked = computed(() =>
    bindings.value.length > 0 && checkedAddrs.value.length === bindings.value.length
)
const indeterminate = computed(() =>
    checkedAddrs.value.length > 0 && checkedAddrs.value.length < bindings.value.length
)
const toggleAll = (checked: boolean) => {
    checkedAddrs.value = checked ? bindings.value.map(b => b.address) : []
}
const toggleOne = (addr: string, checked: boolean) => {
    const set = new Set(checkedAddrs.value)
    if (checked) {
        set.add(addr)
    } else {
        set.delete(addr)
    }
    checkedAddrs.value = [...set]
}
// 绑定列表变化时清理已不存在的选中项，并修正越界页码
const pruneChecked = () => {
    const set = new Set(bindings.value.map(b => b.address.toLowerCase()))
    checkedAddrs.value = checkedAddrs.value.filter(a => set.has(a.toLowerCase()))
    if (page.value > pageCount.value) page.value = pageCount.value
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
    await copyText(url)
}

const copyText = async (text: string) => {
    try {
        await navigator.clipboard.writeText(text)
        message.success(t('copied'))
    } catch {
        message.warning(text)
    }
}

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
    if (!checkedAddrs.value.length) return
    const set = new Set(checkedAddrs.value.map(a => a.toLowerCase()))
    const selected = bindings.value.filter(b => set.has(b.address.toLowerCase()))
    if (!selected.length) return
    copyText(selected.map(bindingCopyText).join('\n'))
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
                body: JSON.stringify({ address: addr, durationHours: batchDuration.value }),
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

// 批量删除选中绑定
const batchDelete = async () => {
    const addrs = [...checkedAddrs.value]
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
                checkedAddrs.value = []
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
    const addrs = [...checkedAddrs.value]
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
                for (const b of (res.bindings || [])) {
                    const idx = bindings.value.findIndex(x => x.address.toLowerCase() === b.address?.toLowerCase())
                    if (idx >= 0) bindings.value[idx] = b
                }
                checkedAddrs.value = []
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
    const addrs = [...checkedAddrs.value]
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
                for (const b of (res.bindings || [])) {
                    const idx = bindings.value.findIndex(x => x.address.toLowerCase() === b.address?.toLowerCase())
                    if (idx >= 0) {
                        bindings.value[idx] = b
                    } else {
                        bindings.value.unshift(b)
                    }
                }
                checkedAddrs.value = []
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

const durationLabel = (v: number) => {
    const opt = quickDurations.value.find(o => o.value === v)
    return opt ? opt.label : `${v} ${t('hours')}`
}

onMounted(fetchAll)
</script>

<template>
    <div class="center">
        <n-card :bordered="false" embedded :title="t('title')" style="max-width: 900px; overflow: auto;">
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
            <n-flex justify="space-between" align="center">
                <n-text depth="3" style="font-size: 12px;">{{ t('bindingsTip') }}</n-text>
                <n-button v-if="bindings.length" size="small" @click="copyAll">{{ t('copyAll') }}</n-button>
            </n-flex>
            <!-- 批量操作栏：选中后出现 -->
            <n-flex v-if="checkedAddrs.length" align="center" style="margin-top: 8px; padding: 8px 12px; background: rgba(127, 127, 127, 0.08); border-radius: 6px;">
                <n-text strong>{{ t('selectedCount', { n: checkedAddrs.length }) }}</n-text>
                <n-select v-model:value="batchOpDuration" :options="quickDurations" style="width: 150px;" />
                <n-button size="small" @click="copySelected">{{ t('copySelected') }}</n-button>
                <n-button size="small" :loading="batchOpLoading" @click="batchExtend">{{ t('batchExtend') }}</n-button>
                <n-button size="small" :loading="batchOpLoading" @click="batchReplace">{{ t('batchReplace') }}</n-button>
                <n-button size="small" type="error" ghost :loading="batchOpLoading" @click="batchDelete">{{ t('batchDelete') }}</n-button>
                <n-button size="small" quaternary @click="checkedAddrs = []">{{ t('cancelSelection') }}</n-button>
            </n-flex>
            <div style="overflow-x: auto;">
            <n-table :bordered="false" style="margin-top: 8px; min-width: 760px;">
                <thead>
                    <tr>
                        <th style="width: 36px; white-space: nowrap;">
                            <n-checkbox :checked="allChecked" :indeterminate="indeterminate" @update:checked="toggleAll" />
                        </th>
                        <th style="white-space: nowrap;">{{ t('address') }}</th>
                        <th>{{ t('snapshotUrl') }}</th>
                        <th style="white-space: nowrap;">{{ t('expiresAt') }}</th>
                        <th style="white-space: nowrap;">{{ t('actions') }}</th>
                    </tr>
                </thead>
                <tbody>
                    <tr v-for="b in pagedBindings" :key="b.address">
                        <td><n-checkbox :checked="checkedAddrs.includes(b.address)" @update:checked="(v: boolean) => toggleOne(b.address, v)" /></td>
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
                                <n-button size="small" @click="copyBindingInfo(b)">{{ t('copyInfo') }}</n-button>
                                <n-button size="small" @click="replaceBinding(b)">{{ t('replaceLink') }}
</n-button>
                                <n-button size="small" type="error" ghost @click="invalidate(b)">{{ t('invalidate') }}</n-button>
                            </n-flex>
                        </td>
                    </tr>
                    <tr v-if="!bindings.length">
                        <td colspan="5"><n-text depth="3">{{ t('noBindings') }}</n-text></td>
                    </tr>
                </tbody>
            </n-table>
            </div>
            <n-flex v-if="bindings.length > pageSize" justify="end" style="margin-top: 8px;">
                <n-pagination v-model:page="page" :page-count="pageCount" :page-size="pageSize" :item-count="bindings.length" show-quick-jumper />
            </n-flex>
            <n-flex style="margin-top: 12px;" align="center">
                <n-input v-model:value="newAddress" :placeholder="t('addressPlaceholder')" style="width: 260px;" />
                <n-select v-model:value="newDuration" :options="quickDurations" style="width: 160px;" />
                <n-input-number v-model:value="newDuration" :min="1" :max="8760" :placeholder="t('durationPlaceholder')"
                    :disabled="newDuration === 0" style="width: 140px;" />
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
                <n-select v-model:value="batchDuration" :options="quickDurations" style="width: 160px;" />
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
