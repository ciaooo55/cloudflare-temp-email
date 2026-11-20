import assert from 'node:assert/strict';
import { test } from 'node:test';
import { extractEmailInfo } from './code_extract.ts';

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
