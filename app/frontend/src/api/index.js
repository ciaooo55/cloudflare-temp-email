import { useGlobalState } from '../store'
import { h } from 'vue'
import axios from 'axios'

import i18n from '../i18n'
import { getFingerprint } from '../utils/fingerprint'
import { safeHeaderValue } from '../utils/headers'
import { sanitizeHtml } from '../utils/sanitize-html'
import { APP_CONFIG } from '../config'
import { ErrorCode } from './error-codes'

const API_BASE = APP_CONFIG.API_BASE || "";
const {
    loading, auth, openSettings,
    announcement,
    showAuth, adminAuth, showAdminAuth
} = useGlobalState();

const instance = axios.create({
    baseURL: API_BASE,
    timeout: 30000,
    validateStatus: (status) => status >= 200 && status <= 500
});

const responseError = (response, prefix) => Object.assign(
    new Error(`${prefix}${response.data?.message || response.data}`),
    {
        status: response.status,
        data: response.data,
        code: response.data?.code,
        retryAfter: response.headers?.get?.('retry-after') ?? response.headers?.['retry-after'],
        authRequired: ErrorCode.isAdminAuthError(response) || ErrorCode.isSiteAuthError(response),
    }
);

const apiFetch = async (path, options = {}) => {
    const showLoading = options.showLoading !== false;
    if (showLoading) loading.value = true;
    try {
        // Get browser fingerprint for request tracking
        const fingerprint = await getFingerprint();

        // Skip auth headers whose value is empty / "undefined" / contains
        // control chars (otherwise axios throws "Invalid character in header
        // content" before the request is sent — see issue #1000).
        const headers = {
            'x-lang': i18n.global.locale.value,
            'x-fingerprint': fingerprint,
            'Content-Type': 'application/json',
        };
        const customAuthHeader = safeHeaderValue(auth.value);
        if (customAuthHeader) headers['x-custom-auth'] = customAuthHeader;
        const adminAuthHeader = safeHeaderValue(adminAuth.value);
        if (adminAuthHeader) headers['x-admin-auth'] = adminAuthHeader;

        const response = await instance.request(path, {
            method: options.method || 'GET',
            data: options.body || null,
            headers,
        });
        if (ErrorCode.isAdminAuthError(response)) {
            showAdminAuth.value = true;
        }
        if (ErrorCode.isSiteAuthError(response)) {
            showAuth.value = true;
        }
        if (response.status >= 300) {
            throw responseError(response, `[${response.status}]: `);
        }
        const data = response.data;
        return data;
    } catch (error) {
        if (error.response) {
            throw responseError(error.response, `Code ${error.response.status}: `);
        }
        throw error;
    } finally {
        if (showLoading) loading.value = false;
    }
}

let pendingOpenSettings;
const getOpenSettings = async (message, notification) => {
    try {
        pendingOpenSettings ||= api.fetch("/open_api/settings", { showLoading: false })
            .finally(() => { pendingOpenSettings = undefined; });
        const res = await pendingOpenSettings;
        const domains = Array.isArray(res["domains"]) ? res["domains"] : [];
        const domainLabels = res["domainLabels"] || [];
        if (domains.length < 1) {
            message.error("No domains found, please check your worker settings");
        }
        Object.assign(openSettings.value, {
            title: res["title"] || "",
            announcement: res["announcement"] || "",
            alwaysShowAnnouncement: res["alwaysShowAnnouncement"] === true,
            disableAdminPasswordCheck: res["disableAdminPasswordCheck"] === true,
            needAuth: res["needAuth"] || false,
            domains: domains.map((domain, index) => {
                return {
                    label: domainLabels.length > index ? domainLabels[index] : domain,
                    value: domain
                }
            }),
            enableMailReadStatus: res["enableMailReadStatus"] === true,
            cfTurnstileSiteKey: res["cfTurnstileSiteKey"] || "",
            enableAgentEmailInfo: res["enableAgentEmailInfo"] || false,
            smtpImapProxyConfig: res["smtpImapProxyConfig"] || openSettings.value.smtpImapProxyConfig,
            enableGlobalTurnstileCheck: res["enableGlobalTurnstileCheck"] || false,
        });
        if (openSettings.value.needAuth) {
            showAuth.value = true;
        }
        if (openSettings.value.announcement
            && !openSettings.value.fetched
            && (openSettings.value.announcement != announcement.value
                || openSettings.value.alwaysShowAnnouncement)
        ) {
            announcement.value = openSettings.value.announcement;
            notification?.info({
                content: () => {
                    return h("div", {
                        innerHTML: sanitizeHtml(announcement.value)
                    });
                }
            });
        }
    } catch (error) {
        message.error(error.message || "error");
    } finally {
        openSettings.value.fetched = true;
    }
}

const adminShowAddressCredential = async (id) => {
    const { jwt: addressCredential } = await apiFetch(`/admin/show_password/${id}`);
    return addressCredential;
}

const adminDeleteAddress = async (id) => {
    await apiFetch(`/admin/delete_address/${id}`, {
        method: 'DELETE'
    });
}

export const api = {
    fetch: apiFetch,
    getOpenSettings,
    adminShowAddressCredential,
    adminDeleteAddress,
}
