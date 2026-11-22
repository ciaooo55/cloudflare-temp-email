import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Hono } from 'hono';
import { createD1 } from '../../test-loader/d1.mjs';
import analytics from './cloudflare_usage.ts';

const accountId = 'a'.repeat(32);
const token = 'x'.repeat(40);
const goodTotals = { rowsRead: 7300, rowsWritten: 98 };
const envelope = (groups, errors = null) => ({ errors, data: { viewer: { accounts: [{ d1AnalyticsAdaptiveGroups: groups }] } } });

test('optional analytics stays admin-only, verifies on save, and never returns the encrypted credential', async t => {
    const DB = createD1();
    t.after(() => DB.sqlite.close());
    DB.sqlite.exec('CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT, updated_at TEXT)');
    const env = { DB, JWT_SECRET: 'local-test-only', ADMIN_PASSWORDS: ['admin-test-pass'] };
    const app = new Hono().get('/', analytics.get).put('/', analytics.save).delete('/', analytics.remove);
    const request = (method = 'GET', body, admin = true, bindings = env) => app.request('https://mail.example.com/', {
        method,
        headers: { 'content-type': 'application/json', ...(admin ? { 'x-admin-auth': env.ADMIN_PASSWORDS[0] } : {}) },
        ...(body ? { body: JSON.stringify(body) } : {}),
    }, bindings);
    const upstream = t.mock.method(globalThis, 'fetch', async (url, options) => {
        assert.equal(url, 'https://api.cloudflare.com/client/v4/graphql');
        assert.equal(options.redirect, 'manual');
        assert.equal(options.method, 'POST');
        const body = JSON.parse(options.body);
        assert.equal(body.variables.account, accountId);
        assert.match(body.variables.day, /^\d{4}-\d{2}-\d{2}$/);
        assert.doesNotMatch(body.query, /databaseId/);
        if (options.headers.Authorization !== 'Bearer ' + token) {
            return Response.json(envelope([], [{ message: options.headers.Authorization }]));
        }
        return Response.json(envelope([{ sum: goodTotals }]));
    });

    assert.deepEqual(await (await request('GET', undefined, false)).json(), { state: 'locked' });
    assert.equal((await request('PUT', { accountId, token }, false)).status, 403);
    assert.equal((await request('DELETE', undefined, false)).status, 403);
    assert.deepEqual(await (await request()).json(), { state: 'unconfigured' });
    assert.equal((await request('PUT', { accountId: 'bad', token })).status, 400);
    assert.equal(upstream.mock.callCount(), 0);

    const saved = await request('PUT', { accountId, token });
    assert.equal(saved.status, 200);
    assert.equal(saved.headers.get('Cache-Control'), 'no-store');
    const result = await saved.json();
    assert.deepEqual(Object.keys(result).sort(), ['accountId', 'state', 'usage']);
    assert.equal(result.state, 'connected');
    assert.deepEqual(result.usage.totals, goodTotals);
    const stored = () => DB.sqlite.prepare('SELECT value FROM settings').get()?.value;
    const firstConfig = stored();
    assert.equal(JSON.parse(firstConfig).accountId, accountId);
    assert.ok(!firstConfig.includes(token));
    assert.ok(!JSON.stringify(result).includes(JSON.parse(firstConfig).sealedToken));

    assert.deepEqual(await (await request()).json(), result);
    assert.equal(upstream.mock.callCount(), 1);
    const freshBinding = { ...env, DB: { prepare: DB.prepare.bind(DB) } };
    assert.deepEqual((await (await request('GET', undefined, true, freshBinding)).json()).usage.totals, goodTotals);
    assert.equal(upstream.mock.callCount(), 2);

    const rejected = await request('PUT', { accountId, token: 'y'.repeat(40) });
    assert.equal(rejected.status, 422);
    assert.doesNotMatch(await rejected.text(), /yyyy/);
    assert.equal(stored(), firstConfig);
    upstream.mock.mockImplementationOnce(async () => Response.redirect('https://redirect.example', 307), upstream.mock.callCount());
    assert.equal((await request('PUT', { accountId, token })).status, 422);
    assert.equal(upstream.mock.callCount(), 4);
    assert.equal(stored(), firstConfig);
    const rotatedKey = { ...env, JWT_SECRET: 'new-test-key', DB: { prepare: DB.prepare.bind(DB) } };
    assert.deepEqual(await (await request('GET', undefined, true, rotatedKey)).json(), { state: 'unavailable', accountId });

    upstream.mock.mockImplementation(async () => Response.json(envelope([])));
    const noData = await (await request('PUT', { accountId, token })).json();
    assert.equal(noData.state, 'connected');
    assert.equal(noData.usage.totals, null);
    assert.deepEqual(await (await request('DELETE')).json(), { state: 'unconfigured' });
    assert.equal(stored(), undefined);
    assert.deepEqual(await (await request()).json(), { state: 'unconfigured' });
});
