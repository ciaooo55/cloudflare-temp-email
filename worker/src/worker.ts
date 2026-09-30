import { Context, Hono } from 'hono'
import { cors } from 'hono/cors';
import { Jwt } from 'hono/utils/jwt'
import { addressJwtAuth } from './address_auth.ts';

import { api as commonApi } from './commom_api.ts';
import { api as openAuthApi } from './open_api/auth.ts';
import { api as mailsApi } from './mails_api/index.ts'
import { api as adminApi } from './admin_api/index.ts';
import { api as apiSendMail } from './mails_api/send_mail_api.ts'
import { snapshotBindKey, snapshotBindRevKey, sanitizeSnapshotHtml, deleteSnapshotBinding, SNAPSHOT_BIND_DELETED, SNAPSHOT_KV_EDGE_TTL } from './telegram_api/mail_snapshot.ts';
import { getBoundSnapshotCacheConfig, boundSnapshotCacheControl } from './admin_api/notify_settings.ts';
import { api as telegramApi } from './telegram_api/index.ts'

import i18n from './i18n/index.ts';
import { ErrorCode } from './error_codes.ts';
import { email } from './email/index.ts';
import { scheduled } from './scheduled.ts';
import { getPasswords, getBooleanValue, getDomains, checkIsAdmin, getEnvStringList } from './utils.ts';
import { checkAccessControl } from './ip_blacklist.ts';

const API_PATHS = [
	"/api/",
	"/open_api/",
	"/admin/",
	"/telegram/",
	"/external/",
	"/m/",
];

const app = new Hono<HonoCustomType>()
//cors
app.use('/*', cors());
// error handler
app.onError((err, c) => {
	console.error(err)
	return c.json({ code: ErrorCode.INTERNAL_SERVER_ERROR, message: `${err.name} ${err.message}` }, 500)
})
// global middlewares
app.use('/*', async (c, next) => {

	// check if the request is for static files
	if (c.env.ASSETS && !API_PATHS.some(path => c.req.path.startsWith(path))) {
		const url = new URL(c.req.raw.url);
		if (!url.pathname.includes('.')) {
			url.pathname = ""
		}
		return c.env.ASSETS.fetch(url);
	}

	// save language in context
	const lang = c.req.raw.headers.get("x-lang");
	if (lang) { c.set("lang", lang); }
	const msgs = i18n.getMessages(lang || c.env.DEFAULT_LANG);

	// check header x-custom-auth
	const passwords = getPasswords(c);
	if (!c.req.path.startsWith("/open_api") && !c.req.path.startsWith("/telegram/") && !c.req.path.startsWith("/m/") && passwords && passwords.length > 0) {
		const auth = c.req.raw.headers.get("x-custom-auth");
		if (!auth || !passwords.includes(auth)) {
			return c.json({ code: ErrorCode.AUTH_SITE_PASSWORD_INVALID, message: msgs.CustomAuthPasswordMsg }, 401)
		}
	}

	// rate limit for specific endpoints
	if (
		c.req.path.startsWith("/api/new_address")
		|| c.req.path.startsWith("/api/send_mail")
		|| c.req.path.startsWith("/external/api/send_mail")
	) {
		const reqIp = c.req.raw.headers.get("cf-connecting-ip")
		if (reqIp && c.env.RATE_LIMITER) {
			const { success } = await c.env.RATE_LIMITER.limit(
				{ key: `${c.req.path}|${reqIp}` }
			)
			if (!success) {
				return c.text(`IP=${reqIp} Rate limit exceeded for ${c.req.path}`, 429)
			}
		}
		// Check access control (blacklist and daily limit)
		const accessControlResponse = await checkAccessControl(c);
		if (accessControlResponse) {
			return accessControlResponse;
		}
	}
	// webhook check
	if (
		c.req.path.startsWith("/api/webhook")
		|| c.req.path.startsWith("/admin/webhook")
		|| c.req.path.startsWith("/admin/mail_webhook")
	) {
		if (!c.env.KV) {
			return c.text(msgs.KVNotAvailableMsg, 400);
		}
		if (!getBooleanValue(c.env.ENABLE_WEBHOOK)) {
			return c.text(msgs.WebhookNotEnabledMsg, 403);
		}
	}
	if (!c.env.DB) {
		return c.text(msgs.DBNotAvailableMsg, 400);
	}
	if (!c.env.JWT_SECRET) {
		return c.text(msgs.JWTSecretNotSetMsg, 400);
	}
	await next()
});

