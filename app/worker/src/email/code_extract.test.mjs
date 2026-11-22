import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { test } from 'node:test';
import { extractEmailInfo } from './code_extract.ts';
import { createD1 } from '../../test-loader/d1.mjs';

test('verification extraction never calls configured AI or custom services', async t => {
    const network = t.mock.method(globalThis, 'fetch', () => { throw new Error('Unexpected external service'); });
    const ai = t.mock.fn(() => { throw new Error('Unexpected AI'); });
    const rawEmail = 'Subject: Your verification code\r\nContent-Type: text/plain\r\n\r\nYour verification code is 123456.';
    const result = await extractEmailInfo({ rawEmail }, { AI: { run: ai }, ENABLE_AI_EMAIL_EXTRACT: true, AI_EXTRACT_MODE: 'custom', AI_EXTRACT_API_URL: 'https://unused.invalid' }, null);
    assert.equal(result.result, '123456');
    assert.equal(ai.mock.callCount(), 0);
    assert.equal(network.mock.callCount(), 0);
});

test('base64 verification mail is decoded before local extraction', async () => {
    const rawEmail = 'Subject: Security\r\nContent-Type: text/plain\r\nContent-Transfer-Encoding: base64\r\n\r\n' + Buffer.from('Your verification code is 654321.').toString('base64');
    assert.equal((await extractEmailInfo({ rawEmail }, {}, null)).result, '654321');
});

test('ordinary plain mail needs no MIME parse or metadata write', async () => {
    assert.equal(await extractEmailInfo({ rawEmail: 'Subject: Hello\r\n\r\nOrdinary message' }, {}, null), null);
});

test('failed MIME parsing returns no extraction and does not write metadata', async t => {
    const { default: PostalMime } = await import('postal-mime');
    t.mock.method(PostalMime, 'parse', async () => { throw new Error('Invalid MIME'); });
    const errors = t.mock.method(console, 'error', () => {});
    const prepare = t.mock.fn(() => { throw new Error('Unexpected metadata write'); });
    const result = await extractEmailInfo({ rawEmail: 'Your verification code is 123456' }, { DB: { prepare } }, 1);
    assert.equal(result, null);
    assert.equal(prepare.mock.callCount(), 0);
    assert.equal(errors.mock.callCount(), 1);
});

test('extraction updates only the inserted row even when Message-ID is shared', async () => {
    const DB = createD1();
    DB.sqlite.exec(`
        CREATE TABLE raw_mails (id INTEGER PRIMARY KEY, address TEXT, message_id TEXT, metadata TEXT);
        INSERT INTO raw_mails VALUES (1, 'a@example.com', 'shared', '{"keep":true}'),
            (2, 'b@example.com', 'shared', NULL), (3, 'c@example.com', NULL, NULL);
    `);
    const rawEmail = 'Subject: Login\r\n\r\nYour verification code is 123456.';
    assert.equal((await extractEmailInfo({ rawEmail }, { DB }, 2)).result, '123456');
    assert.equal(DB.sqlite.prepare('SELECT metadata FROM raw_mails WHERE id=1').get().metadata, '{"keep":true}');
    assert.equal(JSON.parse(DB.sqlite.prepare('SELECT metadata FROM raw_mails WHERE id=2').get().metadata).ai_extract.result, '123456');
    await extractEmailInfo({ rawEmail }, { DB }, 3);
    assert.equal(JSON.parse(DB.sqlite.prepare('SELECT metadata FROM raw_mails WHERE id=3').get().metadata).ai_extract.result, '123456');
});

test('extraction without a stored row id does not write and database errors are contained', async t => {
    const rawEmail = 'Subject: Login\r\n\r\nYour verification code is 123456.';
    const prepare = t.mock.fn(() => { throw new Error('D1 unavailable'); });
    t.mock.method(console, 'error', () => {});
    assert.equal((await extractEmailInfo({ rawEmail }, { DB: { prepare } }, undefined)).result, '123456');
    assert.equal(prepare.mock.callCount(), 0);
    assert.equal(await extractEmailInfo({ rawEmail }, { DB: { prepare } }, 1), null);
    assert.equal(prepare.mock.callCount(), 1);
});

test('unencoded HTML code split by tags is parsed before extraction', async () => {
    const rawEmail = 'Subject: Login\r\nContent-Type: text/html\r\n\r\n<p>Verification code: <span>123456</span></p>';
    assert.equal((await extractEmailInfo({ rawEmail }, {}, null)).result, '123456');
});

test('HTML entities are decoded before local extraction', async () => {
    const rawEmail = 'Subject: Login\r\nContent-Type: text/html\r\n\r\n<p>Your verification code:&nbsp;&#49;&#50;&#51;&#52;&#53;&#54;</p>';
    assert.equal((await extractEmailInfo({ rawEmail }, {}, null)).result, '123456');
});

test('adjacent inline elements preserve a verification code split across digit groups', async () => {
    const rawEmail = 'Subject: Login\r\nContent-Type: text/html\r\n\r\n<p>Your verification code:&nbsp;<span>&#49;&#50;&#51;</span><span>&#52;&#53;&#54;</span>.</p>';
    assert.equal((await extractEmailInfo({ rawEmail }, {}, null)).result, '123456');
});
