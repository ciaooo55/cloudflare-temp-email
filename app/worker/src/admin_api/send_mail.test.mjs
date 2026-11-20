import assert from 'node:assert/strict';
import { test } from 'node:test';
import { registerHooks } from 'node:module';
import { createD1 } from '../../test-loader/d1.mjs';
import { WORKER_STORE_SCHEMA } from '../worker_store.ts';
import { CONSTANTS } from '../constants.ts';
import i18n from '../i18n/index.ts';

const hooks = registerHooks({
    resolve(specifier, context, next) {
        if (context.parentURL === new URL('./send_mail.ts', import.meta.url).href) {
            if (specifier === '../mails_api/send_mail_api.ts') {
                return { url: 'data:text/javascript,export function sendMail() { throw new Error("Unexpected sendMail"); }', shortCircuit: true };
            }
            if (specifier === '../mails_api/send_mail_limit_utils.ts') {
                return { url: 'data:text/javascript,export async function ensureSendMailLimit() {} export async function increaseSendMailLimitCount() {}', shortCircuit: true };
            }
        }
        return next(specifier, context);
    },
});
const { sendMailByBindingAdmin } = await import('./send_mail.ts');
hooks.deregister();

const setup = (rules, from = 'box@example.com') => {
    const DB = createD1();
    DB.sqlite.exec(WORKER_STORE_SCHEMA + 'CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT);');
    DB.sqlite.prepare('INSERT INTO worker_store (key, value) VALUES (?, ?)')
        .run(CONSTANTS.EMAIL_MAILBOX_BLOCK_RULES, JSON.stringify(rules));
    const sent = [];
    const context = {
        env: { DB, SEND_MAIL: { async send(message) { sent.push(message); } } },
        req: { async json() { return { from, to: 'to@example.com', subject: 'Test', text: 'Body' }; } },
        text: (body, status) => new Response(body, { status }),
        json: body => Response.json(body),
    };
    return { context, sent };
};

test('admin binding rejects disabled mailboxes for string and object senders', async () => {
    for (const from of ['BOX@example.com', { email: 'box@example.com', name: 'Box' }]) {
        const { context, sent } = setup({ blockedMailboxList: ['box@example.com'] }, from);
        const response = await sendMailByBindingAdmin(context);
        assert.equal(response.status, 403);
        assert.equal(await response.text(), i18n.getMessages('en').AddressBlockedMsg);
        assert.deepEqual(sent, []);
    }
});

test('admin binding allows enabled mailboxes and empty block settings', async () => {
    for (const rules of [{}, { blockedMailboxList: ['other@example.com'] }]) {
        const { context, sent } = setup(rules);
        const response = await sendMailByBindingAdmin(context);
        assert.equal(response.status, 200);
        assert.equal(sent.length, 1);
    }
});

test('admin binding does not send when blacklist storage fails', async () => {
    const { context, sent } = setup({});
    context.env.DB = { prepare() { throw new Error('storage unavailable'); } };
    const response = await sendMailByBindingAdmin(context);
    assert.equal(response.status, 400);
    assert.equal(await response.text(), i18n.getMessages('en').OperationFailedMsg);
    assert.deepEqual(sent, []);
});