const checkUserPayload = async (
	c: Context<HonoCustomType>
): Promise<void> => {
	try {
		const token = c.req.raw.headers.get("x-user-token");
		if (!token) return;
		const payload = await Jwt.verify(token, c.env.JWT_SECRET, "HS256");
		// check expired
		if (!payload.exp) return;
		// exp is in seconds
		if (payload.exp < Math.floor(Date.now() / 1000)) {
			return;
		}
		c.set("userPayload", payload as UserPayload);
	} catch (e) {
		console.error(e);
	}
}

const checkoutUserRolePayload = async (
	c: Context<HonoCustomType>,
	userId?: number
): Promise<Response | void> => {
	try {
		const token = c.req.raw.headers.get("x-user-access-token");
		if (!token) return;
		const payload = await Jwt.verify(token, c.env.JWT_SECRET, { alg: "HS256", exp: false });
		// check expired
		if (!payload.exp) return;
		// exp is in seconds
		if (payload.exp < Math.floor(Date.now() / 1000)) {
			return c.json({ code: ErrorCode.AUTH_USER_ACCESS_TOKEN_EXPIRED, message: i18n.getMessagesbyContext(c).UserAcceesTokenExpiredMsg }, 401);
		}
		if (typeof payload?.user_role !== "string") return;
		if (userId !== undefined && payload.user_id !== userId) return;
		c.set("userRolePayload", payload.user_role);
	} catch (e) {
		console.error(e);
	}
}

// api auth
app.use('/api/*', async (c, next) => {
	if (c.req.path.startsWith("/api/new_address")) {
		await checkUserPayload(c);
		await next();
		return;
	}
	if (c.req.path.startsWith("/api/settings")
		|| c.req.path.startsWith("/api/send_mail")
	) {
		const response = await checkoutUserRolePayload(c);
		if (response) return response;
	}
	if (c.req.path.startsWith("/api/address_login")) {
		await next();
		return;
	}

	try {
		return await addressJwtAuth(c, next);
	} catch (e) {
		console.warn(e);
		const lang = c.get("lang") || c.env.DEFAULT_LANG;
		const msgs = i18n.getMessages(lang);
		return c.text(msgs.InvalidAddressCredentialMsg, 401)
	}
});
// admin auth
app.use('/admin/*', async (c, next) => {
	const lang = c.req.raw.headers.get("x-lang") || c.env.DEFAULT_LANG;
	const msgs = i18n.getMessages(lang);
	try {
		const ipWhitelist = getEnvStringList(c.env.ADMIN_API_IP_WHITELIST)
			.filter(ip => typeof ip === "string")
			.map(ip => ip.trim())
			.filter(Boolean);
		if (ipWhitelist.length > 0) {
			const reqIp = c.req.raw.headers.get("cf-connecting-ip")?.trim();
			if (!reqIp || !ipWhitelist.includes(reqIp)) {
				return c.text(msgs.AdminApiIpNotAllowedMsg, 403);
			}
		}
	} catch (e) {
		console.error("Failed to check admin API IP whitelist", e);
	}

	// check header x-admin-auth
	if (checkIsAdmin(c)) {
		await next();
		return;
	}
	// disable admin api check
	if (getBooleanValue(c.env.DISABLE_ADMIN_PASSWORD_CHECK)) {
		await next();
		return;
	}

	return c.json({ code: ErrorCode.AUTH_ADMIN_CREDENTIAL_INVALID, message: msgs.NeedAdminPasswordMsg }, 401)
});


app.route('/', commonApi)
app.route('/', openAuthApi)
app.route('/', mailsApi)
app.route('/', adminApi)
app.route('/', apiSendMail)
app.route('/', telegramApi)

const health_check = async (c: Context<HonoCustomType>) => {
	const lang = c.req.raw.headers.get("x-lang") || c.env.DEFAULT_LANG;
	const msgs = i18n.getMessages(lang);
	if (!c.env.DB) {
		return c.text(msgs.DBNotAvailableMsg, 400);
	}
	if (!c.env.JWT_SECRET) {
		return c.text(msgs.JWTSecretNotSetMsg, 400);
	}
	if (getDomains(c).length === 0) {
		return c.text(msgs.DomainsNotSetMsg, 400);
	}
	return c.text("OK");
}

