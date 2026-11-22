import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { isBlocked } from './black_list.ts';
import { CONSTANTS } from '../constants.ts';
import { createD1 } from '../../test-loader/d1.mjs';
import { WORKER_STORE_SCHEMA } from '../worker_store.ts';

const blockedDomain = 'blocked-sender.e2e.invalid';
const blocked = `sender@${blockedDomain}`;
const allowed = 'sender@allowed.e2e.invalid';
const senderMessage = (from, headerFrom) => ({
  from, headers: new Headers(headerFrom ? { From: headerFrom } : {}),
});

describe('Sender blacklist matching', () => {
  for (const source of ['environment', 'legacy KV']) {
    for (const [name, from, headerFrom, expected] of [
      ['envelope only', blocked, allowed, true],
      ['header only', allowed, blocked, true],
      ['both', blocked, blocked, true],
      ['neither', allowed, allowed, false],
      ['missing header', blocked, undefined, true],
      ['missing header, allowed envelope', allowed, undefined, false],
      ['empty envelope', '', blocked, true],
      ['second From address matches', allowed, `${allowed}, ${blocked}`, true],
      ['multiple allowed From addresses', allowed, `${allowed}, other@allowed.e2e.invalid`, false],
      ['quoted display name with comma', allowed, `"Example, Inc." <${blocked}>`, true],
      ['display name is not matched', allowed, `"${blocked}" <${allowed}>`, false],
      ['encoded display name', allowed, `=?UTF-8?B?5rWL6K+V?= <${blocked}>`, true],
    ]) {
      test(`${source}: ${name}`, async () => {
        let reads = 0;
        const env = {
          DB: createD1(),
          BLACK_LIST: source === 'environment' ? `other.invalid,${blockedDomain}` : '',
          KV: { get: async (key, type) => {
            reads++;
            assert.equal(key, CONSTANTS.EMAIL_KV_BLACK_LIST);
            assert.equal(type, 'json');
            return source === 'legacy KV' ? ['other.invalid', blockedDomain] : [];
          } },
        };
        assert.equal(await isBlocked(senderMessage(from, headerFrom), env), expected);
        assert.equal(reads, source === 'environment' && expected ? 0 : 1);
      });
    }
  }

  test('environment blacklist works without KV', async () => {
    const env = { BLACK_LIST: blockedDomain };
    assert.equal(await isBlocked(senderMessage(allowed, blocked), env), true);
    assert.equal(await isBlocked(senderMessage(allowed), env), false);
    assert.equal(await isBlocked(senderMessage(allowed, blocked), {}), false);
  });

  test('missing legacy KV value does not reject mail', async () => {
    assert.equal(await isBlocked(senderMessage(allowed, blocked), {
      DB: createD1(), KV: { get: async () => null },
    }), false);
  });

  for (const source of ['environment', 'legacy KV']) {
    for (const failure of ['header read', 'address parsing']) {
      for (const from of [blocked, allowed]) {
        test(`${source}: ${failure} failure preserves envelope check for ${from}`, async () => {
          const message = senderMessage(from);
          message.headers.get = () => {
            if (failure === 'header read') throw new Error('Injected header read failure');
            return { toString: () => { throw new Error('Injected address parsing failure'); } };
          };
          let reads = 0;
          const env = {
            DB: createD1(),
            BLACK_LIST: source === 'environment' ? blockedDomain : '',
            KV: { get: async () => {
              reads++;
              return source === 'legacy KV' ? [blockedDomain] : [];
            } },
          };
          assert.equal(await isBlocked(message, env), from === blocked);
          assert.equal(reads, source === 'environment' && from === blocked ? 0 : 1);
        });
      }
    }

    for (const [name, rule, expected] of [
      ['exact address', blocked, true],
      ['substring', 'blocked-sender', true],
      ['case sensitive', blocked.toUpperCase(), false],
      ['does not trim rules', ` ${blockedDomain}`, false],
      ['empty rule matches', '', true],
    ]) {
      test(`${source}: preserves legacy ${name}`, async () => {
        const env = {
          DB: createD1(),
          BLACK_LIST: source === 'environment' ? `other.invalid,${rule}` : '',
          KV: { get: async () => source === 'legacy KV' ? ['other.invalid', rule] : [] },
        };
        assert.equal(await isBlocked(senderMessage(blocked), env), expected);
      });
    }
  }

  test('does not swallow KV errors while importing into the current store', async () => {
    const DB = createD1();
    DB.sqlite.exec(WORKER_STORE_SCHEMA);
    await assert.rejects(isBlocked(senderMessage(allowed), {
      DB, KV: { get: async () => { throw new Error('KV unavailable'); } },
    }), /KV unavailable/);
  });
});
