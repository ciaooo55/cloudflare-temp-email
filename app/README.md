# 项目本体

## 安全升级 / Security hardening

**中文**

- 保留现有 `JWT_SECRET`，不要轮换：运行时拒绝空值与已知占位值 `xxx`，其余旧 JWT 与邮箱无需迁移。模板不再提供活动占位值；已有部署的 `keep_vars = true` 与继承线上绑定的发布流程保留原值。新安装须先配置随机 Worker 密钥。
- Pages 必须显式配置 `BACKEND` 服务绑定或 `BACKEND_URL`（HTTPS 后端地址）；缺失时 API 返回 503，不再向固定外部域名转发。当前 `cloudflare-temp-email` 项目的 production/preview 已显式指向本站 API。
- 可选 `AUTH_RATE_LIMITER` 使用免费的 Workers Rate Limiting 绑定，不使用 D1/KV 计数。Wrangler 配置为 `[[ratelimits]]`、`name = "AUTH_RATE_LIMITER"`、`namespace_id = "1001"`、`simple = { limit = 30, period = 60 }`。同一 IP 的管理员、站点、邮箱密码认证分别共享每分钟 30 次额度（包括成功请求），不按 URL 拆分；超限返回 429/Retry-After。缺少绑定时保持旧行为。使用继承线上绑定的发布工具时，须把新绑定加入发布元数据，否则限流不会启用。Cloudflare 原生限流按位置执行，不是全局精确计数；管理员 IP 白名单仍可继续使用。
- **部署前操作**：Telegram Webhook 现在必须携带已存储的密钥。只读检查发现默认机器人尚无密钥，且无网页机器人配置；先在现有通知页面为默认机器人执行「设置 Webhook」，或向 `https://api.ciaooo55.de5.net/admin/notify/telegram_bots/env/webhook` 发起带现有 `x-admin-auth` 和（如配置）`x-custom-auth` 的 POST。现有接口自动生成、向 Telegram 注册并保存密钥，不返回密钥。确认 JSON `ok: true` 后再发布，避免回调中断。也可使用现有 `POST /admin/telegram/init`。任何后续新增网页机器人亦须执行各自的设置 Webhook 操作；未经初始化的回调返回 401。不要把密钥放入日志或提交。
- `/telegram/get_mail` 的管理员分支与 `/admin/*` 使用相同站点密码及 IP 白名单策略；正常 Telegram Mini App 身份验证保留，停用的网页机器人不再可用于认证。
- Bark 保存时只接受有效 HTTPS URL，错误直接显示在通知网页；现有存储的 HTTP 地址仍可读取、测试与推送，但下次保存须改成 HTTPS。设备密钥继续脱敏并可网页编辑。Pages 仅添加同源嵌入限制，不启用可能破坏邮件渲染的完整 CSP。
- **暂缓的审计问题（PR 说明）**：bridge HMAC 仍只签收件人，泄露的签名可重放；本次按要求不更改邮件桥协议。后续应协同升级双方以签收件人、时间与正文摘要；严格一次性重放防护需要共享状态写入，与本次约束不兼容。

**English**

