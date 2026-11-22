import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createD1 } from '../test-loader/d1.mjs';
import dbApi from './admin_api/db_api.ts';
import { CONSTANTS } from './constants.ts';
import { initializeMailStatistics, cleanupMailStatistics, MAIL_STATISTICS_START_KEY } from './mail_statistics.ts';
import { readStatistics } from './admin_api/statistics_api.ts';

async function setup() {
    const DB = createD1();
    const c = { env: { DB }, json: value => value };
    await dbApi.initialize(c);
    DB.sqlite.prepare('UPDATE settings SET value = ? WHERE key = ?').run('2026-11-16T00:00:00.000Z', MAIL_STATISTICS_START_KEY);
    return { DB, c };
}

test('atomic counters survive updates, physical mail/address deletion and UTC rollover', async () => {
    const { DB } = await setup();
    let day = '2026-11-21';
    DB.sqlite.function('date', () => day);
    DB.sqlite.exec(`INSERT INTO raw_mails (address, raw, created_at) VALUES ('a@example.com','secret body','2000-01-01');
        INSERT INTO sendbox (address, raw) VALUES ('a@example.com','secret recipient');
        UPDATE raw_mails SET is_unread = 0, raw = NULL;
        INSERT INTO address (name) VALUES ('a@example.com');`);
    day = '2026-11-22';
    DB.sqlite.exec(`INSERT INTO raw_mails (address, raw_blob) VALUES ('a@example.com', x'1234'), ('b@example.com', x'1234');
        INSERT INTO raw_mails (address) VALUES (NULL), ('');
        DELETE FROM raw_mails; DELETE FROM sendbox; DELETE FROM address;`);
    const data = await readStatistics(DB, 0, 'received', Date.UTC(2026, 10, 22, 10));
    assert.deepEqual([data.mailCount, data.sendMailCount, data.addressCount], [3, 1, 2]);
    assert.deepEqual(data.days[5], { day: '2026-11-21', received: 1, sent: 1 });
    assert.deepEqual(data.days[6], { day: '2026-11-22', received: 2, sent: 0 });
    assert.deepEqual(data.mailboxes.most, { address: 'a@example.com', count: 2 });
    assert.deepEqual(Object.keys(DB.sqlite.prepare('SELECT * FROM mailbox_activity_day LIMIT 1').get()), ['day', 'address', 'received', 'sent']);
});

test('failed mail transactions roll back both mail and summary', async () => {
    const { DB } = await setup();
    await assert.rejects(DB.batch([
        DB.prepare("INSERT INTO raw_mails (address) VALUES ('rollback@example.com')"),
        DB.prepare("INSERT INTO settings (key) VALUES ('db_version')"),
    ]), /UNIQUE/);
    assert.equal(DB.sqlite.prepare('SELECT count(*) AS n FROM raw_mails').get().n, 0);
    assert.equal(DB.sqlite.prepare('SELECT count(*) AS n FROM mailbox_activity_day').get().n, 0);
});

test('installation is atomic, idempotent, does not scan old mail or change the activation time', async () => {
    const DB = createD1();
    DB.sqlite.exec(`CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT);
        CREATE TABLE raw_mails (address TEXT, raw TEXT);
        INSERT INTO raw_mails VALUES ('old@example.com','untouched');`);
    await assert.rejects(initializeMailStatistics(DB), /sendbox/);
    assert.equal(DB.sqlite.prepare("SELECT count(*) AS n FROM sqlite_schema WHERE name = 'mailbox_activity_day'").get().n, 0);
    assert.equal(DB.sqlite.prepare('SELECT count(*) AS n FROM settings').get().n, 0);
    DB.sqlite.exec('CREATE TABLE sendbox (address TEXT)');
    await initializeMailStatistics(DB);
    const started = DB.sqlite.prepare('SELECT value FROM settings WHERE key = ?').get(MAIL_STATISTICS_START_KEY).value;
    DB.sqlite.exec("INSERT INTO raw_mails VALUES ('new@example.com','unchanged')");
    await initializeMailStatistics(DB);
    assert.equal(DB.sqlite.prepare('SELECT value FROM settings WHERE key = ?').get(MAIL_STATISTICS_START_KEY).value, started);
    assert.equal(DB.sqlite.prepare('SELECT received FROM mailbox_activity_day').get().received, 1);
    assert.equal(DB.sqlite.prepare("SELECT raw FROM raw_mails WHERE address = 'old@example.com'").get().raw, 'untouched');
});

test('upgrading v0.0.10 preserves mail, settings and existing counters', async () => {
    const { DB, c } = await setup();
    DB.sqlite.prepare('UPDATE settings SET value = ? WHERE key = ?').run('v0.0.10', CONSTANTS.DB_VERSION_KEY);
    DB.sqlite.exec("INSERT INTO raw_mails (address, raw) VALUES ('kept@example.com','keep me')");
    const before = DB.sqlite.prepare('SELECT * FROM mailbox_activity_day').all();
    assert.equal((await dbApi.migrate(c)).message, 'Database migrated');
    assert.equal((await dbApi.migrate(c)).message, 'Database does not need migration');
    assert.equal(DB.sqlite.prepare('SELECT raw FROM raw_mails').get().raw, 'keep me');
    assert.deepEqual(DB.sqlite.prepare('SELECT * FROM mailbox_activity_day').all(), before);
});

test('expiration is bounded, budgeted and never deletes current seven-day summaries or mail', async () => {
    const { DB } = await setup();
    DB.sqlite.exec("INSERT INTO raw_mails (address, raw) VALUES ('kept@example.com','keep me')");
    const insert = DB.sqlite.prepare('INSERT INTO mailbox_activity_day VALUES (?, ?, 1, 0)');
    for (let i = 0; i < 130; i++) insert.run('2026-11-15', `old${i}@example.com`);
    insert.run('2026-11-16', 'boundary@example.com');
    const env = { DB, D1_DAILY_WRITE_SOFT_LIMIT: '65' };
    const now = Date.UTC(2026, 10, 22);
    await cleanupMailStatistics(env, now);
    assert.equal(DB.sqlite.prepare("SELECT count(*) AS n FROM mailbox_activity_day WHERE day < '2026-11-16'").get().n, 130);
    env.D1_DAILY_WRITE_SOFT_LIMIT = '200';
    for (const expected of [66, 2, 0]) {
        await cleanupMailStatistics(env, now);
        assert.equal(DB.sqlite.prepare("SELECT count(*) AS n FROM mailbox_activity_day WHERE day < '2026-11-16'").get().n, expected);
    }
    assert.deepEqual({ ...DB.sqlite.prepare('SELECT row_reads, row_writes FROM worker_usage_day').get() }, { row_reads: 483, row_writes: 198 });
    await cleanupMailStatistics(env, now);
    assert.equal(DB.sqlite.prepare('SELECT row_writes FROM worker_usage_day').get().row_writes, 198);
    assert.equal(DB.sqlite.prepare("SELECT received FROM mailbox_activity_day WHERE address = 'boundary@example.com'").get().received, 1);
    assert.equal(DB.sqlite.prepare('SELECT raw FROM raw_mails').get().raw, 'keep me');
});
