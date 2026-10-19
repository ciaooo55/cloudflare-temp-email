<script setup>
import { onMounted, ref, computed } from 'vue';

import { useGlobalState } from '../../store'
import { useScopedI18n } from '../../i18n/app'
import { api } from '../../api'

const { loading } = useGlobalState()
const { t } = useScopedI18n('views.admin.WorkerConfig')
const message = useMessage()

const settings = ref({})

const fetchData = async () => {
    try {
        const res = await api.fetch(`/admin/worker/configs`)
        Object.assign(settings.value, res)
    } catch (error) {
        message.error(error.message || "error");
    }
}

// 人性化标签：缺失时回退显示原始键名
const labelFor = (key) => {
    const v = t(`labels.${key}`)
    return v === `views.admin.WorkerConfig.labels.${key}` ? key : v
}

// 配置项说明：缺失时不显示
const descFor = (key) => {
    const v = t(`descriptions.${key}`)
    return v === `views.admin.WorkerConfig.descriptions.${key}` ? '' : v
}

const formatValue = (v, key) => {
    if (v === true) return t('yes')
    if (v === false) return t('no')
    // HAS_* 表示“是否已设置”，数字是密码个数：>0 显示“是”
    if (typeof v === 'number' && key.startsWith('HAS_')) return v > 0 ? t('yes') : t('no')
    if (Array.isArray(v)) return v.length ? v.join(', ') : t('notSet')
    if (v === '' || v == null) return t('notSet')
    return String(v)
}

const rows = computed(() =>
    Object.keys(settings.value).map((k) => ({
        key: k,
        label: labelFor(k),
        desc: descFor(k),
        value: formatValue(settings.value[k], k),
    }))
)

onMounted(async () => {
    await fetchData();
})
</script>

<template>
    <div class="center">
        <n-card :bordered="false" embedded style="max-width: 800px;">
            <n-alert type="info" style="margin-bottom: 12px;">
                {{ t('readOnlyTip') }}
            </n-alert>
            <n-descriptions label-placement="left" bordered :column="1">
                <n-descriptions-item v-for="row in rows" :key="row.key" :label="row.label">
                    <span class="value">{{ row.value }}</span>
                    <div v-if="row.desc" class="desc">{{ row.desc }}</div>
                </n-descriptions-item>
            </n-descriptions>
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

.value {
    word-break: break-all;
}

.desc {
    margin-top: 4px;
    font-size: 12px;
    color: #909399;
}
</style>