- Keep the existing `JWT_SECRET`; do not rotate it. Runtime rejects empty values and the known placeholder `xxx`; other existing mailbox JWTs need no migration. The template no longer supplies an active placeholder. Existing `keep_vars = true` and live-binding inheritance retain the live key; fresh installs must provision a random Worker secret.
- Pages requires an explicit `BACKEND` service binding or `BACKEND_URL` (an HTTPS backend). Missing configuration returns 503 instead of forwarding API credentials to a hard-coded external host. Both production and preview on the current `cloudflare-temp-email` project explicitly select this installation's API.
- Optional `AUTH_RATE_LIMITER` uses the free Workers Rate Limiting binding, with no D1/KV counters. Wrangler uses `[[ratelimits]]`, `name = "AUTH_RATE_LIMITER"`, `namespace_id = "1001"`, `simple = { limit = 30, period = 60 }`. Admin, site and mailbox password checks each share a 30/minute per-IP allowance across paths, including successful checks; denials return 429/Retry-After. Missing binding preserves legacy behavior. A deployment tool inheriting live bindings must explicitly add this new binding to upload metadata or throttling will remain disabled. Native limits are location-local, not precise global counters; admin IP restrictions remain available.
- **Before deployment:** webhook requests now require a stored secret. Read-only inspection found no default-bot secret and no web-configured bots. On the existing notification page, use the default bot's Set Webhook action, or POST to `https://api.ciaooo55.de5.net/admin/notify/telegram_bots/env/webhook` with the existing `x-admin-auth` and, if configured, `x-custom-auth`. The existing endpoint generates, registers with Telegram and stores the secret without returning it. Confirm JSON `ok: true` before deploying to avoid an interruption. Existing `POST /admin/telegram/init` also works. Future web-configured bots need their own Set Webhook action; uninitialized callbacks return 401. Never log or commit secret values.
- The admin branch of `/telegram/get_mail` shares the `/admin/*` site-password/IP policy. Normal Telegram Mini App authentication remains available; disabled web-configured bots cannot authenticate.
- Bark saves require a valid HTTPS URL; the notification page displays the validation error. Existing stored HTTP URLs still load, test and deliver, but must be upgraded on the next save. Masked device keys remain web-editable. Pages adds only same-origin framing restrictions, not a full CSP that could break mail rendering.
- **Deferred audit finding (PR notes):** bridge HMAC still signs only the recipient; a disclosed signature can be replayed. This change deliberately leaves the bridge protocol unchanged. A future coordinated sender/receiver upgrade should sign recipient, timestamp and body digest; strict single-use replay prevention requires shared-state writes outside these constraints.

## 网页统计 / Web statistics

- 「统计」按 UTC 今天及前六天展示收发封数，删信、清空邮箱及自动清理邮件不会减少数量。只保留本地邮箱、UTC 入库日期和数量，不留正文或对方地址；排行含已登记的零封邮箱及本期有收发的地址，并列按地址排序，每页 20 项。发信以成功保存的发件记录为准；收信含站内通知，拒收及记录未保存成功的不计。
- 数据库版本 `v0.0.11`：备份后调用认证的 `POST /admin/db_migration`，新安装调用 `POST /admin/db_initialize`。在一个 D1 batch 事务中安装 `mailbox_activity_day`（无额外二级索引）、两个插入触发器和首次启用时间；重试不会重置时间或重复计数。不扫描/回填旧邮件，启用前的未知历史不冒充零。触发器和邮件写入同成同败，不增加邮件路径的网络往返。每封预留新增 4 读/3 写，清理每批最多 64 项并先预留 160 读/65 写（另计预算操作本身），无过期项不新增预算写入；预算不足延后物理删除，但查询始终只显示七天。
- `GET /admin/statistics?offset=0&sort=received`（或 `sort=sent`）的 `mailCount`/`sendMailCount` 改为本期已记录封数，`addressCount` 为本期排行邮箱数，`period.startedAt` 为首次启用 UTC 时间。早于启用日的日期桶返回 `received: null, sent: null`。只读汇总表与邮箱目录，不读邮件表或正文；三条查询在当前 Worker 实例内缓存 60 秒（最多 20 页），跨 UTC 日期失效。仅打开、翻页、排序或手动刷新请求，无后台轮询或新依赖。
- `GET /admin/storage_status` 的 `budget.days` 返回 UTC 今天、昨天的现有 D1 保护预留计数，`budget.free` 仅是免费计划参考上限。它不是 Cloudflare 的实际行消耗/账单，也不覆盖其他项目、Workers 请求或 KV；预留批次未用完也不返还。剩余分别按今天距软线、硬线计算，最低为 0；两天合计不代表可以跨日使用的额度。
- 计数表缺失/读取失败显示「不可用」而不是 0。此接口原有的认证与额度耗尽时可诊断的行为不变；不在页面修改保护上限。账户真实总用量保留「未连接」说明和 Cloudflare 控制台入口，不新增 Analytics 凭据或绑定。

