import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Hono } from 'hono';
import { updateMailReadStatus } from './mail_read_status.ts';

function setup(address, enabled = true) {
    const writes = [];
    const app = new Hono();
    app.patch('/mail/:id', c => updateMailReadStatus(c, address));
    const env = { ENABLE_MAIL_READ_STATUS: enabled, DB: {
        prepare: sql => ({ bind: (...params) => ({ run: async () => {
            writes.push({ sql, params }); return { success: true };
        } }) }),
    } };
    const request = body => app.request('/mail/7', {
        method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
    }, env);
    return { request, writes };
}

test('admin can mark catch-all mail without creating a mailbox', async () => {
    const { request, writes } = setup(undefined);
    assert.equal((await request({ isUnread: false })).status, 200);
    assert.deepEqual(writes[0].params, [0, '7', 0]);
    assert.ok(!writes[0].sql.includes('address ='));
    assert.match(writes[0].sql, /COALESCE/);
});

test('mailbox API remains scoped to its authenticated address', async () => {
    const { request, writes } = setup('inbox@example.com');
    assert.equal((await request({ isUnread: true })).status, 200);
    assert.deepEqual(writes[0].params, [1, '7', 'inbox@example.com', 1]);
    assert.match(writes[0].sql, /AND address = \?/);
});

test('disabled status tracking and invalid input do not write', async () => {
    const disabled = setup(undefined, false);
    assert.equal((await disabled.request({ isUnread: true })).status, 403);
    assert.equal(disabled.writes.length, 0);
    const invalid = setup(undefined);
    assert.equal((await invalid.request({ isUnread: 'true' })).status, 400);
    assert.equal(invalid.writes.length, 0);
});
