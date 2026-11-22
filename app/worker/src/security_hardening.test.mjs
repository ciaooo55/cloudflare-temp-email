import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createRequire, registerHooks } from 'node:module';
import { readFileSync } from 'node:fs';
import { createHmac } from 'node:crypto';
import { Jwt } from 'hono/utils/jwt';
import { createD1 } from '../test-loader/d1.mjs';
import { WORKER_STORE_SCHEMA } from './worker_store.ts';
import { USAGE_BUDGET_SCHEMA } from './usage_budget.ts';
import { CONSTANTS } from './constants.ts';
import { hashPassword } from './utils.ts';

const require = createRequire(import.meta.url);
const { transformSync } = createRequire(require.resolve('wrangler/package.json'))('esbuild');
const hook = registerHooks({
    resolve(specifier, context, next) {
        if (specifier === 'worker-mailer') return { shortCircuit: true,
            url: 'data:text/javascript,export class WorkerMailer { constructor(){throw new Error("SMTP is outside security tests");}}' };
        return next(specifier, context);
    },
    load(url, context, next) {
        if (url.endsWith('.ts')) return { format: 'module', shortCircuit: true,
            source: transformSync(readFileSync(new URL(url), 'utf8'), { loader: 'ts', format: 'esm' }).code };
        return next(url, context);
    },
});
const { default: worker } = await import('./worker.ts');
const { default: cleanupApi } = await import('./admin_api/cleanup_api.ts');
hook.deregister();

function fixture(t, extra = {}) {
    const DB = createD1();
    t.after(() => DB.sqlite.close());
    DB.sqlite.exec(WORKER_STORE_SCHEMA + USAGE_BUDGET_SCHEMA + `
        CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT, updated_at TEXT);
        CREATE TABLE address (id INTEGER PRIMARY KEY, name TEXT, password TEXT);
        CREATE TABLE raw_mails (id INTEGER PRIMARY KEY, address TEXT, raw TEXT);
        INSERT INTO address VALUES (1, 'alice@example.com', 'password-hash');
        INSERT INTO raw_mails VALUES (1, 'alice@example.com', 'Subject: test');
    `);
    const env = { DB, JWT_SECRET: 'existing-test-key', DEFAULT_LANG: 'en',
        ADMIN_PASSWORDS: ['admin-password'], ENABLE_ADDRESS_PASSWORD: true,
        TELEGRAM_BOT_TOKEN: '123:test', DOMAINS: ['example.com'],
        TG_BOT_INFO: JSON.stringify({ id: 123, is_bot: true, first_name: 'test', username: 'test_bot' }), ...extra };
    const request = (path, body, headers = {}, method = body === undefined ? 'GET' : 'POST') => worker.fetch(
        new Request('https://mail.example.com' + path, { method,
            headers: { 'content-type': 'application/json', 'cf-connecting-ip': '203.0.113.1', ...headers },
            ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        }), env, { waitUntil() {} });
    const setting = (key, value) => DB.sqlite.prepare('INSERT OR REPLACE INTO settings (key,value) VALUES (?,?)')
        .run(key, JSON.stringify(value));
    const store = (key, value) => DB.sqlite.prepare('INSERT OR REPLACE INTO worker_store (key,value) VALUES (?,?)')
        .run(key, value);
    return { DB, env, request, setting, store };
}

