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

// 用户的 23 个域名（11账号8个 / 55账号12个 / 163账号3个）
const ALLOWED_DOMAINS = [
    // 11账号
    'bbb99.us.ci', 'ca555.de5.net', 'ciaoo.de5.net', 'free555.de5.net',
    'free55.de5.net', 'free5.us.ci', 'kkk88.ccwu.cc', 'yyy22.de5.net',
    // 55账号
    '1111122222.dpdns.org', 'ciaooo11.ccwu.cc', 'ciaooo22.ccwu.cc', 'ciaooo33.us.ci',
    'ciaooo55.ccwu.cc', 'ciaooo55.de5.net', 'ciaooo55.dpdns.org', 'ciaooo55.us.ci',
    'ciaooo66.ccwu.cc', 'ciaooo77.us.ci', 'ciaooo88.ccwu.cc', 'looo.cloud',
    // 163账号
    'ciaooo66.dpdns.org', 'ciaooo77.dpdns.org', 'ciaooo77.us.ci',
];

const ttlHours = ref(24)
const bindings = ref<Binding[]>([])
const batchInput = ref('')
const batchDuration = ref(168)
const batchBinding = ref(false)

type ValidateResult = {
    address: string;
    valid: boolean;
    reason: string;
};
const validateResults = ref<ValidateResult[]>([])

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

// 邮箱格式校验
const isValidEmailFormat = (email: string): boolean => {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
};

// 检测每行邮箱：格式 + 域名是否在列表中 + 是否已绑定
const validateBatch = () => {
    const lines = batchInput.value.split('\n').map(s => s.trim().toLowerCase()).filter(Boolean);
    const boundSet = new Set(bindings.value.map(b => b.address.toLowerCase()));
    const seen = new Set<string>();
    validateResults.value = lines.map(address => {
        if (seen.has(address)) {
            return { address, valid: false, reason: '重复' };
        }
        seen.add(address);
        if (!isValidEmailFormat(address)) {
            return { address, valid: false, reason: t('invalidFormat') };
        }
        const domain = address.split('@')[1];
        if (!ALLOWED_DOMAINS.includes(domain)) {
            return { address, valid: false, reason: t('invalidDomain') };
        }
        if (boundSet.has(address)) {
            return { address, valid: false, reason: t('alreadyBound') };
        }
        return { address, valid: true, reason: '' };
    });
};

const validAddresses = computed(() => validateResults.value.filter(r => r.valid).map(r => r.address));
const invalidResults = computed(() => validateResults.value.filter(r => !r.valid));

// 批量绑定
const batchBind = async () => {
    validateBatch();
    if (!validAddresses.value.length) {
        message.warning('没有有效的邮箱地址');
        return;
    }
    batchBinding.value = true;
    let success = 0, failed = 0;
    const failedList: string[] = [];
    // 并行绑定，每批 5 个
    const addrs = validAddresses.value;
    for (let i = 0; i < addrs.length; i += 5) {
        const chunk = addrs.slice(i, i + 5);
        const results = await Promise.allSettled(chunk.map(addr =>
            api.fetch(`/admin/notify/snapshot_bindings`, {
                method: 'POST',
                body: JSON.stringify({ address: addr, durationHours: batchDuration.value }),
            })
        ));
        results.forEach((r, idx) => {
            if (r.status === 'fulfilled' && (r.value?.binding || r.value?.success)) {
                success++;
            } else {
                failed++;
                failedList.push(chunk[idx]);
            }
        });
    }
    batchBinding.value = false;
    await fetchAll();
    validateResults.value = [];
    batchInput.value = '';
    if (failed > 0) {
        message.warning(`绑定完成：成功 ${success} 个，失败 ${failed} 个（${failedList.slice(0, 3).join(', ')}${failedList.length > 3 ? '...' : ''}）`);
    } else {
        message.success(`批量绑定成功：${success} 个`);
    }
};

const invalidate = async (b: Binding) => {
    if (!confirm(t('confirmInvalidate'))) return;
    try {
        await api.fetch(`/admin/notify/snapshot_bindings/${encodeURIComponent(b.address)}`, { method: 'DELETE' })
        message.success(t('successTip'))
        await fetchAll();
    } catch (error) {
        message.error((error as Error).message || "error");
    }
};

// 更换链接：先删除再重新绑定
const replaceLink = async (b: Binding) => {
    if (!confirm(t('confirmReplace'))) return;
    try {
        await api.fetch(`/admin/notify/snapshot_bindings/${encodeURIComponent(b.address)}`, { method: 'DELETE' });
        const res = await api.fetch(`/admin/notify/snapshot_bindings`, {
            method: 'POST',
            body: JSON.stringify({ address: b.address, durationHours: batchDuration.value }),
        });
        if (res.binding || res.success) {
            message.success(t('successTip'));
            await fetchAll();
        } else {
            message.error(res.error || "error");
        }
    } catch (error) {
        message.error((error as Error).message || "error");
    }
};

const copyUrl = async (url: string) => {
    try {
        await navigator.clipboard.writeText(url)
        message.success(t('copied'))
    } catch {
        message.warning(url)
    }
};

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
                                <n-button size="small" @click="replaceLink(b)">{{ t('replaceLink') }}</n-button>
                                <n-button size="small" type="error" ghost @click="invalidate(b)">{{ t('invalidate') }}</n-button>
                            </n-flex>
                        </td>
                    </tr>
                    <tr v-if="!bindings.length">
                        <td colspan="4"><n-text depth="3">{{ t('noBindings') }}</n-text></td>
                    </tr>
                </tbody>
            </n-table>

            <n-divider>{{ t('batchTitle') }}</n-divider>
            <n-input v-model:value="batchInput" type="textarea" :placeholder="t('batchPlaceholder')"
                :autosize="{ minRows: 4, maxRows: 10 }" style="margin-bottom: 8px;" />
            <n-flex align="center" style="margin-bottom: 8px;">
                <n-select v-model:value="batchDuration" :options="quickDurations" style="width: 160px;" />
                <n-button @click="validateBatch">{{ t('validate') }}</n-button>
                <n-button type="primary" :loading="batchBinding" @click="batchBind">{{ t('batchBind') }}</n-button>
                <n-text depth="3" style="font-size: 12px;">{{ t('durationTip') }}</n-text>
            </n-flex>
            <div v-if="validateResults.length" style="margin-top: 8px;">
                <n-text style="font-size: 12px;" type="success">{{ t('validCount', { n: validAddresses.length }) }}</n-text>
                <div v-if="invalidResults.length" style="margin-top: 4px;">
                    <div v-for="r in invalidResults" :key="r.address" style="font-size: 12px; color: #d03050;">
                        {{ r.address }} — {{ r.reason }}
                    </div>
                </div>
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
</style>
