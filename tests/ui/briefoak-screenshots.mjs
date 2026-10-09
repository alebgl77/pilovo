// Synthetic examples entered through the real browser-preview UI.
// No provider account, external request, conversation or execution is involved.
import { chromium, expect } from '@playwright/test';
import { copyFile, mkdir } from 'node:fs/promises';
import path from 'node:path';

const output = path.resolve('docs/media/screenshots');
const copies = path.resolve('../outputs');
await mkdir(output, { recursive: true });
await mkdir(copies, { recursive: true });
const browser = await chromium.launch({ headless: true, ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : { channel: 'chrome' }) });
const context = await browser.newContext({ viewport: { width: 1365, height: 1100 }, colorScheme: 'light' });
const page = await context.newPage();
const errors = [];
page.on('pageerror', error => errors.push(error.message));
const nav = name => page.getByRole('navigation').getByRole('button', { name: new RegExp(`^${name}( \\d+)?$`) });
const capture = async name => {
  await page.screenshot({ path: path.join(output, name), fullPage: true });
  await copyFile(path.join(output, name), path.join(copies, name));
  console.log(`CAPTURE ${path.join(output, name)}`);
};

try {
  await page.goto(`${process.env.HUB_TEST_URL || 'http://127.0.0.1:5173'}/index.html`);
  await expect(page.getByRole('heading', { name: 'Préparations', exact: true })).toBeVisible();
  await page.locator('.language-select').selectOption('en');
  await expect(page.locator('.brand strong')).toHaveText('Briefoak');
  await page.waitForFunction(() => [...document.querySelectorAll('.brand-symbol img')].every(image => image.complete && image.naturalWidth > 0));
  await nav('Missions').click();
  await page.getByRole('button', { name: 'New mission', exact: true }).click();
  await page.getByLabel('Mission name', { exact: true }).fill('Website refresh · sample');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toHaveCount(0);
  const prepare = async (title, provider, prompt, status) => {
    await page.getByRole('button', { name: 'New preparation', exact: true }).click();
    await page.getByLabel('Title', { exact: true }).fill(title);
    await page.getByRole('combobox', { name: 'Service', exact: true }).selectOption(provider);
    await dialog.getByRole('textbox', { name: 'Prompt', exact: true }).fill(prompt);
    await page.getByLabel('Keep this prompt on this device').check();
    await dialog.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(dialog).toHaveCount(0);
    if (status === 'sent') await page.getByRole('button', { name: 'I sent it', exact: true }).click();
    if (status === 'complete') await page.getByRole('button', { name: 'Mark complete', exact: true }).click();
  };
  await prepare('Clarify the audience', 'claude-web', 'Sample brief: propose five questions that help a small design studio clarify the audience for its website. Keep each question concise.', 'complete');
  await prepare('Draft the client summary', 'chatgpt-web', 'Sample brief: turn the agreed website outline into a short client summary. Explain the three priorities and finish with the next decision to make.', 'prepared');
  await prepare('Review the first outline', 'claude-web', 'Review this sample website outline: audience, selected work, collaboration, contact.\n\nSuggest a clearer order and identify one missing question. Keep the review concise.', 'sent');
  await page.getByLabel('Your notes (optional)').fill('Synthetic example only. No prompt was sent to a provider.\n\nNext step: compare the outline with the project brief.');
  await page.getByRole('button', { name: 'Save notes', exact: true }).click();
  await page.getByText('Show saved prompt', { exact: true }).click();
  await page.getByRole('button', { name: 'Close', exact: true }).click();
  await expect(page.locator('.preparation-detail')).toContainText('Sending confirmed by you');
  await capture('Briefoak_desktop_mission_synthetic.png');

  await nav('Settings').click();
  await page.getByLabel('Appearance', { exact: true }).selectOption('dark');
  await page.setViewportSize({ width: 360, height: 800 });
  await nav('Missions').click();
  await page.getByRole('button', { name: 'Website refresh · sample 3', exact: true }).click();
  await page.getByRole('button', { name: 'Close', exact: true }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await expect(page.locator('.preparation-row')).toHaveCount(3);
  await page.locator('.preparation-workspace').evaluate(element => element.scrollIntoView({ block: 'start' }));
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await capture('Briefoak_360_dark_synthetic.png');
  expect(errors).toEqual([]);
  console.log('PASS real Briefoak UI captures with synthetic local examples; no provider interaction');
} finally {
  await browser.close();
}
