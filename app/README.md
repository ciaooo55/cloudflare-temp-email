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