app.get('/', health_check)
app.get('/health_check', health_check)
app.get('/m/:token', async c => {
	const token = c.req.param('token');
	if (!/^[0-9a-f]{64}$/.test(token || '')) return c.text('Not Found', 404);
	// 绑定快照边缘缓存配置（网页可调，默认关闭=实时读取）：
	// 关闭时跳过 caches.default，KV 写入会直接失效各 PoP 的 KV 边缘缓存，
	// 因此新邮件秒级可见、更换链接秒级失效；开启时按所选挡位缓存。
	const boundCacheCfg = await getBoundSnapshotCacheConfig(c).catch(() => ({ enabled: false, ttlSeconds: 10 }));
	const useEdgeCache = boundCacheCfg.enabled;
	// 边缘缓存防刷：同一快照的重复访问优先走边缘缓存，减少 KV 读取与页面重复生成
	// 注意：请求仍会进入 Worker（按正常请求计费）；Cache API 按 PoP 独立缓存
	const cache: Cache | null = useEdgeCache ? caches.default : null;
	const cacheKey = new Request(c.req.url, { method: 'GET' });
	// 先校验绑定有效性，再查边缘缓存：
	// 更换/失效链接后旧链接必须立即 404，不能继续 serving 边缘缓存里的旧页面。
	// 注意 caches.default 按 PoP 独立，删除时的 purge 到不了用户所在的 PoP，
	// 所以必须在 serve 缓存之前先确认绑定仍然有效。
	let isBoundSnapshot = false;
	if (c.env.KV) {
		try {
			const boundAddr = await c.env.KV.get(snapshotBindRevKey(token), { cacheTtl: SNAPSHOT_KV_EDGE_TTL });
			if (boundAddr === SNAPSHOT_BIND_DELETED) {
				// 链接已被更换/失效/删除：直接 404，并清掉本 PoP 可能残留的旧缓存。
				// 注意不能 fallback 到查缓存，否则各 PoP 边缘缓存里的旧页面会被继续 serving。
				try { if (cache) await cache.delete(cacheKey); } catch { /* ignore */ }
				return c.text('该快照链接已失效', 404);
			}
			if (boundAddr) {
				const binding = await c.env.KV.get<{ expiresAt: number }>(snapshotBindKey(boundAddr), { type: "json", cacheTtl: SNAPSHOT_KV_EDGE_TTL });
				if (!binding || binding.expiresAt <= Date.now()) {
					await deleteSnapshotBinding(c, boundAddr, token).catch(() => {});
					try { if (cache) await cache.delete(cacheKey); } catch { /* ignore */ }
					return c.text('该快照绑定已到期', 404);
				}
				isBoundSnapshot = true;
			}
		} catch (error) {
			console.error('snapshot binding check failed', error);
		}
	}
	if (cache) {
		try {
			const cached = await cache.match(cacheKey);
			if (cached) return cached;
		} catch { /* cache miss, continue */ }
	}
	// 快照-邮箱绑定：绑定过期后快照链接失效（有效性已在上面校验，这里只读内容）
	let html: string | null = null;
	try {
		html = c.env.KV ? await c.env.KV.get(`mailhtml:${token}`, { cacheTtl: SNAPSHOT_KV_EDGE_TTL }) : null;
	} catch (error) {
		console.error('snapshot fetch failed', error);
	}
	if (!html) return c.text('邮件已过期或不存在', 404);
	// 读取时二次消毒：存量快照可能是旧版消毒器生成的，新版规则在此处同样生效（纵深防御）
	// 消毒失败则拒绝展示：fail-open 会直接返回未消毒的原始 HTML
	try {
		html = sanitizeSnapshotHtml(html);
	} catch (error) {
		console.error('snapshot sanitize failed', error);
		return c.text('邮件快照处理失败', 500);
	}
	// 绑定的快照内容随新邮件更新：网页开关默认关闭=实时读取（no-store，新邮件秒级可见）；
	// 开关开启时按所选时间挡位缓存。一次性快照内容不变，始终长缓存抗刷。
	const cacheControl = isBoundSnapshot ? boundSnapshotCacheControl(boundCacheCfg) : 'public, max-age=86400';
	const response = new Response(html, {
		headers: {
			'Content-Type': 'text/html;charset=utf-8',
			'Content-Security-Policy': "default-src 'none'; img-src http: https: data:; style-src 'unsafe-inline'; font-src http: https: data:",
			'X-Content-Type-Options': 'nosniff',
			'X-Robots-Tag': 'noindex, nofollow',
			'Cache-Control': cacheControl,
		},
	});
	// 写入边缘缓存（不等待，避免阻塞响应）；开关关闭时不写
	if (cache) {
		try {
			c.executionCtx.waitUntil(cache.put(cacheKey, response.clone()));
		} catch { /* cache put failed, serve directly */ }
	}
	return response;
});
app.all('/*', async c => c.text("Not Found", 404))


export default {
	fetch: app.fetch,
	email: email,
	scheduled: scheduled,
}
