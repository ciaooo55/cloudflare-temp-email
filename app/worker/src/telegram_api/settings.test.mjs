import assert from 'node:assert/strict';
import { test } from 'node:test';
import { api } from './index.ts';
import { createD1 } from '../../test-loader/d1.mjs';
import { workerStore, WORKER_STORE_SCHEMA } from '../worker_store.ts';
import { CONSTANTS } from '../constants.ts';

const env = () => ({
    DB: { prepare: () => ({ bind() { return this; }, first: async () => null }) },
});

test('Telegram settings can be read before the first bot is configured', async () => {
    const response = await api.request('/admin/telegram/settings', {}, env());
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), {
        enableAllowList: false, allowList: [], miniAppUrl: '',
        enableGlobalMailPush: false, globalMailPushList: [],
    });
});

test('default-bot operations still require their token', async () => {
    for (const [path, method] of [['status', 'GET'], ['init', 'POST']]) {
        const response = await api.request('/admin/telegram/' + path, { method }, env());
        assert.equal(response.status, 400);
    }
});

test('Telegram public operations still require a configured bot', async () => {
    const response = await api.request('/telegram/get_mail', { method: 'POST' }, env());
    assert.equal(response.status, 400);
});

test('canonical and existing env callback paths verify the persisted default-bot secret before handling updates', async t => {
    const DB = createD1();
    t.after(() => DB.sqlite.close());
    DB.sqlite.exec(WORKER_STORE_SCHEMA);
    const bindings = { DB, TELEGRAM_BOT_TOKEN: 'local-test-token' };
    await workerStore(bindings).put(CONSTANTS.TG_WEBHOOK_SECRET_KEY, 'local-test-secret');
    for (const path of ['/telegram/webhook', '/telegram/webhook/env']) {
        assert.equal((await api.request(path, { method: 'POST', body: '{}' }, bindings)).status, 401);
        assert.equal((await api.request(path, { method: 'POST', headers: {
            'X-Telegram-Bot-Api-Secret-Token': 'wrong-secret',
        }, body: '{}' }, bindings)).status, 401);
        const response = await api.request(path, { method: 'POST', headers: {
            'X-Telegram-Bot-Api-Secret-Token': 'local-test-secret',
        }, body: 'invalid json' }, bindings);
        assert.equal(response.status, 400);
        assert.equal(await response.text(), 'invalid json');
    }
});
