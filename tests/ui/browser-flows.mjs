import { chromium, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

// Isolated browser context. Fixtures are inserted only in this test profile's preview database.
const base = process.env.HUB_TEST_URL || 'http://127.0.0.1:5173';
const output = path.resolve('tests/ui/results');
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true, ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {}) });
const context = await browser.newContext({ viewport: { width: 1365, height: 900 }, colorScheme: 'light' });
const page = await context.newPage();
const errors = [], checks = [], accessibility = [];
page.on('pageerror', error => errors.push(error.message));
const passed = name => { checks.push(name); process.stdout.write(`PASS ${name}\n`); };
const nav = name => page.getByRole('navigation').getByRole('button', { name, exact: true });
const snapshot = () => page.evaluate(async () => (await import('/src/platform/client.ts')).client.getSnapshot());
const audit = async name => {
  const report = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
  accessibility.push({ name, violations: report.violations.map(({ id, impact, nodes }) => ({ id, impact, nodes: nodes.map(n => ({ target: n.target, summary: n.failureSummary })) })) });
  if (report.violations.length) throw new Error(`${name}: ${JSON.stringify(accessibility.at(-1))}`);
};
try {
  await page.goto(base);
  await expect(page.getByRole('heading', { name: 'Votre attention', exact: true })).toBeVisible();
  expect((await snapshot()).tasks).toHaveLength(0);
  await page.screenshot({ path: path.join(output, 'desktop-empty.png') });
  await audit('desktop-empty-light');
  passed('honest empty preview, desktop light accessibility');

  const create = page.getByRole('button', { name: 'Nouvelle mission', exact: true }).first();
  await create.click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.keyboard.press('Shift+Tab');
  await page.keyboard.press('Shift+Tab');
  expect(await page.evaluate(() => document.querySelector('dialog')?.contains(document.activeElement))).toBe(true);
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(create).toBeFocused();
  await create.click();
  await page.getByLabel('Nom de la mission', { exact: true }).fill('Livraison — revue');
  await page.getByRole('button', { name: 'Enregistrer', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.getByRole('button', { name: 'Renommer', exact: true }).click();
  await page.getByLabel('Nom de la mission', { exact: true }).fill('Livraison <script>window.pwned=true</script>');
  await page.getByRole('button', { name: 'Enregistrer', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.reload();
  expect((await snapshot()).missions).toHaveLength(1);
  expect(await page.evaluate(() => window.pwned)).toBeUndefined();
  passed('mission create, rename, durable reload, literal unsafe text, modal Escape/focus restore');

  await page.evaluate(async () => {
    const { HubRepository } = await import('/src/domain/repository.ts');
    const repo = new HubRepository('agent-control-hub-preview-v1');
    const now = Date.now();
    const fixtures = [
      { sourceId: 'claude-code', taskId: 'receipt', title: 'Reçu à relire (scénario synthétique)', type: 'task.completed', payload: { summary: 'Résumé <script>window.xss=true</script> transmis par la source.', artifacts: [{ label: 'Document de résultat', kind: 'link', url: 'https://example.com/report' }], model: 'Modèle fourni par la source', prompt: 'This prompt must not be retained without consent.' } },
      { sourceId: 'codex', taskId: 'question', title: 'Question de périmètre (scénario synthétique)', type: 'task.waiting', payload: { question: 'Confirmez le périmètre dans votre agent.' } },
      { sourceId: 'codex', taskId: 'failure', title: 'Tentative en échec (scénario synthétique)', type: 'task.failed', payload: { summary: 'Le fichier demandé est introuvable.' } },
      { sourceId: 'claude-code', taskId: 'running', title: 'Analyse en cours (scénario synthétique)', type: 'task.progress', payload: { progress: { current: 2, total: 4, unit: 'fichiers' } } },
    ];
    for (const fixture of fixtures) {
      const common = { schemaVersion: 1, sourceId: fixture.sourceId, taskId: fixture.taskId, runId: 'run-1' };
      await repo.ingest(fixture.sourceId, { ...common, eventId: crypto.randomUUID(), sequence: 1, timestamp: new Date(now - 120000).toISOString(), type: 'task.started', payload: { title: fixture.title } });
      await repo.ingest(fixture.sourceId, { ...common, eventId: crypto.randomUUID(), sequence: 2, timestamp: new Date(now - 60000).toISOString(), type: fixture.type, payload: fixture.payload });
    }
    await repo.close();
  });
  await page.reload();
  await expect(page.locator('.task-row')).toHaveCount(4);
  await expect(page.locator('.task-row').first()).toContainText('Question de périmètre');
  await page.locator('.task-row').filter({ hasText: 'Reçu à relire' }).click();
  await expect(page.locator('.task-title')).toHaveText('Reçu à relire (scénario synthétique)');
  await expect(page.locator('.task-title')).toBeFocused();
  await expect(page.getByText('Non vérifié', { exact: true })).toBeVisible();
  expect(await page.evaluate(() => window.xss)).toBeUndefined();
  await expect(page.getByText('This prompt must not be retained without consent.')).toHaveCount(0);
  await page.getByLabel('Commentaire de revue (facultatif)').fill('Relu ; contrôle limité au document fourni.');
  await page.getByRole('button', { name: 'Accepter le résultat', exact: true }).click();
  await expect(page.getByText('Revue enregistrée.', { exact: true })).toBeVisible();
  const accepted = (await snapshot()).tasks.find(task => task.taskId === 'receipt');
  expect(accepted.review.status).toBe('accepted'); expect(accepted.verification.status).toBe('unverified');
  await expect(page.locator('.task-row')).toHaveCount(3);
  passed('attention derived from events, literal task text, prompt minimization, human acceptance does not verify');

  const missionId = (await snapshot()).missions[0].id;
  await page.getByLabel('Associer à une mission').selectOption(missionId);
  await page.getByRole('button', { name: 'Annuler', exact: true }).click();
  expect((await snapshot()).tasks.find(task => task.taskId === 'receipt').missionId).toBeUndefined();
  await page.getByLabel('Associer à une mission').selectOption(missionId);
  await page.getByRole('button', { name: 'Confirmer', exact: true }).click();
  await expect(page.getByText('Association enregistrée.', { exact: true })).toBeVisible();
  expect((await snapshot()).tasks.find(task => task.taskId === 'receipt').associationHistory).toHaveLength(1);
  passed('mission reassignment requires confirmation and records history');

  await page.getByText('Contrôler l’empreinte d’un fichier', { exact: true }).click();
  const buffer = Buffer.from('Synthetic verification fixture\n');
  const expected = createHash('sha256').update(buffer).digest('hex');
  await page.getByLabel('Fichier local', { exact: true }).setInputFiles({ name: 'fixture.txt', mimeType: 'text/plain', buffer });
  await page.getByLabel('SHA-256 de référence (fourni par vous)', { exact: true }).fill(expected);
  await page.getByRole('button', { name: 'Comparer les empreintes', exact: true }).click();
  await expect(page.getByText('Empreinte conforme', { exact: true })).toBeVisible();
  await page.getByLabel('Fichier local', { exact: true }).setInputFiles({ name: 'fixture.txt', mimeType: 'text/plain', buffer });
  await page.getByLabel('SHA-256 de référence (fourni par vous)', { exact: true }).fill('0'.repeat(64));
  await page.getByRole('button', { name: 'Comparer les empreintes', exact: true }).click();
  await expect(page.getByText('Empreinte différente', { exact: true })).toBeVisible();
  const checked = (await snapshot()).tasks.find(task => task.taskId === 'receipt');
  expect(checked.verificationChecks).toHaveLength(2); expect(checked.verification.status).toBe('unverified'); expect(checked.review.status).toBe('accepted');
  await page.screenshot({ path: path.join(output, 'desktop-receipt.png') });
  await audit('desktop-receipt-light');
  passed('real local SHA256 match/mismatch scoped independently of overall verification and review');

  await nav('Historique').click();
  await expect(page.locator('.task-row')).toHaveCount(4);
  await page.getByRole('button', { name: 'Afficher les filtres' }).click();
  await page.locator('#task-filters select').nth(0).selectOption('codex');
  await page.locator('#task-filters select').nth(1).selectOption('failed');
  await page.locator('#task-filters input[type="date"]').fill(new Date(Date.now() - 86400000).toISOString().slice(0, 10));
  await expect(page.locator('.task-row')).toHaveCount(1);
  await page.getByLabel('Rechercher dans les tâches').fill('no-match-unique');
  await expect(page.getByRole('heading', { name: 'Aucune tâche ne correspond' })).toBeVisible();
  await page.locator('#task-filters').getByRole('button', { name: 'Effacer les filtres' }).click();
  await expect(page.locator('.task-row')).toHaveCount(4);
  passed('history search with source/state/date filters and reset');

  await nav('Paramètres').click();
  await page.getByLabel('Apparence', { exact: true }).selectOption('dark');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.locator('#setting-language').selectOption('en');
  await expect(page.getByRole('heading', { name: 'Settings', exact: true })).toBeVisible();
  await page.getByLabel('Retention period', { exact: true }).selectOption('7');
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export my data', exact: true }).click();
  const download = await downloadPromise;
  const exported = JSON.parse(await readFile(await download.path(), 'utf8'));
  expect(exported.tasks).toHaveLength(4); expect(exported.tasks.some(task => task.prompt)).toBe(false);
  expect(JSON.stringify(exported)).not.toContain('Synthetic verification fixture');
  expect(exported.settings.retentionDays).toBe(7);
  await audit('desktop-settings-dark');
  await page.screenshot({ path: path.join(output, 'desktop-settings-dark.png') });
  passed('English, dark theme, retention and real JSON export without file bytes or unconsented prompts');

  await nav('Connections').click();
  await expect(page.getByRole('button', { name: 'Connect companion', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'Install and configure', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Connect your first task', exact: true })).toBeVisible();
  await audit('desktop-connections-dark');
  passed('preview capability gating and honest companion setup');

  await page.setViewportSize({ width: 360, height: 800 });
  await nav('History').click();
  const question = page.locator('.task-row').filter({ hasText: 'Question de périmètre' });
  await question.click();
  await expect(page.getByRole('heading', { name: 'Question de périmètre (scénario synthétique)', exact: true })).toBeVisible();
  await expect(page.locator('.task-list')).toBeHidden();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await audit('360-task-dark');
  await page.screenshot({ path: path.join(output, 'sidepanel-task-dark.png') });
  await page.getByRole('button', { name: 'Back to list', exact: true }).click();
  await expect(question).toBeFocused();
  await expect(page.locator('.task-pane')).toBeHidden();
  await page.keyboard.press('/');
  await expect(page.getByRole('searchbox', { name: 'Search tasks', exact: true })).toBeFocused();
  passed('360px drilldown/back, no horizontal overflow, keyboard focus restoration and search shortcut');

  await page.emulateMedia({ reducedMotion: 'reduce' });
  expect(await page.locator('.button').first().evaluate(el => getComputedStyle(el).transitionDuration)).toBe('0s');
  await page.getByRole('navigation').getByRole('button', { name: /^Missions/ }).click();
  await page.locator('.mission-tabs button').nth(1).click();
  await page.getByRole('button', { name: 'Delete', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Cancel', exact: true }).click();
  expect((await snapshot()).missions).toHaveLength(1);
  await page.getByRole('button', { name: 'Delete', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Delete', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  expect((await snapshot()).missions).toHaveLength(0); expect((await snapshot()).tasks).toHaveLength(4);
  await nav('History').click();
  await page.locator('.task-row').filter({ hasText: 'Tentative en échec' }).click();
  await page.getByRole('button', { name: 'Delete this attempt', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Cancel', exact: true }).click();
  expect((await snapshot()).tasks).toHaveLength(4);
  await page.getByRole('button', { name: 'Delete this attempt', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Delete', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  expect((await snapshot()).tasks).toHaveLength(3);
  await expect(page.locator('.task-row')).toHaveCount(3);
  passed('targeted deletion confirmations: mission preserves tasks, task removal updates history');
  await nav('Settings').click();
  await page.getByRole('button', { name: 'Erase history', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Cancel', exact: true }).click();
  expect((await snapshot()).tasks).toHaveLength(3);
  await page.getByRole('button', { name: 'Erase history', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Erase history', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  expect((await snapshot()).tasks).toHaveLength(0); expect((await snapshot()).missions).toHaveLength(0);
  passed('reduced motion, purge cancellation and confirmed durable deletion');
  expect(errors).toEqual([]);
  passed('no browser runtime errors');
} catch (error) {
  await page.screenshot({ path: path.join(output, 'failure.png') });
  throw error;
} finally {
  await writeFile(path.join(output, 'browser-report.json'), JSON.stringify({ browser: browser.version(), checks, accessibility, errors }, null, 2));
  await browser.close();
}