- Statistics cover today and the previous six UTC dates, surviving mail/address deletion and automatic cleanup. Summaries retain only local mailbox, UTC insertion date and counts, never bodies or correspondents. Rankings include registered zero-message mailboxes and mailboxes active during the window, with alphabetical ties, paged by 20. Incoming counts include internal notices; outgoing counts require a saved sendbox record. Rejections and unsaved records do not count.
- Schema `v0.0.11`: back up, then call authenticated `POST /admin/db_migration` (fresh installs: `POST /admin/db_initialize`). A single D1 batch transaction installs the `WITHOUT ROWID` daily table, two insert triggers and activation timestamp. Repeated installation neither recounts nor resets activation. Old mail is not scanned/backfilled and unknown history is not shown as zero. Mail and summary commit/roll back together, without per-message network round trips. Per-mail reservations add 4 reads/3 writes. Expiry deletes at most 64 rows after reserving 160 reads/65 writes plus reservation overhead; no expired rows means no new budget write. Insufficient budget defers physical removal; queries always restrict to seven days.
- `GET /admin/statistics?offset=0&sort=received` (or `sort=sent`) now returns recorded window totals in `mailCount`/`sendMailCount`, ranked-mailbox count in `addressCount`, and activation UTC time in `period.startedAt`. Pre-activation date buckets use `received: null, sent: null`. Three queries read indexed summaries and the mailbox directory, never mail tables/bodies. Results are isolate-cached for 60 seconds (up to 20 pages), expiring across UTC dates. Opening, paging, sorting or manual refresh only: no polling or new dependencies.
- Existing `GET /admin/storage_status` adds today's/yesterday's guard reservations in `budget.days`, with Free-plan reference limits in `budget.free`. These estimates are not metered Cloudflare usage/billing and exclude other apps, Worker requests and KV; unused reservations are not refunded. Remaining budget is today's distance from soft/hard thresholds, clamped at zero. Two-day totals are historical comparisons, not rollover allowance.
- Missing/unreadable counters show unavailable, not zero. Authentication and the existing diagnostic availability after quota exhaustion remain unchanged; guard limits are not editable here. Actual account-wide usage is explicitly not connected, with a Cloudflare dashboard link. No Analytics credentials or bindings are added.

Cloudflare 临时邮箱的核心服务，包含前端和后端。当前 Cloudflare 上运行的就是这套代码。

## 结构

- `frontend/` — 前端（Vue），用户收发邮件的网页界面，通过 Cloudflare Pages 自动部署
- `worker/` — 后端（TypeScript），跑在 Cloudflare Workers 上，处理收信、发信、API、Telegram/Bark 推送

## 在项目中的作用

这是整个临时邮箱系统的本体。`bridge/` 把其他域名的邮件转过来后，由 `worker/` 接收存储，用户通过 `frontend/` 查看。

## 部署

- 后端：本地用 `~/workspace/cf-worker/deploy.py` 部署（不要用 GitHub Actions）
- 前端：push 到 main 后 Cloudflare Pages 自动构建部署

## 邮箱黑名单 / Mailbox blacklists

## 简化邮箱界面 / Simplified mailbox workspace

**更新与缓存 / Updates and caching**：不再安装离线页面缓存；浏览器正常访问时检查旧 `/sw.js`，新脚本跳过等待、清理本应用 Cache Storage、注销并自动重新打开受控标签。无需手动清缓存，登录、本地设置与会话草稿不受影响。脚本使用 `no-store`，带哈希资源继续使用 HTTP 长缓存；页脚构建标识来自 `CF_PAGES_COMMIT_SHA`。已打开且一直不触发浏览器更新检查的旧页面，须等下次正常访问或浏览器自动检查才会升级。

The app no longer installs offline page caches. Normal visits check an existing `/sw.js`; its replacement skips waiting, clears only app Cache Storage, unregisters, and reloads controlled tabs without clearing login, preferences or session drafts. Worker/registration scripts use `no-store`; hashed assets retain long-lived HTTP caching. The footer build ID comes from `CF_PAGES_COMMIT_SHA`. An already-open old page upgrades when its browser next checks the worker or navigates normally, not through a forced cache reset.

**中文**：界面固定深色，打开即进入收件箱。移除创建邮箱、未知收件人、AI 设置、邮件 Webhook、Webhook 设置、数据库管理、Worker 配置、外观、管理员账号和关于页面；保留访问密码与 Turnstile 防护。版本显示在页脚，统计仅显示收信、发信和邮箱总数。

域名内地址无需提前创建即可收信：旧的“未创建邮箱拒收”设置不再参与收信处理。邮箱列表通过 `GET /admin/address?include_received=1` 合并已登记、已收信和已发信地址，不会写入邮箱记录；默认接口行为仍兼容现有客户端。验证码统一使用本地规则，前端也可从历史正文提取，不调用 Cloudflare AI 或自定义 AI 服务。旧提取元数据仍可读。

