# 项目本体

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