test('webhooks reject absent, empty and incorrect secrets before parsing updates; configured secrets work', async t => {
    const { request, store, setting } = fixture(t);
    for (const path of ['/telegram/webhook', '/telegram/webhook/env']) {
        assert.equal((await request(path, {})).status, 401);
        assert.equal((await request(path, {}, { 'X-Telegram-Bot-Api-Secret-Token': 'guess' })).status, 401);
    }
    store(CONSTANTS.TG_WEBHOOK_SECRET_KEY, 'stored-secret');
    for (const path of ['/telegram/webhook', '/telegram/webhook/env']) {
        assert.equal((await request(path, {})).status, 401);
        assert.equal((await request(path, {}, { 'X-Telegram-Bot-Api-Secret-Token': '' })).status, 401);
        assert.equal((await request(path, {}, { 'X-Telegram-Bot-Api-Secret-Token': 'wrong' })).status, 401);
        assert.equal((await request(path, {}, { 'X-Telegram-Bot-Api-Secret-Token': 'stored-secret' })).status, 200);
    }
    for (const secret of [undefined, '', 'bot-secret']) {
        setting(CONSTANTS.TELEGRAM_BOTS_KEY, [{ id: 'web', token: '456:test', enabled: true, webhookSecret: secret }]);
        const response = await request('/telegram/webhook/web', {}, { 'X-Telegram-Bot-Api-Secret-Token': 'bot-secret' });
        assert.equal(response.status, secret ? 200 : 401);
    }
});

test('authentication limits cover header checks and body logins before any D1 access', async t => {
    const keys = [];
    const limiter = kind => ({ async limit({ key }) { keys.push([kind, key]); return { success: false }; } });
    const { request, DB } = fixture(t, {
        AUTH_LOGIN_RATE_LIMITER: limiter('login'), AUTH_HEADER_RATE_LIMITER: limiter('header'),
    });
    const changes = DB.sqlite.prepare('SELECT total_changes() AS n').get().n;
    for (const [path, body, headers, scope] of [
        ['/admin/address', undefined, { 'x-admin-auth': 'guess' }, 'admin'],
        ['/telegram/get_mail', { mailId: 1 }, { 'x-admin-auth': 'guess' }, 'admin'],
        ['/open_api/settings', undefined, { 'x-custom-auth': 'guess' }, 'site'],
        ['/api/address_login', { email: 'alice@example.com', password: 'guess' }, {}, 'mailbox'],
        ['/open_api/admin_login', { password: 'guess' }, {}, 'admin'],
        ['/open_api/site_login', { password: 'guess' }, {}, 'site'],
    ]) {
        const response = await request(path, body, headers);
        assert.equal(response.status, 429);
        assert.equal(response.headers.get('Retry-After'), '60');
        assert.deepEqual(keys.at(-1), [path.includes('login') ? 'login' : 'header', `auth:${scope}:203.0.113.1`]);
    }
    assert.equal(DB.sqlite.prepare('SELECT total_changes() AS n').get().n, changes);
});

test('native limiter allows successful and rejected authentication and is optional', async t => {
    const { request, env } = fixture(t, { PASSWORDS: ['site-password'] });
    const allowed = { async limit() { return { success: true }; } };
    for (const [login, header] of [[undefined, undefined], [allowed, undefined], [undefined, allowed], [allowed, allowed]]) {
        env.AUTH_LOGIN_RATE_LIMITER = login;
        env.AUTH_HEADER_RATE_LIMITER = header;
        const headers = { 'x-custom-auth': 'site-password', 'x-admin-auth': 'admin-password' };
        assert.equal((await request('/admin/notify/telegram_bots', undefined, headers)).status, 200);
        assert.equal((await request('/admin/notify/telegram_bots', undefined,
            { ...headers, 'x-admin-auth': 'wrong' })).status, 401);
        assert.equal((await request('/admin/notify/telegram_bots', undefined,
            { ...headers, 'x-custom-auth': 'wrong' })).status, 401);
        assert.equal((await request('/open_api/admin_login', { password: await hashPassword('admin-password') })).status, 200);
        assert.equal((await request('/open_api/site_login', { password: await hashPassword('site-password') })).status, 200);
        assert.equal((await request('/open_api/admin_login', { password: 'wrong' })).status, 401);
        assert.equal((await request('/open_api/site_login', { password: 'wrong' })).status, 401);
    }
});

