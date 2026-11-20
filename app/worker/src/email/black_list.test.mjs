import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createD1 } from '../../test-loader/d1.mjs';
import { WORKER_STORE_SCHEMA } from '../worker_store.ts';
import { CONSTANTS } from '../constants.ts';
import { isBlockedForRecipient, isMailboxBlocked, normalizeMailboxBlockRules } from './black_list.ts';

const message = (from, header = '') => ({ from, headers: new Headers({ From: header }) });
const setup = rules => {
    const DB = createD1();
    DB.sqlite.exec(WORKER_STORE_SCHEMA);
    DB.sqlite.prepare('INSERT INTO worker_store (key, value) VALUES (?, ?)')
        .run(CONSTANTS.EMAIL_MAILBOX_BLOCK_RULES, JSON.stringify(rules));
    return { DB };
};

test('mailbox rules normalize valid entries and drop invalid or empty entries', () => {
    assert.deepEqual(normalizeMailboxBlockRules({
        blockedMailboxList: [' BOX@Example.com ', '', null, 'invalid'],
        mailboxDomainBlockList: [null, {}, { address: ' BOX@Example.com ', domain: ' @Spam.COM ' },
            { address: 'box@example.com', domain: 'bad..com' }, { address: '', domain: 'spam.com' }],
    }), { blockedMailboxList: ['box@example.com'], mailboxDomainBlockList: [{ address: 'box@example.com', domain: 'spam.com' }] });
});

test('blocked mailboxes reject every sender and cannot send', async () => {
    const env = setup({ blockedMailboxList: [' Box@Example.COM '] });
    assert.equal(await isBlockedForRecipient(message('any@sender.com'), ' BOX@example.com ', env), true);
    assert.equal(await isMailboxBlocked('BOX@example.com', env), true);
    assert.equal(await isMailboxBlocked('other@example.com', env), false);
});

test('domain rules match envelope and parsed From senders, exact domains and subdomains only', async () => {
    const env = setup({ mailboxDomainBlockList: [{ address: 'box@example.com', domain: '@Spam.COM' }] });
    for (const msg of [message('sender@SPAM.com'), message('sender@a.spam.com'),
        message('sender@safe.com', 'Name <sender@a.SPAM.com>, Other <other@safe.com>')]) {
        assert.equal(await isBlockedForRecipient(msg, 'BOX@example.com', env), true);
        assert.equal(await isBlockedForRecipient(msg, 'other@example.com', env), false);
    }
    for (const sender of ['sender@notspam.com', 'sender@spam.com.evil.com', '', 'invalid']) {
        assert.equal(await isBlockedForRecipient(message(sender), 'box@example.com', env), false);
    }
});

test('empty settings, missing DB and missing store tables allow mail', async () => {
    for (const env of [{}, setup({}), { DB: createD1() }]) {
        assert.equal(await isBlockedForRecipient(message('sender@spam.com', 'malformed <'), 'box@example.com', env, false), false);
    }
});

test('missing-table fallback reads legacy rules and unexpected storage errors propagate', async () => {
    const env = { DB: createD1(), KV: { async get(key) {
        assert.equal(key, CONSTANTS.EMAIL_MAILBOX_BLOCK_RULES);
        return { blockedMailboxList: ['box@example.com'] };
    } } };
    assert.equal(await isBlockedForRecipient(message('a@b.com'), 'box@example.com', env, false), true);
    await assert.rejects(isBlockedForRecipient(message('a@b.com'), 'box@example.com', {
        DB: { prepare() { throw new Error('storage unavailable'); } },
    }), /storage unavailable/);
});
