import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createD1 } from '../test-loader/d1.mjs';
import { scheduled } from './scheduled.ts';
import { CONSTANTS } from './constants.ts';
import { USAGE_BUDGET_SCHEMA } from './usage_budget.ts';
import { WORKER_STORE_SCHEMA } from './worker_store.ts';
import cleanupApi from './admin_api/cleanup_api.ts';

const now = Date.now();
const rawKey = 'scheduled:last_run:raw_mails';
const batchKey = 'scheduled:last_run:auto_cleanup';

function fixture(settings) {
    const DB = createD1();
    DB.sqlite.exec(USAGE_BUDGET_SCHEMA + WORKER_STORE_SCHEMA + `
        CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT, updated_at TEXT);
        CREATE TABLE raw_mails (id INTEGER PRIMARY KEY, address TEXT, created_at TEXT);
        CREATE INDEX idx_raw_mails_created_at ON raw_mails(created_at);
        CREATE TABLE sendbox (id INTEGER PRIMARY KEY, address TEXT, created_at TEXT);
        CREATE TABLE address (id INTEGER PRIMARY KEY, name TEXT, created_at TEXT, updated_at TEXT);
        CREATE TABLE address_sender (address TEXT);
        CREATE TABLE custom_rows (id INTEGER PRIMARY KEY);
        INSERT INTO raw_mails VALUES (1, 'a@example.com', datetime('now', '-2 days'));
        INSERT INTO sendbox VALUES (1, 'a@example.com', datetime('now', '-2 days'));
        INSERT INTO custom_rows VALUES (1);
    `);
    if (settings !== undefined) {
        DB.sqlite.prepare('INSERT INTO settings(key,value) VALUES (?,?)')
            .run(CONSTANTS.AUTO_CLEANUP_KEY, typeof settings === 'string' ? settings : JSON.stringify(settings));
    }
    return {
        env: { DB },
        run: () => scheduled({ scheduledTime: now }, { DB }, {}),
        count: table => DB.sqlite.prepare('SELECT count(*) AS n FROM ' + table).get().n,
        marked: key => DB.sqlite.prepare('SELECT value FROM settings WHERE key=?').get(key),
    };
}

test('cron skips destructive cleanup on settings read errors or invalid JSON values', async t => {
    t.mock.method(console, 'error', () => {});
    for (const value of ['{broken', 'null', '[]', 'false', '""']) {
        const f = fixture(value);
        await f.run();
        assert.equal(f.count('raw_mails'), 1);
        assert.equal(f.marked(rawKey), undefined);
        assert.equal(f.marked(batchKey), undefined);
    }
    const f = fixture({});
    const prepare = f.env.DB.prepare;
    f.env.DB.prepare = sql => {
        if (sql === 'SELECT value FROM settings WHERE key = ?') throw new Error('settings read failed');
        return prepare(sql);
    };
    await f.run();
    assert.equal(f.count('raw_mails'), 1);
    assert.equal(f.marked(batchKey), undefined);
});

test('cron uses defaults only for absent settings and honors disabled raw cleanup', async () => {
    const absent = fixture();
    await absent.run();
    assert.equal(absent.count('raw_mails'), 0);
    assert.ok(absent.marked(rawKey));
    const disabled = fixture({ enableRawMailsAutoCleanup: false });
    await disabled.run();
    assert.equal(disabled.count('raw_mails'), 1);
    assert.equal(disabled.marked(rawKey), undefined);
});

test('cron does not mark failed raw purge and still runs other cleanup', async t => {
    t.mock.method(console, 'error', () => {});
    const f = fixture({ enableSendBoxAutoCleanup: true, cleanSendBoxDays: 1 });
    f.env.DB.sqlite.exec('DROP INDEX idx_raw_mails_created_at');
    await f.run();
    assert.equal(f.marked(rawKey), undefined);
    assert.equal(f.count('sendbox'), 0);
    assert.ok(f.marked(batchKey));
});

test('cron resumes capped raw purges next tick without marking them complete', async () => {
    const f = fixture();
    const insert = f.env.DB.sqlite.prepare("INSERT INTO raw_mails(address,created_at) VALUES ('a',datetime('now','-2 days'))");
    for (let i = 0; i < 349; i++) insert.run();
    await f.run();
    assert.equal(f.count('raw_mails'), 50);
    assert.equal(f.marked(rawKey), undefined);
    await f.run();
    assert.equal(f.count('raw_mails'), 0);
    assert.ok(f.marked(rawKey));
});

