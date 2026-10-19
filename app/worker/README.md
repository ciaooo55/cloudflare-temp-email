# 后端 Worker

Cloudflare 临时邮箱的后端服务，跑在 Cloudflare Workers 上。

## 做什么的

- 接收邮件（Cloudflare Email Routing 转过来）
- 解析邮件（验证码提取、附件处理）
- 提供 API 给前端（收件箱、发信、管理后台）
- Telegram / Bark 消息推送
- 定时清理过期邮件（cron 触发）

## 在项目中的作用

核心数据处理层。`bridge/` 转发的邮件由它接收验签后入库，用户通过 `frontend/` 调它的 API 查看邮件。

## 怎么用

本地开发/构建在 `app/worker/` 下用 pnpm：

```sh
pnpm install
pnpm dev      # 本地开发
pnpm build    # 构建
```

**部署**：不要用 `pnpm deploy`，也不要用 GitHub Actions。统一走本地 `~/workspace/cf-worker/deploy.py`（会自动备份线上版本、检查配置漂移）。
