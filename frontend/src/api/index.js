import { useGlobalState } from '../store'
import { h } from 'vue'
import axios from 'axios'

import i18n from '../i18n'
import { getFingerprint } from '../utils/fingerprint'
import { safeBearerHeader, safeHeaderValue } from '../utils/headers'
import { sanitizeHtml } from '../utils/sanitize-html'
import { APP_CONFIG } from '../config'
import { ErrorCode } from './error-codes'

const API_BASE = APP_CONFIG.API_BASE || "";
const {
    loading, auth, jwt, openSettings,
    announcement,
    showAuth, adminAuth, showAdminAuth
} = useGlobalState();

const instance = axios.create({
    baseURL: API_BASE,
    timeout: 30000,
    validateStatus: (status) => status >= 200 && status <= 500
});


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
        const authorizationHeader = safeBearerHeader(jwt.value);
        if (authorizationHeader) headers['Authorization'] = authorizationHeader;

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
            throw new Error(`[${response.status}]: ${response.data?.message || response.data}`);
        }
        const data = response.data;
        return data;
    } catch (error) {
        if (error.response) {
            throw new Error(`Code ${error.response.status}: ${error.response.data?.message || error.response.data}`);
        }
        throw error;
    } finally {
        if (showLoading) loading.value = false;
    }
}

const getOpenSettings = async (message, notification) => {
    try {
        const res = await api.fetch("/open_api/settings");
        const domains = Array.isArray(res["domains"]) ? res["domains"] : [];
        const domainLabels = res["domainLabels"] || [];
        if (domains.length < 1) {
            message.error("No domains found, please check your worker settings");
        }
        Object.assign(openSettings.value, {
            ...res,
            title: res["title"] || "",
            prefix: res["prefix"] || "",
            minAddressLen: res["minAddressLen"] || 1,
            maxAddressLen: res["maxAddressLen"] || 30,
            needAuth: res["needAuth"] || false,
            defaultDomains: res["defaultDomains"] || [],
            randomSubdomainDomains: res["randomSubdomainDomains"] || [],
            domains: domains.map((domain, index) => {
                return {
                    label: domainLabels.length > index ? domainLabels[index] : domain,
                    value: domain
                }
            }),
            adminContact: res["adminContact"] || "",
            enableUserCreateEmail: res["enableUserCreateEmail"] || false,
            disableAnonymousUserCreateEmail: res["disableAnonymousUserCreateEmail"] || false,
            disableCustomAddressName: res["disableCustomAddressName"] || false,
            enableUserDeleteEmail: res["enableUserDeleteEmail"] || false,
            enableMailReadStatus: res["enableMailReadStatus"] === true,
            copyright: res["copyright"] || openSettings.value.copyright,
            cfTurnstileSiteKey: res["cfTurnstileSiteKey"] || "",
            enableWebhook: res["enableWebhook"] || false,
            isS3Enabled: res["isS3Enabled"] || false,
            enableAddressPassword: res["enableAddressPassword"] || false,
            enableAgentEmailInfo: res["enableAgentEmailInfo"] || false,
            smtpImapProxyConfig: res["smtpImapProxyConfig"] || openSettings.value.smtpImapProxyConfig,
            statusUrl: res["statusUrl"] || "",
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
            notification.info({
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