test('polling consumes only header limits while login requests use independent IP and scope keys', async t => {
    const calls = { login: [], header: [] };
    const limiter = kind => ({ async limit({ key }) { calls[kind].push(key); return { success: true }; } });
    const { request } = fixture(t, { PASSWORDS: ['site-password'],
        AUTH_LOGIN_RATE_LIMITER: limiter('login'), AUTH_HEADER_RATE_LIMITER: limiter('header') });
    const headers = { 'x-admin-auth': 'admin-password', 'x-custom-auth': 'site-password' };
    for (let i = 0; i < 40; i++) {
        assert.equal((await request('/admin/notify/telegram_bots', undefined, headers)).status, 200);
    }
    assert.deepEqual(calls.login, []);
    assert.equal(calls.header.filter(key => key === 'auth:admin:203.0.113.1').length, 40);
    assert.equal(calls.header.filter(key => key === 'auth:site:203.0.113.1').length, 40);
    calls.header.length = 0;
    for (const [path, scope, body] of [
        ['/open_api/site_login', 'site', { password: await hashPassword('site-password') }],
        ['/open_api/admin_login', 'admin', { password: await hashPassword('admin-password') }],
        ['/api/address_login', 'mailbox', { email: 'alice@example.com', password: 'password-hash' }],
    ]) {
        assert.equal((await request(path, body, { ...headers, 'cf-connecting-ip': '203.0.113.2' })).status, 200);
        assert.equal(calls.login.at(-1), `auth:${scope}:203.0.113.2`);
    }
    assert.equal(calls.login.length, 3);
    assert.deepEqual(calls.header, Array(3).fill(['auth:site:203.0.113.2', 'auth:admin:203.0.113.2']).flat());
});

test('mailbox password errors are uniform and existing password hashes and JWTs still work', async t => {
    const { request, env } = fixture(t);
    const unknown = await request('/api/address_login', { email: 'missing@example.com', password: 'wrong' });
    const wrong = await request('/api/address_login', { email: 'alice@example.com', password: 'wrong' });
    assert.equal(unknown.status, 401);
    assert.equal(wrong.status, 401);
    assert.equal(await unknown.text(), await wrong.text());
    assert.equal((await request('/api/address_login', {})).status, 400);
    const loggedIn = await request('/api/address_login', { email: 'alice@example.com', password: 'password-hash' });
    assert.equal(loggedIn.status, 200);
    const { jwt } = await loggedIn.json();
    assert.equal((await Jwt.verify(jwt, env.JWT_SECRET, 'HS256')).address_id, 1);
    const legacyJwt = await Jwt.sign({ address: 'alice@example.com', address_id: 1 }, env.JWT_SECRET, 'HS256');
    const mail = await request('/api/mail/1', undefined, { Authorization: `Bearer ${legacyJwt}` });
    assert.equal(mail.status, 200);
    assert.equal((await mail.json()).raw, 'Subject: test');
});

test('Telegram admin mail access enforces the same site password and IP policy as admin routes', async t => {
    const { request, env } = fixture(t, { PASSWORDS: ['site-password'], ADMIN_API_IP_WHITELIST: ['203.0.113.2'] });
    const headers = { 'x-admin-auth': 'admin-password', 'x-custom-auth': 'site-password' };
    for (const [path, body] of [['/admin/mails/1', undefined], ['/telegram/get_mail', { mailId: 1 }]]) {
        assert.equal((await request(path, body, headers)).status, 403);
        assert.equal((await request(path, body, { 'x-admin-auth': 'admin-password' })).status, 401);
        const allowed = await request(path, body, { ...headers, 'cf-connecting-ip': '203.0.113.2' });
        assert.equal(allowed.status, 200);
        assert.equal((await allowed.json()).raw, 'Subject: test');
    }
    env.ADMIN_API_IP_WHITELIST = [];
    assert.equal((await request('/telegram/get_mail', { mailId: 999 }, headers)).status, 404);
    assert.notEqual((await request('/telegram/get_mail', { mailId: 1 })).status, 200);
});

