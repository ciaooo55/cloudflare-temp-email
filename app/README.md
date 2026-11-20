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
