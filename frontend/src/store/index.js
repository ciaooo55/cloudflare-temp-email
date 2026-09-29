import { computed, ref } from "vue";
import {
    createGlobalState, useStorage, useDark, useToggle,
    useLocalStorage, useSessionStorage
} from '@vueuse/core'

export const useGlobalState = createGlobalState(
    () => {
        const isDark = useDark()
        const toggleDark = useToggle(isDark)
        const loading = ref(false);
        const announcement = useLocalStorage('announcement', '');
        const useSimpleIndex = useLocalStorage('useSimpleIndex', false);
        const openSettings = ref({
            fetched: false,
            title: '',
            announcement: '',
            alwaysShowAnnouncement: false,
            prefix: '',
            addressRegex: '',
            needAuth: false,
            adminContact: '',
            enableUserCreateEmail: false,
            disableAnonymousUserCreateEmail: false,
            disableCustomAddressName: false,
            enableUserDeleteEmail: false,
            enableMailReadStatus: false,
            /** @type {string[]} */
            defaultDomains: [],
            /** @type {string[]} */
            randomSubdomainDomains: [],
            /** @type {Array<{label: string, value: string}>} */
            domains: [],
            copyright: 'Dream Hunter',
            cfTurnstileSiteKey: '',
            enableWebhook: false,
            isS3Enabled: false,
            enableSendMail: false,
            showGithub: true,
            disableAdminPasswordCheck: false,
            enableAddressPassword: false,
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
            statusUrl: '',
            enableGlobalTurnstileCheck: false,
        })
        const settings = ref({
            fetched: false,
            send_balance: 0,
            address: '',
        });
        const sendMailModel = useSessionStorage('sendMailModel', {
            fromName: "",
            toName: "",
            toMail: "",
            subject: "",
            contentType: 'text',
            content: "",
        });
        const showAuth = ref(false);
        const showAddressCredential = ref(false);
        const showAdminAuth = ref(false);
        const auth = useStorage('auth', '');
        const adminAuth = useStorage('adminAuth', '');
        const jwt = useStorage('jwt', '');
        const addressPassword = useSessionStorage('addressPassword', '');
        const adminTab = useSessionStorage('adminTab', "account");
        const adminMailTabAddress = ref("");
        const adminSendBoxTabAddress = ref("");
        const mailboxSplitSize = useStorage('mailboxSplitSize', 0.25);
        const mailListView = useStorage('mailListView', false);
        const mailListPreviewLineClamp = useStorage('mailListPreviewLineClamp', 2);
        const useIframeShowMail = useStorage('useIframeShowMail', false);
        const preferShowTextMail = useStorage('preferShowTextMail', false);
        const preferredLocale = useStorage('preferredLocale', '');
        const globalTabplacement = useStorage('globalTabplacement', 'top');
        const useSideMargin = useStorage('useSideMargin', true);
        const useUTCDate = useStorage('useUTCDate', false);
        const autoLoadRemoteImages = useStorage('autoLoadRemoteImages', true);
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
            toggleDark,
            loading,
            settings,
            sendMailModel,
            announcement,
            openSettings,
            showAuth,
            showAddressCredential,
            auth,
            jwt,
            adminAuth,
            showAdminAuth,
            adminTab,
            adminMailTabAddress,
            adminSendBoxTabAddress,
            mailboxSplitSize,
            mailListView,
            mailListPreviewLineClamp,
            useIframeShowMail,
            preferShowTextMail,
            preferredLocale,
            globalTabplacement,
            useSideMargin,
            useUTCDate,
            autoLoadRemoteImages,
            autoRefresh,
            configAutoRefreshInterval,
            telegramApp,
            isTelegram,
            showAdminPage,
            useSimpleIndex,
            addressPassword,
            browserFingerprint,
        }
    },
)
