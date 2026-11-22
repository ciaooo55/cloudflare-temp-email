import assert from 'node:assert/strict';
import { test } from 'node:test';
import statisticsApi, { readStatistics } from './statistics_api.ts';
import { createD1 } from '../../test-loader/d1.mjs';

const NOW = Date.UTC(2026, 10, 22, 10);
function fixture() {
    const DB = createD1();
    DB.sqlite.exec(`CREATE TABLE address (name TEXT); CREATE TABLE raw_mails (address TEXT, created_at TEXT);
        CREATE TABLE sendbox (address TEXT, created_at TEXT);
        CREATE INDEX idx_raw_mails_created_at ON raw_mails(created_at);
        CREATE INDEX idx_sendbox_created_at ON sendbox(created_at);
        INSERT INTO address VALUES ('a@example.com'), ('zero@example.com');
        INSERT INTO raw_mails VALUES ('a@example.com','2026-11-16 00:00:00'),
            ('b@example.com','2026-11-22 01:00:00'), ('b@example.com','2026-11-22 02:00:00'),
            ('b@example.com','2026-11-21 23:59:59'), ('old@example.com','2026-11-15 23:59:59'),
            ('a@example.com','2026-11-23 00:00:00');
        INSERT INTO sendbox VALUES ('a@example.com','2026-11-16'), ('a@example.com','2026-11-22'),
            ('sent@example.com','2026-11-20');`);
    return DB;
}

test('seven UTC dates are zero-filled; mailbox ranking includes idle and catch-all mailboxes', async () => {
    const data = await readStatistics(fixture(), 0, 'received', NOW);
    assert.deepEqual([data.mailCount, data.sendMailCount, data.addressCount], [6, 3, 5]);
    assert.deepEqual(data.period, { start: '2026-11-16', end: '2026-11-22', timezone: 'UTC' });
    assert.equal(data.days.length, 7);
    assert.deepEqual(data.days[0], { day: '2026-11-16', received: 1, sent: 1 });
    assert.deepEqual(data.days[1], { day: '2026-11-17', received: 0, sent: 0 });
    assert.deepEqual(data.days[6], { day: '2026-11-22', received: 2, sent: 1 });
    assert.deepEqual(data.mailboxes.most, { address: 'b@example.com', count: 3 });
    assert.deepEqual(data.mailboxes.least, { address: 'old@example.com', count: 0 });
    assert.equal(data.mailboxes.results.find(row => row.address === 'a@example.com').sent, 2);
    assert.deepEqual(data.mailboxes.results.find(row => row.address === 'zero@example.com'), { address: 'zero@example.com', received: 0, sent: 0 });
});

test('all mailboxes can be paged and sorted by sending without returning bodies', async () => {
    const DB = fixture();
    for (let i = 0; i < 25; i++) DB.sqlite.prepare('INSERT INTO address VALUES (?)').run(`extra${i}@example.com`);
    const first = await readStatistics(DB, 0, 'sent', NOW);
    const second = await readStatistics(DB, 20, 'sent', NOW);
    assert.equal(first.addressCount, 30);
    assert.equal(first.mailboxes.results.length, 20);
    assert.equal(second.mailboxes.results.length, 10);
    assert.equal(first.mailboxes.results[0].address, 'a@example.com');
    assert.equal(new Set([...first.mailboxes.results, ...second.mailboxes.results].map(row => row.address)).size, 30);
    assert.deepEqual(Object.keys(first.mailboxes.results[0]), ['address', 'received', 'sent']);
});

test('empty mailboxes produce seven zero days and no invented ranking', async () => {
    const DB = fixture();
    DB.sqlite.exec('DELETE FROM address; DELETE FROM raw_mails; DELETE FROM sendbox;');
    const data = await readStatistics(DB, 0, 'received', NOW);
    assert.equal(data.addressCount, 0);
    assert.equal(data.mailboxes.most, null);
    assert.equal(data.mailboxes.least, null);
    assert.equal(data.days.reduce((sum, day) => sum + day.sent + day.received, 0), 0);
});

test('manual refreshes use bounded 60-second isolate caching and reset on UTC date change', async t => {
    const DB = fixture();
    let now = NOW, calls = 0;
    t.mock.method(Date, 'now', () => now);
    const batch = DB.batch.bind(DB);
    DB.batch = (...args) => { calls++; return batch(...args); };
    const c = { env: { DB }, req: { query: () => undefined }, header() {}, json: value => value };
    await statisticsApi.get(c);
    await statisticsApi.get(c);
    assert.equal(calls, 1);
    now += 60_001;
    await statisticsApi.get(c);
    assert.equal(calls, 2);
    now = Date.UTC(2026, 10, 23);
    const fresh = await statisticsApi.get(c);
    assert.equal(calls, 3);
    assert.equal(fresh.period.end, '2026-11-23');
});
