import assert from 'node:assert/strict';
import { test } from 'node:test';
import { api } from './index.ts';

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
