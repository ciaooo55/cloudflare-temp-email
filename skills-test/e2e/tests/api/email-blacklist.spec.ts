import { test, expect } from '@playwright/test';
import { WORKER_URL, createTestAddress, deleteAddress } from '../../fixtures/test-helpers';

const blockedDomain = 'blocked-sender.e2e.invalid';
const blocked = `sender@${blockedDomain}`;
const allowed = 'sender@allowed.e2e.invalid';

test.describe('Sender blacklist receive pipeline', () => {
  for (const [name, from, header, rejected, nestedMime] of [
    ['envelope match', blocked, `From: Trusted <${allowed}>`, true],
    ['parsed From match', allowed, `From: Trusted <${blocked}>`, true],
    ['both match', blocked, `From: ${blocked}`, true],
    ['folded From match', allowed, `From: =?UTF-8?B?5rWL6K+V?=\r\n <${blocked}>`, true],
    ['neither matches', allowed, `From: Other <other@allowed.e2e.invalid>`, false],
    ['display name is not an address', allowed, `From: "${blocked}" <${allowed}>`, false],
    ['Reply-To is not From', allowed, `From: ${allowed}\r\nReply-To: ${blocked}`, false],
    ['missing From still checks envelope', blocked, '', true],
    ['missing From permits allowed envelope', allowed, '', false],
    ['retains case-sensitive matching', allowed, `From: ${blocked.toUpperCase()}`, false],
    ['second From address matches', allowed, `From: ${allowed}, ${blocked}\r\nSender: ${allowed}`, true],
    ['multiple allowed From addresses', allowed, `From: ${allowed}, other@allowed.e2e.invalid\r\nSender: ${allowed}`, false],
    ['repeated From headers', allowed, `From: ${allowed}\r\nFrom: ${blocked}`, true],
    ['blocked From with excessive MIME nesting', allowed, `From: ${blocked}`, true, true],
  ] as const) {
    test(name, async ({ request }) => {
      const { jwt, address } = await createTestAddress(request, 'senderfilter');
      try {
        const raw = [
          ...(header ? [header] : []),
          `To: ${address}`,
          `Subject: Sender blacklist ${name}`,
          `Message-ID: <sender-blacklist-${Date.now()}@test>`,
          'MIME-Version: 1.0',
          ...(nestedMime ? [
            'Content-Type: multipart/mixed; boundary=b0',
            '',
            ...Array.from({ length: 260 }, (_, i) => [
              `--b${i}`,
              `Content-Type: multipart/mixed; boundary=b${i + 1}`,
              '',
            ]).flat(),
          ] : ['Content-Type: text/plain; charset=utf-8', '']),
          'Sender blacklist test',
          ...(nestedMime ? Array.from({ length: 261 }, (_, i) => `--b${260 - i}--`) : []),
        ].join('\r\n');
        const res = await request.post(`${WORKER_URL}/__test/receive_mail`, {
          data: { from, to: address, raw },
        });
        expect(res.ok()).toBe(true);
        const result = await res.json();
        expect(result.success).toBe(!rejected);
        if (rejected) {
          expect(result.rejected).toBe('Reject from address');
          expect(result.forwardedTo).toEqual([]);
          expect(result.replyCalled).toBe(false);
        }

        const mailsRes = await request.get(`${WORKER_URL}/api/mails?limit=10&offset=0`, {
          headers: { Authorization: `Bearer ${jwt}` },
        });
        expect(mailsRes.ok()).toBe(true);
        const { results } = await mailsRes.json();
        expect(results).toHaveLength(rejected ? 0 : 1);
        if (!rejected) expect(results[0].source).toBe(from);
      } finally {
        await deleteAddress(request, jwt);
      }
    });
  }
});
