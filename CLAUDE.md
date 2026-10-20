# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Structure

- **Backend**: `app/worker/` — Cloudflare Workers API using Hono framework. Entry: `app/worker/src/worker.ts`, APIs under `app/worker/src/*_api/`.
- **Frontend**: `app/frontend/` — Vue 3 + Naive UI app deployed to Cloudflare Pages. Routes in `app/frontend/src/router/`.
- **Bridge**: `bridge/` — Cross-account email forwarding worker (HMAC-signed).
- **Skills & Tests**: `skills-test/` — `skills/` (AI agent skills), `e2e/` (Playwright tests), `scripts/` (utility scripts).
- **Changelogs**: `CHANGELOG.md` (中文) + `CHANGELOG_EN.md` (English).

## Build & Dev Commands

Run inside each subfolder with `pnpm`:

| Folder | Dev | Build | Lint | Deploy |
|--------|-----|-------|------|--------|
| `app/worker/` | `pnpm dev` | `pnpm build` | `pnpm lint` | via `~/workspace/cf-worker/deploy.py` (not `pnpm deploy`) |
| `app/frontend/` | `pnpm dev` | `pnpm build` | — | Cloudflare Pages auto-deploy on push to main |

## E2E Tests

Tests run in Docker Compose with Playwright. From `skills-test/e2e/`:

```bash
npm test              # Build, run all tests, exit
npm run test:down     # Clean up containers
```

Test categories: `tests/api/` (API tests), `tests/browser/` (UI tests with Chromium), `tests/smtp-proxy/` (SMTP/IMAP proxy tests).

The Docker frontend serves over **HTTPS** (self-signed cert) with Vite proxy to worker — required for WebAuthn (`navigator.credentials`) and `crypto.subtle` which need a secure context. Browser tests use `ignoreHTTPSErrors: true`.

Key patterns for browser tests:
- Frontend hashes passwords with SHA-256 (`crypto.subtle`) before sending — API test registration must use pre-hashed passwords if UI login is needed.
- VueUse `useStorage('key', '')` with string default uses **raw string** serialization — set localStorage with raw value, not `JSON.stringify()`.
- WebAuthn browser tests use CDP virtual authenticator (`WebAuthn.enable` + `WebAuthn.addVirtualAuthenticator`).

## Architecture

### Worker Auth Flow (`app/worker/src/worker.ts`)

Three auth layers applied via Hono middleware, each using different headers:

| Path prefix | Header | Purpose |
|-------------|--------|---------|
| `/api/*` | `Authorization: Bearer <jwt>` | Address (mailbox) credential |
| `/admin/*` | `x-admin-auth` | Admin password |
| (any) | `x-custom-auth` | Optional global access password |
| (any) | `x-lang` | Language preference (`en`/`zh`) |

Public endpoints (no auth): `/open_api/*`. Multi-user system removed — admin-only now.

### Worker Email Flow (`app/worker/src/email/`)

Cloudflare Email Worker entry: `email()` in `app/worker/src/email/index.ts`. Processing pipeline:
1. Parse raw email → check junk → check address exists
2. Auto-reply if configured → forward if configured → webhook if enabled
3. Store in D1 database

### Frontend State (`app/frontend/src/store/index.js`, `app/frontend/src/api/index.js`)

Global state via VueUse `useStorage` for persistence. The `api` module wraps axios with auto-attached auth headers and fingerprinting. API base URL comes from `VITE_API_BASE` env var (empty = same origin).

## Coding Style

- `app/worker/` uses TypeScript + ESLint; `app/frontend/` uses Vue SFCs.
- Keep existing naming patterns: `*_api/` folders, `utils/`, `models/`.
- ESM imports only (`type: module`).

## Commits & PRs

- Use Conventional Commits: `feat:`, `fix:`, `docs:`, `style:`, `refactor:`, `perf:`.
- PRs should explain scope; add screenshots for UI changes.
- Use squash merge for PRs.

## Post-Task Checklist (IMPORTANT)

After completing any feature, bug fix, or improvement, **always check**:

1. **CHANGELOG.md** (中文) and **CHANGELOG_EN.md** (English) — both must be updated under the current `(main)` version section with the change entry. Follow the existing format: `- feat/fix/docs: |模块| 描述`.
2. **Documentation** — if the change involves new environment variables, new API endpoints, or configuration changes, update the corresponding docs (`app/README.md`, `bridge/README.md`). Key files:
   - `app/worker/wrangler.toml.template` — Worker environment variables and bindings reference
   - `app/frontend/` — Frontend build/deploy notes
3. **Both languages** — docs and changelogs exist in Chinese and English; always update both.

## Config

- Worker settings deploy via wrangler using `app/worker/wrangler.toml` (see `wrangler.toml.template` for bindings).
- Frontend uses `VITE_*` env vars. Don't commit secrets.
