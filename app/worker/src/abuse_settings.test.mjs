import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Hono } from 'hono';
import { createD1 } from '../test-loader/d1.mjs';
import { DEFAULT_ABUSE_SETTINGS, getAbuseSettings, getAbuseSettingsResponse, saveAbuseSettings } from './abuse_settings.ts';

test('protection settings validate ranges and persist switches without stale cache or partial saves', async t => {
    const DB = createD1();
    t.after(() => DB.sqlite.close());
    DB.sqlite.exec('CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT, updated_at TEXT)');
    const app = new Hono().get('/', getAbuseSettingsResponse).post('/', saveAbuseSettings);
    assert.deepEqual(await (await app.request('/', {}, { DB })).json(), DEFAULT_ABUSE_SETTINGS);
    const settings = { ...DEFAULT_ABUSE_SETTINGS, inboundPairLimit: 3, snapshotEnabled: false };
    const save = value => app.request('/', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(value) }, { DB });
    assert.equal((await save(settings)).status, 200);
    assert.deepEqual(await getAbuseSettings({ DB }), settings);
    for (const invalid of [null, [], {}, { ...settings, inboundPairLimit: 0 },
        { ...settings, inboundWindowMinutes: 1441 }, { ...settings, snapshotLimit: 1.5 },
        { ...settings, inboundEnabled: 'false' }, { ...settings, snapshotBanMinutes: null }]) {
        assert.equal((await save(invalid)).status, 400);
        assert.deepEqual(await getAbuseSettings({ DB }), settings);
    }
});