已移除 `/admin/new_address`、`/admin/mails_unknow`、`/admin/worker/configs`、`/admin/ai_extract/*`、`/admin/mail_webhook/*`、`/admin/webhook/*`、`/api/webhook/*` 和邮件 Webhook 附件下载入口。Telegram 自身的 Webhook 属于机器人收消息通道，仍保留；邮件发送、邮箱凭据 API、数据库初始化/升级、存储迁移与预算保护接口仍供既有客户端和运维使用。现有 D1、KV、密钥及配置值不被删除。

复查后删除无人消费的 `/admin/config` 通用键值读写接口和已失效的邮箱自动登录链接；邮箱 JWT 凭据、SMTP/IMAP 接入与收发邮件 API 仍保留。后台已读状态使用 `/admin/mails/:id/read`（PATCH），与邮箱凭据接口共享状态更新逻辑，但授权边界分开。

验证码规则位于 `app/shared/verification-code.ts`，是浏览器与 Worker 的无依赖公共模块；前端不再导入 Worker 源码或依赖。Telegram 邮件阅读也复用默认禁图的安全阅读器。未完成的 KV/D1 导入、历史邮件格式及旧通知数据读取仍保留，不能当作无用兼容删掉。

The audit also removes the unused `/admin/config` key-value API and broken mailbox auto-login links; mailbox JWT credentials, SMTP/IMAP access and mail APIs remain. Admin read status uses `PATCH /admin/mails/:id/read` with shared update logic and separate authorization. Dependency-free verification rules live in `app/shared/verification-code.ts`, with no frontend imports from Worker source. Telegram reuses the private reader. Unfinished KV/D1 imports and historical mail/notification data paths remain intact.

**English**: The dark-only UI always opens Inbox. Removed pages: mailbox creation, unknown recipients, AI settings, mail Webhook, Webhook settings, database management, Worker config, appearance, admin account and About. Password/Turnstile protection stays. The footer watermarks the version; statistics show only received mail, sent mail and mailbox totals.

Domain addresses receive without creation: the legacy reject-unregistered setting no longer gates inbound delivery. `GET /admin/address?include_received=1` lists registered, received and sent addresses without inserting mailbox records; the default endpoint remains compatible with existing clients. Local rules extract codes in the Worker and historical frontend messages without external AI calls, preserving stored metadata compatibility.

The endpoints listed above are removed. Telegram's own inbound Webhook, sending/mailbox-credential APIs, D1 initialization/migrations, storage imports and budget guards remain operational dependencies. No existing D1/KV data, secrets or configuration values are deleted.

**中文**：后台账号设置中的全局发件人黑名单继续按关键词拦截所有邮箱的来信。“邮箱级域名拉黑”仅对指定收件邮箱生效，匹配信封发件人或 From 头中的域名及其子域名；域名前可带 `@`。“停用邮箱”拒收所有来信并禁止该邮箱发信。邮箱和域名均忽略大小写与首尾空格。

**English**: In admin Account Settings, the global sender blacklist continues to reject matching sender keywords for every mailbox. Mailbox-specific domain rules reject envelope or From-header sender domains and their subdomains only for the specified recipient; a leading `@` is optional. Disabled mailboxes reject all inbound mail and cannot send. Addresses and domains are case-insensitive and trimmed.

`GET/POST /admin/account_settings` 使用 / uses `mailboxDomainBlockList: [{ address, domain }]` 和 / and `blockedMailboxList: [address]`. POST 仅更新传入的数组，空数组清空对应规则，无效条目会丢弃；两者共用一个 `worker_store` 键 `email_mailbox_block_rules`，每封来信仅额外读取一次设置。 / POST updates only supplied arrays; empty arrays clear that list and invalid entries are discarded. Both lists share the `worker_store` key `email_mailbox_block_rules`, requiring only one extra settings read per inbound message.

## 免费套餐：D1 预算、定时任务和 KV 迁移 / Free plan: D1 budgets, cron and KV migration

| Worker 变量 / Variable | 默认值 / Default |
| --- | ---: |
| `D1_DAILY_READ_SOFT_LIMIT` | 4,000,000 |
| `D1_DAILY_WRITE_SOFT_LIMIT` | 80,000 |
| `D1_DAILY_READ_HARD_LIMIT` | 4,750,000 |
| `D1_DAILY_WRITE_HARD_LIMIT` | 95,000 |

