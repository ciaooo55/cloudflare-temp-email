export class AdminWebhookSettings {
    enableAllowList: boolean;
    allowList: string[];

    constructor(enableAllowList: boolean, allowList: string[]) {
        this.enableAllowList = enableAllowList;
        this.allowList = allowList;
    }
}

export type WebhookMail = {
    id: string;
    url?: string;
    attachments?: { filename: string, mimeType: string, url: string }[];
    from: string;
    to: string;
    subject: string;
    raw: string;
    parsedText: string;
    parsedHtml: string;
    aiExtract: ExtractResult | null;
    aiExtractType: string;
    aiExtractResult: string;
    aiExtractResultText: string;
}

export type CustomSqlCleanup = {
    id: string;           // Unique identifier
    name: string;         // Cleanup task name
    sql: string;          // Custom SQL statement (DELETE only)
    enabled: boolean;     // Whether to enable auto cleanup
}

export type CleanupSettings = {

    enableMailsAutoCleanup: boolean | undefined;
    cleanMailsDays: number;
    enableUnknowMailsAutoCleanup: boolean | undefined;
    cleanUnknowMailsDays: number;
    enableSendBoxAutoCleanup: boolean | undefined;
    cleanSendBoxDays: number;
    enableAddressAutoCleanup: boolean | undefined;
    cleanAddressDays: number;
    enableInactiveAddressAutoCleanup: boolean | undefined;
    cleanInactiveAddressDays: number;
    enableEmptyAddressAutoCleanup: boolean | undefined;
    cleanEmptyAddressDays: number;
    customSqlCleanupList: CustomSqlCleanup[] | undefined;
    // 定时任务调度（网页可配）：raw_mails 定时清理（替代原独立 dinshi worker）
    enableRawMailsAutoCleanup: boolean | undefined;
    // 删除多少分钟前的 raw_mails，默认 10（与原 dinshi 一致）
    cleanRawMailsMinutes: number | undefined;
    // raw_mails 清理每多少分钟执行一次，默认 3（与原 dinshi 一致）
    rawMailsIntervalMinutes: number | undefined;
    // 自动清理整批任务每多少分钟检查执行一次，默认 60
    autoCleanupIntervalMinutes: number | undefined;
}

// 定时任务上次执行记录（存 KV）
export type ScheduledTaskRunInfo = {
    // 上次执行时间戳（毫秒）
    at: number;
    // 上次执行删除/影响行数（未知时为 undefined）
    affected?: number;
};

export class GeoData {

    ip: string;
    country: string | undefined;
    city: string | undefined;
    timezone: string | undefined;
    postalCode: string | undefined;
    region: string | undefined;
    latitude: number | undefined;
    longitude: number | undefined;
    regionCode: string | undefined;
    asOrganization: string | undefined;

    constructor(ip: string | null, data: GeoData | undefined | null) {
        const {
            country, city, timezone, postalCode, region,
            latitude, longitude, regionCode, asOrganization
        } = data || {};
        this.ip = ip || "unknown";
        this.country = country;
        this.city = city;
        this.timezone = timezone;
        this.postalCode = postalCode;
        this.region = region;
        this.latitude = latitude;
        this.longitude = longitude;
        this.regionCode = regionCode;
        this.asOrganization = asOrganization;
    }
}

export class AddressCreationSettings {

    enableSubdomainMatch: boolean | undefined;

    constructor(data: AddressCreationSettings | undefined | null) {
        const { enableSubdomainMatch } = data || {};
        this.enableSubdomainMatch = enableSubdomainMatch;
    }
}

export class WebhookSettings {
    enabled: boolean = false
    url: string = ''
    method: string = 'POST'
    headers: string = JSON.stringify({
        "Content-Type": "application/json"
    }, null, 2)
    body: string = JSON.stringify({
        "id": "${id}",
        "url": "${url}",
        "from": "${from}",
        "to": "${to}",
        "subject": "${subject}",
        "raw": "${raw}",
        "parsedText": "${parsedText}",
        "parsedHtml": "${parsedHtml}",
        "aiExtractType": "${aiExtractType}",
        "aiExtractResult": "${aiExtractResult}",
        "aiExtractResultText": "${aiExtractResultText}",
    }, null, 2)
}

export type EmailRuleSettings = {
    blockReceiveUnknowAddressEmail: boolean;
}

export type SendMailLimitConfig = {
    dailyEnabled: boolean;
    monthlyEnabled: boolean;
    dailyLimit: number | null;
    monthlyLimit: number | null;
}

export type RawMailRow = {
    id: number;
    message_id?: string;
    source?: string;
    address?: string;
    raw?: string;
    raw_blob?: unknown;
    metadata?: string;
    is_unread?: number | null;
    created_at?: string;
}

export type ExtractResult = {
    type: 'auth_code' | 'auth_link' | 'service_link' | 'subscription_link' | 'other_link' | 'none';
    result: string;
    result_text: string;
}
