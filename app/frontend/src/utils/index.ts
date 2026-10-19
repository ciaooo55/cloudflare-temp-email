import { getPathWithLocale, getStoredLocale, FALLBACK_LOCALE } from '../i18n/utils'

export const hashPassword = async (password: string) => {
    // user crypto to hash password
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(password));
    const hashArray = Array.from(new Uint8Array(digest));
    return hashArray.map(byte => byte.toString(16).padStart(2, '0')).join('');
}

export const getRouterPathWithLang = (path: string, lang: string) => {
    const normalizedLang = lang === 'en'
        || lang === 'es'
        || lang === 'pt-BR'
        || lang === 'ja'
        || lang === 'de'
        ? lang
        : 'zh';

    return getPathWithLocale(path, normalizedLang);
}

export const utcToLocalDate = (utcDate: string | null | undefined, useUTCDate: boolean) => {
    if (!utcDate) return '';
    const utcDateString = `${utcDate} UTC`;
    if (useUTCDate) {
        return utcDateString;
    }
    try {
        const date = new Date(utcDateString);
        // if invalid date string
        if (isNaN(date.getTime())) return utcDateString;

        return formatLocalDateTime(date);
    } catch (e) {
        console.error(e);
    }
    return utcDateString;
}

// 按当前界面语言格式化日期时间（中文：2026/9/30 14:00:00；英文：9/30/2026, 2:00:00 PM）
const DATE_LOCALE_MAP: Record<string, string> = {
    zh: 'zh-CN',
    en: 'en-US',
    es: 'es-ES',
    de: 'de-DE',
    ja: 'ja-JP',
    ptBR: 'pt-BR',
};

export const formatLocalDateTime = (date: Date): string => {
    const stored = getStoredLocale();
    const lang = stored || FALLBACK_LOCALE;
    return date.toLocaleString(DATE_LOCALE_MAP[lang] || 'zh-CN');
}