**中文**

- 预算按 UTC 日期计算，统计本 Worker 预留的 D1 读写行数与获准处理的收信次数，不是 Cloudflare 实际用量。批量清理、自定义 SQL、索引和其他开销可使实际用量与估算不同。建议给本 Worker 单独使用一个 Free 账号及 D1 数据库；预算看不到同账号其他 Worker，也不限制账号级请求数。Cloudflare Free 原生限额是最终兜底。
- 软预算用尽后，暂停定时任务和普通 API 操作（HTTP 503），优先保存原始邮件；该阶段来信会跳过快照刷新、通知、Webhook 等附加处理，这些操作不会补跑。只有硬预算不足以保存邮件或 D1 不可用时才拒收。管理员可用 `GET /admin/storage_status` 查看预算。
- 定时任务每 5 分钟检查一次；清理间隔最短 5 分钟，旧的 1–4 分钟设置按 5 分钟执行。任务按距上次执行的时间判断是否到期，并在下一个可用的触发点执行。
- 新安装用 `POST /admin/db_initialize` 初始化 D1，无需绑定 KV。升级已有部署时，保留原 `KV` 绑定并运行 `POST /admin/db_migration`。Cron 每次处理一小批，管理员也可调用 `POST /admin/storage_import` 处理下一批。迁移会保存游标，旧值在迁移完成前仍可读取。仅在 `GET /admin/storage_status` 同时返回 `kvBound: true` 和 `kvMigrationComplete: true` 后移除 KV 绑定。

**English**

- Budgets reset on UTC day boundaries and count estimated D1 rows reserved for this Worker and the inbound attempts admitted, not Cloudflare-metered usage. Bulk cleanup, custom SQL, indexes and other overhead can differ from the estimates. Use a dedicated Free account and D1 database for this Worker if possible: this guard cannot see other Workers' usage or cap account-wide request volume. Cloudflare Free's native limits are the final backstop.
- When the soft budget runs out, cron and ordinary APIs pause (HTTP 503 for APIs) so inbound raw mail can still be saved. Snapshot refreshes, notifications, webhooks and other optional processing skipped for those messages are not replayed. Inbound mail is rejected last, when the hard budget cannot admit it or D1 is unavailable. Admins can inspect the budget with `GET /admin/storage_status`.
- Cron checks every five minutes. Cleanup intervals are at least five minutes; existing 1–4 minute values are treated as five. Intervals use elapsed time, with work running at the next available tick.
- On fresh installs, use `POST /admin/db_initialize`; no KV binding is needed. On upgrades, keep the original `KV` binding and run `POST /admin/db_migration`. Cron imports one small batch per tick; admins can also call `POST /admin/storage_import` for the next batch. The cursor is stored in D1 and legacy reads remain available until import completes. Remove the KV binding only after `GET /admin/storage_status` reports both `kvBound: true` and `kvMigrationComplete: true`.

## 网页防刷规则 / Editable abuse protection

在管理员的“防刷与访问控制”页使用“收信与快照防刷”，修改后点击独立的保存按钮。设置储存在现有 D1 settings 表，不需要新增绑定或环境变量。其他 Worker 实例最多 30 秒后读取新设置。

| 字段 / Field | 默认 / Default | 范围 / Range |
| --- | ---: | ---: |
| inboundEnabled | true | boolean |
| inboundWindowMinutes | 10 分钟 / minutes | 1–1440 |
| inboundPairLimit | 10 封 / messages | 1–10000 |
| inboundSenderLimit | 100 封 / messages | 1–100000 |
| inboundBanMinutes | 10 分钟 / minutes | 1–10080 |
| snapshotEnabled | true | boolean |
| snapshotWindowSeconds | 60 秒 / seconds | 1–3600 |
| snapshotLimit | 60 次 / requests | 1–10000 |
| snapshotBanMinutes | 10 分钟 / minutes | 1–10080 |

**中文**

