import assert from 'node:assert/strict';
import { test } from 'node:test';
import addressApi from './address_api.ts';
import statisticsApi from './statistics_api.ts';
import { createD1 } from '../../test-loader/d1.mjs';
import { initializeMailStatistics } from '../mail_statistics.ts';

function fixture() {
    const DB = createD1();
    DB.sqlite.exec("CREATE TABLE address (id INTEGER PRIMARY KEY, name TEXT, password TEXT, source_meta TEXT, created_at TEXT, updated_at TEXT); CREATE TABLE raw_mails (address TEXT, created_at TEXT); CREATE TABLE sendbox (address TEXT, created_at TEXT); INSERT INTO address VALUES (1, 'registered@example.com', 'secret', 'legacy', '2026-01-01', '2026-01-01'); INSERT INTO raw_mails VALUES ('new@example.com', '2026-11-20'), ('new@example.com', '2026-11-21'); INSERT INTO sendbox VALUES ('sent@example.com', '2026-11-21');");
    return DB;
}
const context = (DB, query = {}) => ({
    env: { DB }, req: { query: key => key ? ({ limit: '20', offset: '0', include_received: '1', ...query })[key] : ({ limit: '20', offset: '0', include_received: '1', ...query }) },
    get: () => 'en', json: body => Response.json(body), header() {},
});

test('mailbox directory includes unregistered received and sent addresses without creating records', async () => {
    const DB = fixture();
    const body = await (await addressApi.listAddresses(context(DB))).json();
    assert.equal(body.count, 3);
    assert.deepEqual(body.results.map(row => row.name), ['new@example.com', 'registered@example.com', 'sent@example.com']);
    assert.equal(body.results[0].id, null);
    assert.equal(body.results[0].mail_count, 2);
    assert.equal(body.results[0].updated_at, '2026-11-21');
    assert.equal(body.results.some(row => 'password' in row), false);
    assert.equal(DB.sqlite.prepare('SELECT COUNT(*) AS n FROM address').get().n, 1);
});

test('mailbox directory search is parameterized and case insensitive', async () => {
    const DB = fixture();
    const result = await (await addressApi.listAddresses(context(DB, { query: 'NEW@' }))).json();
    assert.equal(result.count, 1);
    assert.equal((await (await addressApi.listAddresses(context(DB, { query: "' OR 1=1 --" }))).json()).count, 0);
});

test('statistics retain new catch-all arrivals without scanning or backfilling old mail', async () => {
    const DB = fixture();
    DB.sqlite.exec('CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT)');
    await initializeMailStatistics(DB);
    DB.sqlite.exec("INSERT INTO raw_mails (address) VALUES ('new@example.com')");
    const body = await (await statisticsApi.get(context(DB))).json();
    assert.deepEqual([body.mailCount, body.sendMailCount, body.addressCount], [1, 0, 2]);
    assert.equal(DB.sqlite.prepare('SELECT count(*) AS n FROM raw_mails').get().n, 3);
});
