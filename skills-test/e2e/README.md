# E2E Tests

End-to-end tests for Cloudflare Temp Email using [Playwright](https://playwright.dev/) and [Mailpit](https://mailpit.axllent.org/), fully containerized with Docker Compose.

## Prerequisites

- **Docker** and **Docker Compose**

## Current scope / 当前范围

The fixtures use the repository’s `app/worker`, `app/frontend` and dependency-free `app/shared` layout. Browser scenarios target the admin workspace, not the removed public mailbox UI. Verification-rule regressions run in `app/worker` with `pnpm test`.

SMTP/IMAP proxy servers are not shipped in this repository. Protocol tests are opt-in: provide `SMTP_PROXY_HOST` (and ports; TLS tests additionally need `SMTP_PROXY_TLS_HOST`) for an external test server. The default Compose run no longer builds a missing `smtp_proxy_server` directory.

测试按当前仓库目录及管理工作台运行；不再保留旧游客邮箱页面的浏览器用例。验证码规则回归已纳入 Worker 常规测试。SMTP/IMAP 外置服务不在本仓库内，配置上述环境变量后才执行协议测试，不影响现有凭据及邮件 API。

## Quick Start

```bash
cd skills-test/e2e

# Build, start all services, run tests, and exit
npm test

# Clean up containers and volumes
npm run test:down
```

`npm test` runs `docker compose up --build`, which:
1. Starts **Mailpit** (SMTP on :1025, HTTP API on :8025)
2. Builds and starts the **Worker** (wrangler dev on :8787)
3. Builds and starts the **Frontend** (vite dev on :5173)
4. Builds and runs the **E2E runner** (Playwright), which waits for services, initializes the DB, and runs all tests

The exit code reflects the test result.

## Test Structure

| Project | Directory | What it tests |
|---------|-----------|---------------|
| `api` | `tests/api/` | Worker API endpoints — health check, address CRUD, send mail via SMTP |
| `browser` | `tests/browser/` | Frontend UI — login, inbox view, reply with HTML, XSS sanitization |

## Services

| Service | Container | Port | Purpose |
|---------|-----------|------|---------|
| Mailpit SMTP | `mailpit` | 1025 | Captures outgoing emails |
| Mailpit HTTP | `mailpit` | 8025 | API to verify captured emails |
| Worker | `worker` | 8787 | Backend API with E2E config |
| Frontend | `frontend` | 5173 | Vue frontend dev server |

## Test Results

Test results and HTML reports are exported via volumes:
- `e2e/test-results/` — test artifacts
- `e2e/playwright-report/` — HTML report

## Configuration

The E2E worker uses `fixtures/wrangler.toml.e2e` with:
- `DISABLE_ADMIN_PASSWORD_CHECK = true` — allows unauthenticated admin calls
- `DEFAULT_SEND_BALANCE = 10` — allows sending without admin approval
- SMTP pointed at Mailpit container (`mailpit:1025`)

Test-only endpoints under `/__test/*` are registered in `e2e/fixtures/worker.ts` and are excluded from the production Worker.
