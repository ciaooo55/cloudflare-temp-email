import assert from 'node:assert/strict';
import { test } from 'node:test';
import { secretEquals, matchesSecret, isValidJwtSecret } from './secret_compare.ts';

test('secret comparison accepts exact UTF-8 values and rejects unequal lengths and invalid inputs', () => {
    for (const secret of ['', 'password', '密码🔑', 'a'.repeat(10000)]) {
        assert.equal(secretEquals(secret, secret), true);
        assert.equal(secretEquals(secret + 'x', secret), false);
        assert.equal(secretEquals('x' + secret, secret), false);
    }
    assert.equal(secretEquals('Password', 'password'), false);
    for (const value of [undefined, null, 123, {}, []]) assert.equal(secretEquals(value, 'password'), false);
    assert.equal(matchesSecret('old', ['new', 'old']), true);
    assert.equal(matchesSecret('new', ['new', 'old']), true);
    assert.equal(matchesSecret('wrong', ['new', 'old']), false);
    assert.equal(matchesSecret('password', []), false);
});

test('JWT configuration rejects empty and known placeholder keys without rotating existing keys', () => {
    for (const secret of [undefined, '', ' ', 'xxx', ' xxx ']) assert.equal(isValidJwtSecret(secret), false);
    for (const secret of ['existing-key', 'a'.repeat(20)]) assert.equal(isValidJwtSecret(secret), true);
});
