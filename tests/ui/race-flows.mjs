import { chromium, expect } from '@playwright/test';
const browser = await chromium.launch({ headless: true, ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {}) });
const context = await browser.newContext({ viewport: { width: 1300, height: 900 } });
const page = await context.newPage();
const state = () => page.evaluate(() => window.__hubHarness.pending());
try {
  await page.goto(`${process.env.HUB_TEST_URL || 'http://127.0.0.1:5173'}/tests/ui/race-harness.html`);
  await page.waitForFunction(() => window.__hubHarness?.pending().snapshots === 1);
  await page.evaluate(() => window.__hubHarness.resolveSnapshot(0, 'Initial mission'));
  await expect(page.getByRole('heading', { name: 'Activité', exact: true })).toBeVisible();
  await page.getByRole('navigation').getByRole('button', { name: 'Missions 1', exact: true }).click();
  await page.evaluate(() => { window.__hubHarness.signal(); window.__hubHarness.signal(); });
  expect((await state()).snapshots).toBe(3);
  await page.evaluate(() => window.__hubHarness.resolveSnapshot(2, 'Latest mission'));
  await expect(page.locator('.mission-tabs')).toContainText('Latest mission');
  await page.evaluate(() => window.__hubHarness.resolveSnapshot(1, 'Stale mission'));
  await expect(page.locator('.mission-tabs')).toContainText('Latest mission');
  await expect(page.locator('.mission-tabs')).not.toContainText('Stale mission');
  process.stdout.write('PASS out-of-order snapshots cannot overwrite newer state\n');

  await page.getByRole('navigation').getByRole('button', { name: 'Historique', exact: true }).click();
  await page.locator('.task-row').filter({ hasText: 'Synthetic task A' }).click();
  await page.locator('.task-row').filter({ hasText: 'Synthetic task B' }).click();
  expect((await state()).timelines).toHaveLength(2);
  await page.evaluate(() => window.__hubHarness.resolveTimeline(1, 'CURRENT B EVENT'));
  await expect(page.locator('.timeline')).toContainText('CURRENT B EVENT');
  await page.evaluate(() => window.__hubHarness.resolveTimeline(0, 'STALE A EVENT'));
  await expect(page.locator('.timeline')).not.toContainText('STALE A EVENT');
  process.stdout.write('PASS late timeline from a previously selected task is ignored\n');

  await page.getByRole('navigation').getByRole('button', { name: 'Missions 1', exact: true }).click();
  await page.getByRole('button', { name: 'Nouvelle mission', exact: true }).click();
  await page.getByLabel('Nom de la mission', { exact: true }).fill('New mission');
  await page.getByRole('button', { name: 'Enregistrer', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Enregistrement…', exact: true })).toBeDisabled();
  await page.getByRole('dialog').locator('form').evaluate(form => form.requestSubmit());
  expect((await state()).mutations).toBe(1);
  await page.evaluate(() => window.__hubHarness.rejectMutation(0));
  await expect(page.getByRole('dialog').getByRole('alert')).toContainText('L’enregistrement local a échoué');
  await expect(page.getByRole('dialog')).not.toContainText('sensitive raw diagnostics');
  await expect(page.getByRole('button', { name: 'Enregistrer', exact: true })).toBeEnabled();
  process.stdout.write('PASS duplicate submission locked, save failure remains accessible inside modal without leaking diagnostics\n');

  await page.evaluate(() => window.__hubHarness.unmount());
  expect((await state()).listeners).toBe(0);
  process.stdout.write('PASS subscription cleaned up on unmount\n');
} finally { await browser.close(); }
