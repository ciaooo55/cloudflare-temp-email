<script setup>
import { ref, computed, watch, onBeforeUnmount } from "vue";
import { useMessage } from 'naive-ui';
import { useScopedI18n } from '@/i18n/app'
import { CloudDownloadRound, ReplyFilled, ForwardFilled, FullscreenRound, ImageRound } from './mail-icons'
import ShadowHtmlComponent from "./ShadowHtmlComponent.vue";
import AiExtractInfo from "./AiExtractInfo.vue";
import { getDownloadEmlUrl } from '../utils/email-parser';
import { blockRemoteContent } from '../utils/remote-content-policy';
import { sanitizeHtml, htmlToPlainText } from '../utils/sanitize-html';
import { utcToLocalDate } from '../utils';
import { useGlobalState } from '../store';

const { useIframeShowMail, useUTCDate, isDark } = useGlobalState();

const { t } = useScopedI18n('components.MailContentRenderer')
const message = useMessage();

// 原始接收邮箱：邮件 To 头里的原始地址（解析不到时回退到系统收件地址），可一键复制
const originalRecipient = computed(() => props.mail.originalRecipient || props.mail.address || '');

const copyOriginalRecipient = async () => {
  const text = originalRecipient.value;
  if (!text) return;
  try {
    await navigator.clipboard.writeText(text);
    message.success(t('copied'));
  } catch {
    // 剪贴板 API 不可用时退化为临时文本框复制
    try {
      const ta = document.createElement('textarea');
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      message.success(t('copied'));
    } catch {
      message.warning(text);
    }
  }
};

const props = defineProps({
  mail: {
    type: Object,
    required: true
  },
  showEMailTo: {
    type: Boolean,
    default: true
  },
  enableUserDeleteEmail: {
    type: Boolean,
    default: false
  },
  showReply: {
    type: Boolean,
    default: false
  },
  showSaveS3: {
    type: Boolean,
    default: false
  },
  enableMailReadStatus: {
    type: Boolean,
    default: false
  },
  // 回调函数 props
  onDelete: {
    type: Function,
    default: () => { }
  },
  onReply: {
    type: Function,
    default: () => { }
  },
  onForward: {
    type: Function,
    default: () => { }
  },
  onSaveToS3: {
    type: Function,
    default: () => { }
  },
  onUpdateMailReadStatus: {
    type: Function,
    default: () => { }
  }
});

const emlUrl = computed(() => getDownloadEmlUrl(props.mail.raw));
watch(emlUrl, (_url, oldUrl) => { if (oldUrl) URL.revokeObjectURL(oldUrl); });
onBeforeUnmount(() => URL.revokeObjectURL(emlUrl.value));

const showTextMail = ref(true);
const showAttachments = ref(false);
const curAttachments = ref([]);
const attachmentLoding = ref(false);
const readStatusUpdating = ref(false);
const showFullscreen = ref(false);

// Consent belongs to one message, never to a saved global preference.
const showRemoteImages = ref(false);
watch(() => props.mail.id, () => {
  showRemoteImages.value = false;
  showTextMail.value = true;
  showFullscreen.value = false;
});

const plainText = computed(() => props.mail.text?.trim()
  ? props.mail.text : htmlToPlainText(processedMail.value.message));

const processedMail = computed(() => {
  if (showRemoteImages.value) {
    return { message: sanitizeHtml(props.mail.message), blocked: 0 };
  }
  const { html, blocked } = blockRemoteContent(props.mail.message);
  return { message: html, blocked };
});

const handleLoadRemoteImages = () => {
  showRemoteImages.value = true;
  showTextMail.value = false;
};

const handleDelete = () => {
  props.onDelete();
};

const handleViewAttachments = () => {
  curAttachments.value = props.mail.attachments;
  showAttachments.value = true;
};

const handleReply = () => {
  props.onReply();
};

const handleForward = () => {
  props.onForward();
};

const handleUpdateMailReadStatus = async () => {
  readStatusUpdating.value = true;
  try {
    await props.onUpdateMailReadStatus();
  } finally {
    readStatusUpdating.value = false;
  }
};