- 收信按 SMTP 信封发件地址（不是邮件正文的 From）和收件邮箱计数，从首次请求起算固定窗口，不是逐封滑动窗口。默认前十封允许，第十一封拒收并临时封禁该发件人向本站所有邮箱投递；跨邮箱总量限制用于减少换收件人绕过。空信封退信不计数。封禁到期后仍受当前窗口限制，手动关闭限流后自动封禁也暂停执行。
- 快照按 Cloudflare 提供的客户端 IP 合并所有 /m/ 链接的 GET/HEAD 请求计数，超限返回 429 和 Retry-After。共用出口 IP 的用户共用限额。计数先预留应用预算；已封禁重试不再写入计数或预算，但仍消耗 Worker 请求，并可能读取 D1。切换实例、规则、发件人或 IP 仍有额外开销；这不是账号级防护或 Cloudflare WAF 的替代。
- 限流在正常与只存信模式都执行，防护存储故障时暂停收信/快照以避免绕过。修改窗口会使用新的计数键；现有发件人封禁在开启限流期间保持到期。
- GET /admin/abuse_protection 返回以上完整对象；POST 相同路径必须传入全部字段，布尔和整数范围严格校验，无效请求返回 400 且不保存。现有站点和管理员认证均适用。
- Telegram 来信推送只需机器人 Token 和接收 ID，不依赖 webhook。只有让机器人接收命令或使用 Telegram 内的交互功能才需要回调。高级设置支持按机器人查看、注册和关闭：GET/POST/DELETE /admin/notify/telegram_bots/:id/webhook；关闭只注销回调，不删除机器人、推送配置或待处理更新。默认机器人新注册使用 /telegram/webhook，同时兼容现有 /telegram/webhook/env。已注册不代表命令近期有使用，需用户自行决定是否关闭。
- 新计数器带来读写开销。完整收信每次按 57 读、15 写预留，只存信按 25 读、10 写预留；快照防刷每 16 次预留 833 读、65 写，实例提前退出会浪费剩余预留。它们是保守预算参数，不是 D1 实际计量，也不能保证每封固定成本。按默认预算且无其他操作的理想计算，约 5333 封完整处理后再接收约 1500 封只存信；仅快照访问约 19680 次会耗尽软写预算。后台、清理、索引、邮件大小、通知数量以及同账号其他资源会影响实际容量；拒收/拒绝请求也可能耗费读取和调用。

**English**

Use the independent save button under inbound and snapshot abuse protection on the admin abuse protection and access page. Settings use the existing D1 settings table; no new bindings or environment variables are required. Other isolates may retain the previous configuration for up to 30 seconds.

- Inbound limits use the SMTP envelope sender and normalized recipient, with a fixed window anchored at first use. The default allows ten messages; the eleventh rejects and temporarily bans the sender across all local mailboxes. A separate sender-wide ceiling limits mailbox rotation. Empty envelope delivery reports are exempt. Expired bans remain subject to the current window; disabling protection also suspends automatic bans.
- Snapshot GET/HEAD requests share a counter across all /m/ tokens per Cloudflare client IP. Excess returns 429 with Retry-After. Shared-IP users share the limit. Reserve the application budget before writing counters. Banned retries do not write counters or the ledger, but still invoke the Worker and may read D1. Rotating senders/IPs or isolates still consumes resources; this does not replace account-level protection or a WAF.
- Enforce inbound protection even in receive-only mode and fail closed on protection storage errors. Window changes create new counter keys. Existing sender bans last until expiry while protection remains enabled.
- GET /admin/abuse_protection returns the complete object above. POST requires every field and validates booleans and integer ranges; invalid requests return 400 without saving. Existing site/admin authentication applies.
- Telegram mail push needs a bot token and receiver IDs; webhook registration is only needed for incoming bot commands and interactive Telegram features. Advanced settings use GET/POST/DELETE /admin/notify/telegram_bots/:id/webhook for status, registration and removal. Removal preserves bot/push configuration and pending updates. New default registrations use /telegram/webhook; existing /telegram/webhook/env remains supported. Registration alone does not establish active command use.
- Budget reservations are estimates, not metered D1 rows: full inbound 57 reads/15 writes, receive-only 25/10, protected snapshots 833/65 per sixteen requests. Unused leases are not refunded. With default budgets and no competing activity, the arithmetic permits about 5333 full inbound attempts followed by 1500 receive-only attempts, or about 19680 snapshot attempts at the soft write limit. Indexes, cleanup, message sizes, notifications, other account activity and rejected requests affect actual capacity.
