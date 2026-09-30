type SmtpImapProxyConfig = {
    smtp?: {
        host?: string
        port?: number | string
        starttls?: boolean | string
    }
    imap?: {
        host?: string
        port?: number | string
        starttls?: boolean | string
    }
}

type Bindings = {
    // bindings
    DB: D1Database
    KV: KVNamespace
    RATE_LIMITER: RateLimit
    SEND_MAIL: SendEmail
    ASSETS: Fetcher
    AI: Ai

    // config
    DEFAULT_LANG: string | undefined
    TITLE: string | undefined
    ANNOUNCEMENT: string | undefined | null
    ALWAYS_SHOW_ANNOUNCEMENT: string | boolean | undefined
    PREFIX: string | undefined
    ADDRESS_CHECK_REGEX: string | undefined
    ADDRESS_REGEX: string | undefined
    MIN_ADDRESS_LEN: string | number | undefined
    MAX_ADDRESS_LEN: string | number | undefined
    DEFAULT_DOMAINS: string | string[] | undefined
    DOMAINS: string | string[] | undefined
    BRIDGE_DESTINATION?: string
    BRIDGE_SECRET?: string
    ENABLE_CREATE_ADDRESS_SUBDOMAIN_MATCH: string | boolean | undefined
    RANDOM_SUBDOMAIN_DOMAINS: string | string[] | undefined
    RANDOM_SUBDOMAIN_LENGTH: string | number | undefined
    DISABLE_CUSTOM_ADDRESS_NAME: string | boolean | undefined
    DISABLE_ADDRESS_UPDATED_AT: string | boolean | undefined
    CREATE_ADDRESS_DEFAULT_DOMAIN_FIRST: string | boolean | undefined
    DOMAIN_LABELS: string | string[] | undefined
    PASSWORDS: string | string[] | undefined
    ADMIN_PASSWORDS: string | string[] | undefined
    ADMIN_API_IP_WHITELIST: string | string[] | undefined
    DISABLE_ADMIN_PASSWORD_CHECK: string | boolean | undefined
    JWT_SECRET: string
    BLACK_LIST: string | undefined
    ENABLE_WEBHOOK: string | boolean | undefined
    ENABLE_USER_CREATE_EMAIL: string | boolean | undefined
    DISABLE_ANONYMOUS_USER_CREATE_EMAIL: string | boolean | undefined
    ENABLE_USER_DELETE_EMAIL: string | boolean | undefined
    ENABLE_ADDRESS_PASSWORD: string | boolean | undefined
    ENABLE_AGENT_EMAIL_INFO: string | boolean | undefined
    SMTP_IMAP_PROXY_CONFIG: string | SmtpImapProxyConfig | undefined
    DEFAULT_SEND_BALANCE: number | string | undefined
    NO_LIMIT_SEND_ROLE: string | undefined | null
    ADMIN_CONTACT: string | undefined
    COPYRIGHT: string | undefined
    STATUS_URL: string | undefined
    SNAPSHOT_BASE_URL: string | undefined
    DISABLE_SHOW_GITHUB: string | boolean | undefined

    ENABLE_CHECK_JUNK_MAIL: string | boolean | undefined
    JUNK_MAIL_CHECK_LIST: string | string[] | undefined
    JUNK_MAIL_FORCE_PASS_LIST: string | string[] | undefined

    ENABLE_ANOTHER_WORKER: string | boolean | undefined
    ANOTHER_WORKER_LIST: string | AnotherWorker[] | undefined

    REMOVE_ALL_ATTACHMENT: string | boolean | undefined
    REMOVE_EXCEED_SIZE_ATTACHMENT: string | boolean | undefined

    // s3 config
    S3_ENDPOINT: string | undefined
    S3_ACCESS_KEY_ID: string | undefined
    S3_SECRET_ACCESS_KEY: string | undefined
    S3_BUCKET: string | undefined
    S3_URL_EXPIRES: number | undefined

    // cf turnstile
    CF_TURNSTILE_SITE_KEY: string | undefined
    CF_TURNSTILE_SECRET_KEY: string | undefined

    // resend
    RESEND_TOKEN: string | undefined
    [key: `RESEND_TOKEN_${string}`]: string | undefined

    // SMTP config
    SMTP_CONFIG: string | object | undefined
    SEND_MAIL_DOMAINS: string | string[] | undefined

    // unified per-domain send & push routes (see worker/src/send_config.ts)
    // JSON string or object; maps domains to ordered send channel chains
    // and push targets. Secrets are referenced by NAME, never inline.
    SEND_ROUTES: string | object | undefined
    // named resend api keys referenced by SEND_ROUTES, e.g. RESEND_TOKEN_1
    // (covered by the RESEND_TOKEN_${string} index signature above)
    // named smtp configs (worker-mailer options JSON), e.g. SMTP_1
    [key: `SMTP_${string}`]: string | object | undefined
    // named cf send_email bindings, e.g. SEND_MAIL_2
    [key: `SEND_MAIL_${string}`]: SendEmail | undefined

    // telegram config
    TELEGRAM_BOT_TOKEN: string
    // named extra bot tokens for multi-bot push, e.g. TELEGRAM_BOT_TOKEN_2
    [key: `TELEGRAM_BOT_TOKEN_${string}`]: string | undefined
    BARK_DEVICE_KEYS: string | undefined
    // named extra bark device key sets, e.g. BARK_DEVICE_KEYS_2
    [key: `BARK_DEVICE_KEYS_${string}`]: string | undefined
    TG_MAX_ADDRESS: number | undefined
    TG_BOT_INFO: string | object | undefined
    TG_ALLOW_USER_LANG: string | boolean | undefined
    ENABLE_TG_PUSH_ATTACHMENT: string | boolean | undefined

    // webhook config
    FRONTEND_URL: string | undefined
    BACKEND_URL: string | undefined

    // AI extraction config
    ENABLE_AI_EMAIL_EXTRACT: string | boolean | undefined
    AI_EXTRACT_MODE: string | undefined
    AI_EXTRACT_MODEL: string | undefined
    // custom OpenAI-compatible AI endpoint (AI_EXTRACT_MODE=custom)
    AI_EXTRACT_API_URL: string | undefined
    AI_EXTRACT_API_KEY: string | undefined

    // gzip compression for raw_mails
    ENABLE_MAIL_GZIP: string | boolean | undefined
    ENABLE_MAIL_READ_STATUS: string | boolean | undefined
    CLEANUP_BATCH_SIZE: string | number | undefined
}

type JwtPayload = {
    address: string
    address_id: number
}

type UserPayload = {
    user_email: string
    user_id: number
    exp: number
    iat: number
}

type Variables = {
    userPayload: UserPayload,
    userRolePayload: string | undefined | null,
    jwtPayload: JwtPayload,
    lang: string | undefined | null
}

type HonoCustomType = {
    "Bindings": Bindings;
    "Variables": Variables;
}

type AnotherWorker = {
    binding: string | undefined | null,
    method: string | undefined | null,
    keywords: string[] | undefined | null
}

type RPCEmailMessage = {
    from: string | undefined | null,
    to: string | undefined | null,
    rawEmail: string | undefined | null,
    headers: object | undefined | null,
}

type ParsedEmailAttachment = {
    filename: string,
    mimeType: string,
    content: Uint8Array,
    disposition: string,
}

type ParsedEmailContext = {
    rawEmail: string,
    address?: string,
    parsedEmail?: {
        sender: string,
        subject: string,
        text: string,
        html: string,
        headers?: Record<string, string>[],
        attachments?: ParsedEmailAttachment[],
    } | undefined
}
