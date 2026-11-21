<script setup>
import { ref, h, onMounted, watch } from 'vue';
import { NButton, NPopconfirm, NTag } from 'naive-ui'
import { useScopedI18n } from '@/i18n/app'

import { useGlobalState } from '../../store'
import { api } from '../../api'
import { utcToLocalDate } from '../../utils';

const { loading, useUTCDate } = useGlobalState()
const message = useMessage()

const { t } = useScopedI18n('views.admin.SenderAccess')
const data = ref([])
const count = ref(0)
const page = ref(1)
const pageSize = ref(20)

const curRow = ref({})
const showModal = ref(false)
const senderBalance = ref(0)
const senderEnabled = ref(false)

const addressQuery = ref('')

const updateData = async () => {
  try {
    await api.fetch(`/admin/address_sender`, {
      method: 'POST',
      body: JSON.stringify({
        address: curRow.value.address,
        address_id: curRow.value.id,
        balance: senderBalance.value,
        enabled: senderEnabled.value ? 1 : 0
      })
    });
    showModal.value = false;
    message.success(t("success"));
    await fetchData()
  } catch (error) {
    message.error(error.message || "error");
  }
}

const fetchData = async () => {
  try {
    addressQuery.value = addressQuery.value.trim();
    const { results, count: addressCount } = await api.fetch(
      `/admin/address_sender`
      + `?limit=${pageSize.value}`
      + `&offset=${(page.value - 1) * pageSize.value}`
      + (addressQuery.value ? `&address=${encodeURIComponent(addressQuery.value)}` : '')
    );
    data.value = results;
    if (page.value === 1 || addressCount > 0) {
      count.value = addressCount;
    }
  } catch (error) {
    message.error(error.message || "error");
  }
}

const columns = [
  {
    title: "ID",
    key: "id",
    width: 65
  },
  {
    title: t('address'),
    key: "address"
  },
  {
    title: t('created_at'),
    key: "created_at",
    render(row) {
      return utcToLocalDate(row.created_at, useUTCDate.value);
    }
  },
  {
    title: t('balance'),
    key: "balance"
  },
  {
    title: t('is_enabled'),
    key: "enabled",
    render(row) {
      return h(NTag, { size: 'small', bordered: false, type: row.enabled ? 'success' : 'default' }, { default: () => row.enabled ? t('enable') : t('disable') })
    }
  },
  {
    title: t('action'),
    key: 'actions',
    render(row) {
      return h('div', { style: 'display:flex;gap:12px' }, [
        h(NButton,
          {
            text: true,
            onClick: () => {
              showModal.value = true;
              curRow.value = row;
              senderEnabled.value = row.enabled ? true : false;
              senderBalance.value = row.balance;
            }
          },
          { default: () => t('modify') }
        ),
        h(NPopconfirm,
          {
            onPositiveClick: async () => {
              await api.fetch(`/admin/address_sender/${row.id}`, { method: 'DELETE' });
              await fetchData();
            }
          },
          {
            trigger: () => h(NButton,
              {
                text: true,
                type: "error",
              },
              { default: () => t('delete') }
            ),
            default: () => t('deleteTip')
          }
        ),
      ])
    }
  }
]

watch([page, pageSize], async () => {
  await fetchData()
})


const search = () => { if (page.value === 1) void fetchData(); else page.value = 1 }

onMounted(async () => {
  await fetchData()
})
</script>

<template>
  <div>
    <n-modal v-model:show="showModal" preset="dialog">
      <p>{{ curRow.address }}</p>
      <p>{{ t('modalTip') }}</p>
      <n-form-item :show-label="false">
        <n-checkbox v-model:checked="senderEnabled">
          {{ t('enable') }}
        </n-checkbox>
      </n-form-item>
      <n-form-item :show-label="false">
        <n-input-number v-model:value="senderBalance" :min="0" :max="1000" />
      </n-form-item>
      <template #action>
        <n-button :loading="loading" @click="updateData()" size="small" tertiary type="primary">
          {{ t('ok') }}
        </n-button>
      </template>
    </n-modal>
    <n-input-group class="sender-search">
      <n-input v-model:value="addressQuery" :placeholder="t('address')" :aria-label="t('address')" @keydown.enter="search" clearable />
      <n-button @click="search" secondary>
        {{ t('query') }}
      </n-button>
    </n-input-group>
    <n-data-table :columns="columns" :data="data" :bordered="false" :scroll-x="720" />
    <div class="sender-pagination"><n-pagination v-model:page="page" v-model:page-size="pageSize" :item-count="count" simple /></div>
  </div>
</template>

<style scoped>
.sender-search { max-width: 480px; margin-bottom: 20px; }
.sender-pagination { display: flex; justify-content: flex-end; padding-top: 20px; }
</style>