test('cron isolates failures and marks attempted batches after all work to avoid early reruns', async t => {
    t.mock.method(console, 'error', () => {});
    const f = fixture({
        enableRawMailsAutoCleanup: false,
        enableMailsAutoCleanup: true, cleanMailsDays: 1,
        enableSendBoxAutoCleanup: true, cleanSendBoxDays: 1,
        customSqlCleanupList: [
            { name: 'failure', enabled: true, sql: 'DELETE FROM missing_table' },
            { name: 'success', enabled: true, sql: 'DELETE FROM custom_rows' },
        ],
    });
    const prepare = f.env.DB.prepare;
    f.env.DB.prepare = sql => {
        if (/DELETE FROM (raw_mails|sendbox|custom_rows)/.test(sql)) {
            assert.equal(f.marked(batchKey), undefined);
        }
        if (/DELETE FROM raw_mails/.test(sql)) throw new Error('mail cleanup failed');
        return prepare(sql);
    };
    await f.run();
    assert.equal(f.count('sendbox'), 0);
    assert.equal(f.count('custom_rows'), 0);
    assert.equal(f.count('raw_mails'), 1);
    assert.ok(f.marked(batchKey));
    await f.run();
    assert.equal(f.count('raw_mails'), 1);
    assert.ok(f.marked(batchKey));
});

for (const flag of [
    'enableMailsAutoCleanup', 'enableUnknowMailsAutoCleanup', 'enableSendBoxAutoCleanup',
    'enableInactiveAddressAutoCleanup', 'enableAddressAutoCleanup', 'enableEmptyAddressAutoCleanup',
]) {
    test(`cron isolates invalid configuration for ${flag}`, async t => {
        t.mock.method(console, 'error', () => {});
        const f = fixture({
            enableRawMailsAutoCleanup: false,
            [flag]: true,
            customSqlCleanupList: [{ name: 'after failure', enabled: true, sql: 'DELETE FROM custom_rows' }],
        });
        await f.run();
        assert.equal(f.count('custom_rows'), 0);
        assert.ok(f.marked(batchKey));
    });
}

test('manual raw cleanup returns progress and only marks completed successes', async t => {
    t.mock.method(console, 'error', () => {});
    const f = fixture();
    const context = {
        env: f.env,
        req: { json: async () => ({ minutes: 10 }), header: () => 'en' },
        json: (body, status = 200) => status >= 400 ? { body, status } : body,
        text: (body, status) => ({ body, status }),
    };
    assert.deepEqual(await cleanupApi.cleanupRawMailsNow(context), { success: true, deleted: 1, complete: true });
    assert.ok(f.marked(rawKey));
    f.env.DB.sqlite.prepare('DELETE FROM settings WHERE key=?').run(rawKey);
    f.env.DB.sqlite.exec('DROP INDEX idx_raw_mails_created_at');
    assert.equal((await cleanupApi.cleanupRawMailsNow(context)).status, 500);
    assert.equal(f.marked(rawKey), undefined);
});

test('manual raw cleanup reports capped successes and partial budget failures', async () => {
    for (const limited of [false, true]) {
        const f = fixture();
        const insert = f.env.DB.sqlite.prepare("INSERT INTO raw_mails(address,created_at) VALUES ('a',datetime('now','-2 days'))");
        for (let i = 0; i < 349; i++) insert.run();
        if (limited) f.env.D1_DAILY_WRITE_SOFT_LIMIT = 500;
        const context = {
            env: f.env,
            req: { json: async () => ({}), header: () => 'en' },
            json: (body, status = 200) => ({ body, status }),
        };
        const response = await cleanupApi.cleanupRawMailsNow(context);
        assert.equal(response.status, limited ? 500 : 200);
        assert.equal(response.body.success, !limited);
        assert.equal(response.body.deleted, limited ? 100 : 300);
        assert.equal(response.body.complete, false);
        assert.equal(f.marked(rawKey), undefined);
    }
});