const handleSaveToS3 = async (filename, blob) => {
  attachmentLoding.value = true;
  try {
    await props.onSaveToS3(filename, blob);
  } finally {
    attachmentLoding.value = false;
  }
};

</script>

<template>
  <div class="mail-content-renderer">
    <AiExtractInfo :key="mail.id" :metadata="mail.metadata" />
    <dl class="message-addresses">
      <div><dt>From</dt><dd>{{ mail.source }}</dd></div>
      <div><dt>{{ t('originalSender') }}</dt><dd>{{ mail.originalSource || mail.source }}</dd></div>
      <div v-if="showEMailTo"><dt>To</dt><dd>{{ mail.address }}</dd></div>
      <div v-if="originalRecipient"><dt>{{ t('originalRecipient') }}</dt><dd>{{ originalRecipient }}
        <n-button text size="tiny" type="primary" style="margin-left: 4px;" @click="copyOriginalRecipient">
          {{ t('copy') }}
        </n-button>
      </dd></div>
      <div><dt>Date</dt><dd>{{ utcToLocalDate(mail.created_at, useUTCDate) }}</dd></div>
    </dl>
    <n-space class="message-actions" size="small">
      <n-popconfirm v-if="enableUserDeleteEmail" @positive-click="handleDelete">
        <template #trigger>
          <n-button tertiary type="error" size="small">{{ t('delete') }}</n-button>
        </template>
        {{ t('deleteMailTip') }}
      </n-popconfirm>

      <n-button v-if="mail.attachments && mail.attachments.length > 0" size="small" tertiary type="info"
        @click="handleViewAttachments">
        {{ t('attachments') }}
      </n-button>

      <n-button v-if="enableMailReadStatus" size="small" tertiary type="info" :loading="readStatusUpdating"
        @click="handleUpdateMailReadStatus">
        {{ mail.is_unread === 1 ? t('markAsRead') : t('markAsUnread') }}
      </n-button>

      <n-button tag="a" target="_blank" tertiary type="info" size="small" :download="mail.id + '.eml'"
        :href="emlUrl">
        <template #icon>
          <n-icon :component="CloudDownloadRound" />
        </template>
        {{ t('downloadMail') }}
      </n-button>

      <n-button v-if="showReply" size="small" tertiary type="info" @click="handleReply">
        <template #icon>
          <n-icon :component="ReplyFilled" />
        </template>
        {{ t('reply') }}
      </n-button>

      <n-button v-if="showReply" size="small" tertiary type="info" @click="handleForward">
        <template #icon>
          <n-icon :component="ForwardFilled" />
        </template>
        {{ t('forward') }}
      </n-button>

      <n-button size="small" tertiary type="info" @click="showTextMail = !showTextMail">
        {{ showTextMail ? t('showHtmlMail') : t('showTextMail') }}
      </n-button>

      <n-button v-if="!showRemoteImages" size="small" tertiary type="primary" @click="handleLoadRemoteImages">
        <template #icon><n-icon :component="ImageRound" /></template>
        {{ t('loadRemoteImages') }}
      </n-button>

      <n-button size="small" tertiary type="info" @click="showFullscreen = true">
        <template #icon>
          <n-icon :component="FullscreenRound" />
        </template>
        {{ t('fullscreen') }}
      </n-button>

    </n-space>

    <!-- 外部资源阻断提示 -->
    <n-alert v-if="processedMail.blocked" type="warning" :show-icon="false" :bordered="false"
      class="remote-images-banner">
      <n-space align="center" justify="space-between">
        <span>{{ t('remoteImagesBlocked', { count: processedMail.blocked }) }}</span>
      </n-space>
    </n-alert>

    <!-- 邮件内容 -->
    <div class="mail-content" :class="{ 'dark-mode': isDark }">
      <pre v-if="showTextMail" class="mail-text">{{ plainText }}</pre>
      <iframe v-else-if="useIframeShowMail" :srcdoc="processedMail.message" sandbox="allow-popups allow-popups-to-escape-sandbox" referrerpolicy="no-referrer" :title="mail.subject" class="mail-iframe">
      </iframe>
      <ShadowHtmlComponent v-else :key="mail.id" :htmlContent="processedMail.message" :isDark="isDark" class="mail-html" />
    </div>
  </div>

  <n-drawer v-model:show="showFullscreen" width="100%" placement="bottom" :trap-focus="false" :block-scroll="false"
    style="height: 100vh;">
    <n-drawer-content :title="mail.subject" closable>
      <div class="fullscreen-mail-content" :class="{ 'dark-mode': isDark }">
        <pre v-if="showTextMail" class="mail-text">{{ plainText }}</pre>
        <iframe v-else-if="useIframeShowMail" :srcdoc="processedMail.message" sandbox="allow-popups allow-popups-to-escape-sandbox" referrerpolicy="no-referrer" :title="mail.subject" class="mail-iframe">
        </iframe>
        <ShadowHtmlComponent v-else :key="mail.id" :htmlContent="processedMail.message" :isDark="isDark" class="mail-html" />
      </div>
    </n-drawer-content>
  </n-drawer>

  <!-- 附件模态框 -->
  <n-modal v-model:show="showAttachments" preset="dialog" title="Dialog">
    <template #header>
      <div>{{ t('attachments') }}</div>
    </template>
    <n-spin v-model:show="attachmentLoding">
      <n-list hoverable clickable>
        <n-list-item v-for="row in curAttachments" v-bind:key="row.id">
          <n-thing class="center" :title="row.filename">
            <template #description>
              <n-space>
                <n-tag type="info">
                  Size: {{ row.size }}
                </n-tag>
                <n-button v-if="showSaveS3" @click="handleSaveToS3(row.filename, row.blob)" ghost type="info"
                  size="small">
                  {{ t('saveToS3') }}
                </n-button>
              </n-space>
            </template>
          </n-thing>
          <template #suffix>
            <n-button tag="a" target="_blank" tertiary type="info" size="small" :download="row.filename"
              :href="row.url">
              <n-icon :component="CloudDownloadRound" />
            </n-button>
          </template>
        </n-list-item>
      </n-list>
    </n-spin>
  </n-modal>
