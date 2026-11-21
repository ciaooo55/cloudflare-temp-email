import { computed, ref } from "vue";
import {
    createGlobalState, useStorage,
    useLocalStorage, useSessionStorage
} from '@vueuse/core'

export const useGlobalState = createGlobalState(
    () => {
        const isDark = ref(true)
        const loading = ref(false);
        const announcement = useLocalStorage('announcement', '');
        const openSettings = ref({
            fetched: false,
            title: '',
            announcement: '',
            alwaysShowAnnouncement: false,
            needAuth: false,
            enableMailReadStatus: false,
            /** @type {Array<{label: string, value: string}>} */
            domains: [],
            cfTurnstileSiteKey: '',
            disableAdminPasswordCheck: false,
            enableAgentEmailInfo: false,
            smtpImapProxyConfig: {
                smtp: {
                    host: '',
                    port: 8025,
                    starttls: false,
                },
                imap: {
                    host: '',
                    port: 11143,
                    starttls: false,
                },
            },
            enableGlobalTurnstileCheck: false,
        })
        const sendMailModel = useSessionStorage('sendMailByAdminModel', {
            fromName: "",
            fromMail: "",
            toName: "",
            toMail: "",
            subject: "",
            contentType: 'text',
            content: "",
        });
        const showAuth = ref(false);
        const showAdminAuth = ref(false);
        const auth = useStorage('auth', '');
        const adminAuth = useStorage('adminAuth', '');
        const adminTab = useSessionStorage('adminTab', "mails");
        const adminMailTabAddress = ref("");
        const adminSendBoxTabAddress = ref("");
        const useIframeShowMail = useStorage('useIframeShowMail', false);
        const preferredLocale = useStorage('preferredLocale', '');
        const useUTCDate = useStorage('useUTCDate', false);
        const autoRefresh = useStorage('autoRefresh', false);
        const configAutoRefreshInterval = useStorage("configAutoRefreshInterval", 60);
        const showAdminPage = computed(() =>
            !!adminAuth.value
            || openSettings.value.disableAdminPasswordCheck
        );
        const telegramApp = ref(window.Telegram?.WebApp || {});
        const isTelegram = ref(!!window.Telegram?.WebApp?.initData);
        const browserFingerprint = ref('');
        return {
            isDark,
            loading,
            sendMailModel,
            announcement,
            openSettings,
            showAuth,
            auth,
            adminAuth,
            showAdminAuth,
            adminTab,
            adminMailTabAddress,
            adminSendBoxTabAddress,
            useIframeShowMail,
            preferredLocale,
            useUTCDate,
            autoRefresh,
            configAutoRefreshInterval,
            telegramApp,
            isTelegram,
            showAdminPage,
            browserFingerprint,
        }
    },
)
