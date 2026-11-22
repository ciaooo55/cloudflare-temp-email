import { expect, test } from '@playwright/test';
import { FRONTEND_URL, WORKER_URL, seedTestMail, TEST_DOMAIN } from '../../fixtures/test-helpers';

test('admin workspace reads catch-all mail privately and opens reply and forward drafts', async ({ page, request }) => {
  const address = `unregistered-${Date.now()}@${TEST_DOMAIN}`;
  const subject = `Workspace ${Date.now()}`;
  await seedTestMail(request, address, {
    subject, text: 'Your verification code: 123456',
    html: '<p>Your verification code: 123456</p><img src="https://images.example.invalid/tracker.png">',
  });
  let imageRequests = 0;
  await page.route('https://images.example.invalid/**', async route => {
    imageRequests++;
    await route.fulfill({ status: 200, contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg"/>' });
  });
  await page.goto(`${FRONTEND_URL}/en/admin`);
  await page.locator('.address-query input').fill(address);
  await page.locator('.address-query button').click();
  const row = page.locator('.message-row').filter({ hasText: subject });
  await expect(row).toBeVisible();
  await expect(row).toHaveClass(/unread/);
  await row.click();
  await expect(page.locator('.mail-text')).toContainText('123456');
  await expect(page.locator('.message-addresses')).toContainText(address);
  expect(imageRequests).toBe(0);
  await expect(row).not.toHaveClass(/unread/);
  await page.getByRole('button', { name: 'Mark as Unread', exact: true }).click();
  await expect(row).toHaveClass(/unread/);
  await page.getByRole('button', { name: 'Show Images', exact: true }).click();
  await expect.poll(() => imageRequests).toBe(1);
  await page.getByRole('button', { name: 'Reply', exact: true }).click();
  await expect(page.locator('#admin-send-mail-recipient-address')).toHaveValue(`sender@${TEST_DOMAIN}`);
  await expect(page.locator('#admin-send-mail-subject')).toHaveValue(`Reply: ${subject}`);
  await page.getByRole('button', { name: 'Emails', exact: true }).click();
  await page.locator('.message-row').filter({ hasText: subject }).click();
  await page.getByRole('button', { name: 'Forward', exact: true }).click();
  await expect(page.locator('#admin-send-mail-subject')).toHaveValue(`Forward: ${subject}`);
});

test('mobile starts on the inbox and has no removed destinations', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.addInitScript(() => sessionStorage.setItem('adminTab', 'appearance'));
  await page.goto(`${FRONTEND_URL}/en/admin`);
  await expect(page.getByRole('heading', { name: 'Emails', exact: true })).toBeVisible();
  await page.locator('.mobile-navigation button').last().click();
  for (const name of ['AI Extraction', 'Database Manager', 'Create Address', 'Webhook', 'Appearance', 'About']) {
    await expect(page.locator('.n-drawer').getByText(name, { exact: true })).toHaveCount(0);
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('removed admin endpoints return not-found instead of maintaining compatibility handlers', async ({ request }) => {
  for (const [method, path] of [
    ['POST', '/admin/new_address'], ['GET', '/admin/mails_unknow'],
    ['GET', '/admin/worker/configs'], ['GET', '/admin/ai_extract/settings'],
    ['GET', '/admin/config/unused'], ['POST', '/admin/config'],
  ]) {
    const response = await request.fetch(WORKER_URL + path, { method, data: {} });
    expect(response.status(), path).toBe(404);
  }
});