</template>

<style scoped>
.mail-content-renderer {
  display: flex;
  flex-direction: column;
  gap: 16px;
}
.message-addresses { margin: 0; display: grid; gap: 8px; padding-bottom: 20px; border-bottom: 1px solid var(--mail-border, #272d39); }
.message-addresses > div { display: grid; grid-template-columns: minmax(65px, auto) minmax(0, 1fr); gap: 14px; font-size: 12px; }
.message-addresses dt { color: #8590a6; }
.message-addresses dd { margin: 0; overflow-wrap: anywhere; color: #bdc6d9; }
.message-actions :deep(.n-button) { font-size: 11px; }
.mail-content-renderer :deep(.n-alert) { border-radius: 10px; }

.mail-address { max-width: 100%; height: auto; overflow-wrap: anywhere; }
.mail-address :deep(.n-tag__content) { white-space: normal; }
.mail-content-renderer :deep(.n-tag__content) { overflow-wrap: anywhere; white-space: normal; }
.mail-content-renderer :deep(.n-tag) { height: auto; min-height: 24px; max-width: 100%; }
/* Let the banner's inner space fill the alert so the button sits on the right. */
.remote-images-banner :deep(.n-space) {
  width: 100%;
}

.mail-content {
  margin-top: 10px;
  flex: 1;
}

.mail-text {
  font-family: inherit;
  font-size: 14px;
  line-height: 1.9;
  white-space: pre-wrap;
  word-wrap: break-word;
  margin: 0;
  padding: 0;
  font-family: inherit;
  font-size: inherit;
  line-height: inherit;
}

.dark-mode .mail-text {
  color: #e0e0e0;
}

.mail-iframe {
  width: 100%;
  height: 100%;
  border: none;
  min-height: 400px;
}

.dark-mode .mail-iframe {
  background-color: #fff;
}

.mail-html {
  width: 100%;
  height: 100%;
}

.center {
  text-align: center;
}

.fullscreen-mail-content {
  height: calc(100vh - 120px);
  overflow: auto;
}

.fullscreen-mail-content .mail-iframe {
  min-height: calc(100vh - 120px);
}
</style>
