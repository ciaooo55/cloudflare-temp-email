import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Hono } from 'hono';
import addressApi from './address_api.ts';
import { createD1 } from '../../test-loader/d1.mjs';

function fixture(enabled = true) {
    const DB = createD1();
    DB.sqlite.exec("CREATE TABLE address (id INTEGER PRIMARY KEY, password TEXT, updated_at TEXT); INSERT INTO address VALUES (1, 'old-hash', NULL)");
    const app = new Hono();
    app.use('*', async (c, next) => { c.set('lang', 'en'); await next(); });
    app.post('/admin/address/:id/reset_password', addressApi.resetPassword);
    const request = password => app.request('/admin/address/1/reset_password', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ password }),
    }, { DB, ENABLE_ADDRESS_PASSWORD: enabled });
    const stored = () => DB.sqlite.prepare('SELECT password, updated_at FROM address WHERE id = 1').get();
    return { DB, request, stored };
}

for (const enabled of [true, 'true']) {
    test(`admin resets an address password when enabled by ${JSON.stringify(enabled)}`, async () => {
        const { request, stored } = fixture(enabled);
        const hash = 'a'.repeat(64);
        const response = await request(hash);
        assert.equal(response.status, 200);
        assert.deepEqual(await response.json(), { success: true });
        assert.equal(stored().password, hash);
        assert.ok(stored().updated_at);
    });
}

test('disabled password changes do not modify the address', async () => {
    const { request, stored } = fixture(false);
    assert.equal((await request('new-hash')).status, 403);
    assert.equal(stored().password, 'old-hash');
    assert.equal(stored().updated_at, null);
});

test('empty password changes are rejected without updating the address', async () => {
    const { request, stored } = fixture();
    for (const password of ['', undefined]) {
        assert.equal((await request(password)).status, 400);
        assert.equal(stored().password, 'old-hash');
        assert.equal(stored().updated_at, null);
    }
});

test('failed password writes return an error without reporting success', async t => {
    const { DB, request, stored } = fixture();
    t.mock.method(DB, 'prepare', () => ({ bind: () => ({ run: async () => ({ success: false }) }) }));
    assert.equal((await request('new-hash')).status, 500);
    assert.equal(stored().password, 'old-hash');
});
