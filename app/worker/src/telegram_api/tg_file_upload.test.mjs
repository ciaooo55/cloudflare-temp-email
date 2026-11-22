import assert from 'node:assert/strict';
import { test } from 'node:test';
import { sendTelegramAttachments } from './tg_file_upload.ts';

const attachments = count => Array.from({ length: count }, (_, i) => ({
    filename: `file-${i}.txt`, content: new Uint8Array([i]),
}));

for (const [count, methods] of [[1, ['sendDocument']], [2, ['sendMediaGroup']], [7, ['sendMediaGroup', 'sendDocument']]]) {
    test(`Telegram sends ${count} attachments using valid batch methods`, async t => {
        const fetch = t.mock.method(globalThis, 'fetch', async () => new Response('{}'));
        const timeout = t.mock.method(AbortSignal, 'timeout', () => new AbortController().signal);
        await sendTelegramAttachments('test-token', '123', attachments(count), 'Caption');
        assert.deepEqual(fetch.mock.calls.map(call => call.arguments[0].split('/').at(-1)), methods);
        for (const [i, call] of fetch.mock.calls.entries()) {
            const options = call.arguments[1];
            assert.equal(options.body.get('chat_id'), '123');
            assert.ok(options.signal instanceof AbortSignal);
            if (methods[i] === 'sendDocument') {
                assert.ok(options.body.get('document') instanceof Blob);
                assert.equal(options.body.get('media'), null);
                assert.equal(options.body.get('caption'), i === 0 ? 'Caption' : null);
            } else {
                const media = JSON.parse(options.body.get('media'));
                assert.ok(media.length >= 2);
                assert.equal(media[0].caption, 'Caption');
                assert.ok(options.body.get('file0') instanceof Blob);
            }
        }
        assert.ok(timeout.mock.calls.every(call => call.arguments[0] === 15000));
    });
}

test('Telegram skips empty and oversized attachment sets', async t => {
    const fetch = t.mock.method(globalThis, 'fetch', () => { throw new Error('Unexpected fetch'); });
    await sendTelegramAttachments('test', '123', [], '');
    await sendTelegramAttachments('test', '123', [{ content: { byteLength: 51 * 1024 * 1024 } }], '');
    assert.equal(fetch.mock.callCount(), 0);
});

test('Telegram bounds stalled uploads and contains HTTP failures without retries', async t => {
    const errors = t.mock.method(console, 'error', () => {});
    const controller = new AbortController();
    t.mock.method(AbortSignal, 'timeout', () => controller.signal);
    const fetch = t.mock.method(globalThis, 'fetch', async (_, { signal }) => {
        queueMicrotask(() => controller.abort());
        await new Promise((_, reject) => signal.addEventListener('abort', () => reject(signal.reason), { once: true }));
    });
    await sendTelegramAttachments('test', '123', attachments(1), '');
    assert.equal(fetch.mock.callCount(), 1);
    assert.equal(errors.mock.callCount(), 1);
    fetch.mock.mockImplementation(async () => new Response('unavailable', { status: 503 }));
    await sendTelegramAttachments('test', '123', attachments(2), '');
    assert.equal(fetch.mock.callCount(), 2);
    assert.equal(errors.mock.callCount(), 2);
});
