---
name: email-simulation-test
description: Simulate a real incoming email end-to-end (triggering Telegram/Bark push notifications and snapshot generation) by temporarily adding a test HTTP endpoint to the worker, deploying, triggering, then removing the endpoint and redeploying clean. Use when you need to verify the full mail-receiving pipeline without waiting for a real SMTP email. NEVER leave the test endpoint in production.
---

# Email Simulation Test (模拟收信全链路测试)

## 原理

直接往 D1/KV 写数据只能模拟数据层，**不会触发** TG/Bark 推送。推送只在 worker 的 `email()` handler 被 Cloudflare Email Routing 调用时触发。

正确方法是：临时加一个 HTTP 测试接口，直接调用 worker 内部的 `refreshBoundSnapshot` + `sendMailNotifications`，和真实收信走完全相同的代码路径。测试完必须删除接口并重新部署干净版本。

## 前置条件

- 本地仓库：`~/workspace/github/cloudflare_temp_email/cloudflare-temp-email`
- 部署工具：`~/workspace/cf-worker/deploy.py`（部署的是 `~/workspace/cf-worker/worker_new.js`）
- Cloudflare API 凭证（`custom.cloudflare`）
- **红线**：TG 推送是红线，测试不得影响正常推送；生产环境绝不留测试后门

## 步骤

### 1. 加临时接口（`app/worker/src/worker.ts`）

imports 增加：
```typescript
import { refreshBoundSnapshot } from './telegram_api/mail_snapshot.ts';
import { sendMailNotifications } from './telegram_api/index.ts';
```

密码检查加白名单（约 60 行）：
```typescript
// 在条件中加：&& !c.req.path.startsWith("/test-simulate-email")
if (!c.req.path.startsWith("/open_api") && !c.req.path.startsWith("/telegram/") && !c.req.path.startsWith("/m/") && !c.req.path.startsWith("/test-simulate-email") && passwords && passwords.length > 0) {
```

health_check 后加接口：
```typescript
// TEMP-TEST: 模拟收信测试接口，测试完必须删除
app.get('/test-simulate-email', async c => {
    const address = c.req.query('address') || 'test-sim@looo.cloud';
    const marker = c.req.query('marker') || 'SIM-' + Date.now();
    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"></head><body><p>${marker}</p></body></html>`;
    const parsedEmailContext = {
        rawEmail: `From: simtest@example.com\r\nTo: ${address}\r\nSubject: 模拟测试\r\n\r\n${marker}`,
        parsedEmail: { html, text: marker, subject: '模拟测试', sender: 'simtest@example.com' },
    };
    const snapshotUrl = await refreshBoundSnapshot(c as any, address, parsedEmailContext as any);
    await sendMailNotifications(c as any, address, parsedEmailContext as any, null, null);
    return c.json({ ok: true, address, marker, snapshotUrl });
});
// TEMP-TEST END
```

**注意**：测试地址用 `test-xxx@looo.cloud`，不要污染生产数据。`snapshotUrl` 为 null 是正常的（测试地址没有绑定快照）。

### 2. 构建并部署

```bash
cd ~/workspace/github/cloudflare_temp_email/cloudflare-temp-email/worker
npx wrangler deploy --dry-run --outdir /tmp/wdist --minify
cp /tmp/wdist/worker.js ~/workspace/cf-worker/worker_new.js
cd ~/workspace/cf-worker
python3 deploy.py
```

deploy.py 会自动备份线上版本 + 检查 bindings 漂移（必须 16 项）。

### 3. 触发测试

```bash
MARKER="SIM-$(date +%s)"
curl -sk "https://api.ciaooo55.de5.net/test-simulate-email?address=test-sim@looo.cloud&marker=$MARKER"
# 返回 {"ok":true,...} 即触发成功，手机应收到 TG/Bark 推送
```

### 4. 删除接口并重新部署干净版本

把第 1 步加的三处代码全部删掉，确认：
```bash
grep -c "test-simulate-email\|TEMP-TEST" app/worker/src/worker.ts
# 必须返回 0
```

然后重复第 2 步的构建部署流程。

### 5. 确认生产无残留

```bash
curl -sk "https://api.ciaooo55.de5.net/test-simulate-email?marker=verify-gone"
# 应返回 {"code":"AUTH_SITE_PASSWORD_INVALID",...}（401）
# 如果还返回 {"ok":true}，说明边缘缓存未同步，等 1-2 分钟再验
```

## 踩坑记录（2026-10-10 实战）

1. **`/tmp` 是 512M tmpfs**：不要用 `cp -r` 把整个仓库（含 node_modules）备份到 /tmp，会写满导致 wrangler 构建报 `ENOSPC`。deploy.py 自带线上版本备份，足够用；真要全量备份放 `~/workspace/`。
2. **边缘缓存延迟**：部署干净版本后，测试接口可能还响应 `{"ok":true}` 几分钟。用全新 marker 验证——如果返回的 marker 对不上你发的，说明是缓存，等 1-2 分钟再验。
3. **先验证再宣布**：`grep` 确认源码无残留 → 部署 → curl 确认接口 401，三步都过才算清理完成。

## 注意事项

- 测试完必须删除接口，生产环境不留测试后门
- `marker` 用唯一值（如时间戳），便于验证
- 测试数据（raw_mails 等）测试后手动清理