function initData(token, userId = 42) {
    const values = new URLSearchParams({ auth_date: String(Math.floor(Date.now() / 1000)), user: JSON.stringify({ id: userId }) });
    values.sort();
    const checked = [...values.entries()].map(([k, v]) => `${k}=${v}`).join('\n');
    const key = createHmac('sha256', 'WebAppData').update(token).digest();
    values.set('hash', createHmac('sha256', key).update(checked).digest('hex'));
    return values.toString();
}

test('Mini App rejects disabled bots and bad signatures but retains enabled, legacy and default bots', async t => {
    const { request, setting } = fixture(t);
    for (const enabled of [true, undefined, false]) {
        setting(CONSTANTS.TELEGRAM_BOTS_KEY, [{ id: 'web', token: '456:web', enabled }]);
        const response = await request('/telegram/get_bind_address', { initData: initData('456:web') });
        assert.equal(response.status, enabled === false ? 400 : 200);
        if (enabled !== false) assert.deepEqual(await response.json(), []);
    }
    assert.equal((await request('/telegram/get_bind_address', { initData: initData('123:test') })).status, 200);
    assert.equal((await request('/telegram/get_bind_address', { initData: initData('wrong') })).status, 400);
    assert.equal((await request('/telegram/get_bind_address', {})).status, 400);
});

test('placeholder JWT keys are refused and uncaught server failures do not disclose details', async t => {
    const { request, env, DB } = fixture(t);
    for (const key of ['', 'xxx', ' xxx ']) {
        env.JWT_SECRET = key;
        assert.equal((await request('/open_api/settings')).status, 400);
    }
    env.JWT_SECRET = 'existing-test-key';
    assert.equal((await request('/open_api/settings')).status, 200);
    const prepare = DB.prepare;
    t.mock.method(DB, 'prepare', sql => {
        if (sql.includes('worker_store')) throw new Error('private-database-detail');
        return prepare(sql);
    });
    const response = await request('/telegram/webhook', {});
    assert.equal(response.status, 500);
    assert.deepEqual(await response.json(), { code: 'INTERNAL_SERVER_ERROR', message: 'Internal server error' });
});

test('limiter failures fail closed with generic errors rather than falling through authentication', async t => {
    const { request } = fixture(t, { AUTH_HEADER_RATE_LIMITER: { async limit() { throw new Error('private-binding-detail'); } } });
    const response = await request('/admin/notify/telegram_bots', undefined, { 'x-admin-auth': 'admin-password' });
    assert.equal(response.status, 500);
    assert.equal((await response.json()).message, 'Internal server error');
});

test('cleanup handlers log failures without returning database details', async t => {
    const logs = [];
    t.mock.method(console, 'error', (...args) => logs.push(args.join(' ')));
    const ctx = {
        env: { DEFAULT_LANG: 'en', DB: { prepare() { throw new Error('private-cleanup-detail'); } } },
        req: { json: async () => ({ cleanType: 'mails', cleanDays: 1 }) },
        text: (body, status) => new Response(body, { status }),
        json: (body, status) => Response.json(body, { status }),
    };
    for (const method of ['cleanup', 'cleanupRawMailsNow']) {
        const response = await cleanupApi[method](ctx);
        assert.equal(response.status, 500);
        assert.equal((await response.text()).includes('private-cleanup-detail'), false);
    }
    const response = await cleanupApi.cleanupRawMailsNow({
        ...ctx,
        req: { json() { throw new Error('private-cleanup-detail'); } },
    });
    assert.equal(response.status, 500);
    const progress = await response.json();
    assert.equal(progress.success, false);
    assert.equal(progress.deleted, 0);
    assert.equal(progress.complete, false);
    assert.equal(progress.message.includes('private-cleanup-detail'), false);
    assert.ok(logs.some(log => log.includes('private-cleanup-detail')));
});
