import { test, expect } from '@playwright/test';
import { WORKER_URL, TEST_DOMAIN } from '../../fixtures/test-helpers';

test.describe('Address API Defaults', () => {
  test('falls back to domains when default domains is empty', async ({ request }) => {
    const uniqueName = `fallback${Date.now().toString(36)}`;
    const res = await request.post(`${WORKER_URL}/api/new_address`, {
      data: { name: uniqueName },
    });

    expect(res.ok()).toBe(true);
    const body = await res.json();

    expect(body.address).toBe(`tmp${uniqueName}@${TEST_DOMAIN}`);
    expect(body.jwt).toBeTruthy();
    expect(body.address_id).toBeGreaterThan(0);
  });

});
