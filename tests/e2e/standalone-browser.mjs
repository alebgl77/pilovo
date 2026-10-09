import { chromium, expect } from '@playwright/test';
import { mkdir, cp, readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const run = path.resolve(root, 'work', `standalone-acceptance-${stamp}`);
const outputs = path.resolve(root, 'outputs');
const extension = process.env.STANDALONE_EXTENSION_DIR ? path.resolve(process.env.STANDALONE_EXTENSION_DIR) : path.join(root, 'dist');
const origins = ['https://claude.ai/*', 'https://chatgpt.com/*'];
const evidence = {
  startedAt: new Date().toISOString(), checks: [], errors: [], consoleErrors: [], screenshots: [],
  phaseA: { manifest: 'Exact production extension; no permission modification', extensionDirectory: extension, optionalPermission: 'not attempted' },
  phaseB: { manifest: 'TEST ONLY cloned dist with the two origins as required host permissions', providerPages: 'Synthetic routed HTML, no accounts, conversations or provider execution' },
  limitations: ['No authenticated provider session or agent execution is tested.', 'Headless permission state is not evidence of a real human Chrome permission prompt.', 'Legacy migration/provenance and retention boundaries are covered by the separate core suite.'],
};
await mkdir(run, { recursive: true });
await mkdir(outputs, { recursive: true });
const record = (phase, name, details = {}) => { const check = { phase, name, status: 'passed', ...details }; evidence.checks.push(check); console.log(JSON.stringify(check)); };
const rpcResult = (page, request) => page.evaluate(request => chrome.runtime.sendMessage({ channel: 'hub.rpc', request }), request);
const rpc = async (page, request) => { const result = await rpcResult(page, request); assert.equal(result.ok, true, JSON.stringify(result)); return result.data; };
const snapshot = page => rpc(page, { method: 'getSnapshot' });
async function scripts(directory) {
  const found = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) found.push(...await scripts(full));
    else if (entry.name.endsWith('.js')) found.push(full);
  }
  return found;
}
async function launch(directory, profile, phase) {
  const context = await chromium.launchPersistentContext(profile, {
    executablePath: process.env.CHROME_PATH || chromium.executablePath(),
    headless: true, viewport: { width: 1400, height: 1000 },
    proxy: { server: 'http://127.0.0.1:9' },
    args: [`--disable-extensions-except=${directory}`, `--load-extension=${directory}`, '--disable-background-networking'],
  });
  context.setDefaultTimeout(12000);
  // Every HTTPS page is synthetic: no provider request, credentials, account or DOM is inspected.
  await context.route('https://**/*', route => route.fulfill(route.request().resourceType() === 'document' ? { status: 200, contentType: 'text/html', body: '<!doctype html><html lang="en"><title>Synthetic provider fixture</title><h1>Synthetic provider page — no account or conversation</h1></html>' } : { status: 200, contentType: 'text/plain', body: '' }));
  const track = page => {
    page.on('pageerror', error => evidence.errors.push({ phase, kind: 'pageerror', url: page.url(), message: error.message }));
    page.on('console', message => { if (message.type() === 'error') evidence.consoleErrors.push({ phase, message: message.text() }); });
  };
  context.pages().forEach(track); context.on('page', track);
  const worker = context.serviceWorkers()[0] || await context.waitForEvent('serviceworker', { timeout: 20000 });
  const id = new URL(worker.url()).host;
  const page = await context.newPage();
  await page.goto(`chrome-extension://${id}/index.html`);
  await expect(page.getByRole('button', { name: 'Nouvelle préparation', exact: true })).toBeVisible();
  evidence.chromiumVersion = context.browser().version();
  return { context, worker, id, page };
}
async function capture(page, name) {
  const file = `Autoporteur_Chrome_${name}_${stamp}.png`;
  await page.screenshot({ path: path.join(outputs, file), fullPage: true });
  evidence.screenshots.push(file);
}
let browser;
try {
  const manifestText = await readFile(path.join(extension, 'manifest.json'), 'utf8');
  const manifest = JSON.parse(manifestText);
  assert.equal(manifest.version, JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8')).version);
  assert.deepEqual([...manifest.permissions].sort(), ['alarms', 'sidePanel', 'storage']);
  assert.deepEqual([...manifest.optional_host_permissions].sort(), [...origins].sort());
  assert.equal((manifest.host_permissions || []).length, 0);
  assert.equal((manifest.optional_permissions || []).length, 0);
  assert.equal(manifest.content_scripts, undefined);
  const builtScripts = await scripts(extension);
  for (const file of builtScripts) assert.doesNotMatch(await readFile(file, 'utf8'), /\b(?:connectNative|sendNativeMessage|onMessageExternal|onConnectExternal)\b|chrome\.(?:management|scripting)\b|chrome\.tabs\.sendMessage\b/);
  evidence.manifestSha256 = createHash('sha256').update(manifestText).digest('hex');
  evidence.bundleSha256 = Object.fromEntries(await Promise.all(builtScripts.map(async file => [path.relative(extension, file), createHash('sha256').update(await readFile(file)).digest('hex')])));
  record('A', 'exact-production-manifest-and-no-native-or-external-calls', { scripts: builtScripts.length });

  const productionProfile = path.join(run, 'production-profile');
  let session = await launch(extension, productionProfile, 'A'); browser = session.context;
  let page = session.page;
  const permissions = await page.evaluate(() => chrome.permissions.getAll());
  assert.deepEqual([...permissions.permissions].sort(), ['alarms', 'sidePanel', 'storage']);
  assert.deepEqual(permissions.origins || [], []);
  let current = await snapshot(page);
  assert.equal(current.webPreparations.length, 0); assert.equal(current.tasks.length, 0);
  assert.equal(current.bridgeStatus, 'disabled'); assert.equal(current.settings.bridgeEnabled, false);
  assert.ok(current.connectors.every(item => !item.capabilities.launch && item.connection === 'disconnected'));
  assert.equal((await rpcResult(page, { method: 'connectBridge' })).error.code, 'bridge.unavailable');
  record('A', 'empty-native-free-worker-and-no-initial-host-grants', { permissions });
  await capture(page, 'Production_Vide');

  await page.getByRole('button', { name: 'Nouvelle préparation', exact: true }).click();
  let dialog = page.getByRole('dialog');
  await dialog.getByLabel('Titre', { exact: true }).fill('Scénario synthétique — sans consigne conservée');
  const ephemeralPrompt = 'SYNTHETIC_LOCAL_ONLY_DO_NOT_SEND_0_2';
  await dialog.getByLabel('Consigne', { exact: true }).fill(ephemeralPrompt);
  await expect(dialog.getByRole('checkbox')).not.toBeChecked();
  await dialog.getByRole('button', { name: 'Copier la consigne', exact: true }).click();
  await expect(dialog.getByText('Consigne copiée. Collez-la et envoyez-la dans le service.', { exact: true })).toBeVisible();
  assert.equal((await snapshot(page)).webPreparations.length, 0);
  await dialog.getByRole('button', { name: 'Enregistrer', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  current = await snapshot(page);
  const ephemeral = current.webPreparations[0];
  assert.equal(ephemeral.prompt, undefined); assert.equal(ephemeral.status, 'prepared');
  assert.equal(ephemeral.statusProvenance, 'user_reported');
  assert.ok(!JSON.stringify(await rpc(page, { method: 'exportData' })).includes(ephemeralPrompt));
  record('A', 'explicit-copy-and-off-by-default-prompt-not-persisted');

  const opened = browser.waitForEvent('page');
  await page.locator('.preparation-detail').getByRole('button', { name: 'Ouvrir Claude', exact: true }).click();
  const provider = await opened;
  await expect.poll(() => provider.url()).toBe('https://claude.ai/');
  await provider.goto('https://claude.ai/');
  assert.equal((await snapshot(page)).webPreparations[0].status, 'prepared');
  assert.equal((await rpc(page, { method: 'getWebDiscovery' })).permission, 'not-granted');
  record('A', 'open-fixed-provider-without-grant-does-not-send-or-change-status', { url: provider.url(), syntheticPage: true });
  await page.bringToFront();
  await page.getByRole('button', { name: 'J’ai envoyé', exact: true }).click();
  await expect.poll(async () => (await snapshot(page)).webPreparations[0].status).toBe('sent_by_user');
  await page.getByRole('button', { name: 'Marquer terminé', exact: true }).click();
  await expect.poll(async () => (await snapshot(page)).webPreparations[0].status).toBe('completed_by_user');
  await page.reload();
  assert.equal((await snapshot(page)).webPreparations[0].status, 'completed_by_user');
  record('A', 'human-declared-statuses-survive-page-reload');

  const mission = await rpc(page, { method: 'createMission', title: 'Mission synthétique autonome' });
  await page.getByRole('button', { name: 'Nouvelle préparation', exact: true }).click();
  dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('checkbox')).not.toBeChecked();
  await dialog.getByLabel('Titre', { exact: true }).fill('Scénario synthétique — consigne consentie');
  await dialog.getByRole('combobox').nth(0).selectOption('chatgpt-web');
  await dialog.getByRole('combobox').nth(1).selectOption(mission.id);
  await dialog.getByLabel('Consigne', { exact: true }).fill('SYNTHETIC_RETAINED_WITH_CONSENT_0_2');
  await dialog.getByRole('checkbox').check();
  await dialog.getByRole('button', { name: 'Enregistrer', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  const retained = (await snapshot(page)).webPreparations.find(item => item.provider === 'chatgpt-web');
  assert.equal(retained.prompt, 'SYNTHETIC_RETAINED_WITH_CONSENT_0_2'); assert.equal(retained.missionId, mission.id);
  await page.getByLabel('Vos notes (facultatives)', { exact: true }).fill('Note locale synthétique, aucun résultat fournisseur.');
  await page.getByRole('button', { name: 'Enregistrer les notes', exact: true }).click();
  await expect.poll(async () => (await snapshot(page)).webPreparations.find(item => item.id === retained.id).notes).toBe('Note locale synthétique, aucun résultat fournisseur.');
  record('A', 'explicit-retention-mission-and-local-note-persisted');
  await capture(page, 'Production_Preparations');

  await page.getByRole('navigation').getByRole('button', { name: 'Paramètres', exact: true }).click();
  const downloadEvent = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Exporter mes données', exact: true }).click();
  const download = await downloadEvent;
  const exportFile = path.join(run, 'synthetic-export.json'); await download.saveAs(exportFile);
  const exported = JSON.parse(await readFile(exportFile, 'utf8'));
  assert.equal(exported.schemaVersion, 2); assert.equal(exported.webPreparations.length, 2);
  assert.ok(Array.isArray(exported.tasks) && Array.isArray(exported.events));
  assert.ok(!JSON.stringify(exported).includes(ephemeralPrompt));
  record('A', 'real-json-download-schema-2-and-prompt-minimization');

  await browser.close(); browser = undefined;
  session = await launch(extension, productionProfile, 'A-restart'); browser = session.context; page = session.page;
  current = await snapshot(page);
  assert.equal(current.webPreparations.length, 2);
  assert.equal(current.webPreparations.find(item => item.id === retained.id).prompt, retained.prompt);
  assert.equal(current.webPreparations.find(item => item.id === ephemeral.id).status, 'completed_by_user');
  assert.equal(current.bridgeStatus, 'disabled');
  record('A', 'actual-browser-restart-preserves-records-with-native-disabled');
  const stalePreparation = current.webPreparations.find(item => item.id === retained.id);
  assert.ok(Number.isSafeInteger(stalePreparation.revision) && stalePreparation.revision > 0);
  const stalePage = await browser.newPage(); await stalePage.goto(`chrome-extension://${session.id}/index.html`);
  assert.equal((await snapshot(stalePage)).webPreparations.find(item => item.id === retained.id).revision, stalePreparation.revision);
  await rpc(page, { method: 'updateSettings', patch: { retainPrompts: true } });
  await rpc(page, { method: 'updateSettings', patch: { retainPrompts: false } });
  assert.ok((await snapshot(page)).webPreparations.every(item => !item.prompt));
  record('A', 'explicit-legacy-setting-off-erases-web-prompts');
  const staleWrite = await rpcResult(stalePage, { method: 'updateWebPreparation', id: retained.id, patch: { expectedRevision: stalePreparation.revision, prompt: stalePreparation.prompt, retainPrompt: true } });
  assert.equal(staleWrite.ok, false); assert.equal(staleWrite.error.code, 'preparation.conflict');
  const afterErase = (await snapshot(page)).webPreparations.find(item => item.id === retained.id);
  assert.ok(afterErase.revision > stalePreparation.revision); assert.equal(afterErase.prompt, undefined);
  record('A', 'cross-page-stale-write-cannot-restore-erased-prompt', { conflict: staleWrite.error.code });
  await stalePage.close(); await page.bringToFront();
  await rpc(page, { method: 'deleteWebPreparation', id: ephemeral.id });
  assert.equal((await snapshot(page)).webPreparations.length, 1);
  await rpc(page, { method: 'purgeAll' });
  current = await snapshot(page);
  assert.equal(current.webPreparations.length, 0); assert.equal(current.missions.length, 0);
  record('A', 'delete-and-purge-include-web-records');

  await page.getByRole('button', { name: 'Activer la détection des onglets', exact: true }).click();
  let optionalGranted = false;
  try {
    await expect.poll(() => page.evaluate(origins => chrome.permissions.contains({ origins }), origins), { timeout: 5000 }).toBe(true);
    optionalGranted = true;
  } catch {
    evidence.phaseA.optionalPermission = 'Headless UI click did not yield a grant within 5 seconds; real prompt and human refusal remain manual gates';
    record('A', 'optional-permission-prompt-remains-manual', { status: 'manual', initialNoGrantAndOpenFallbackVerified: true });
  }
  if (optionalGranted) {
    evidence.phaseA.optionalPermission = 'Headless click resolved granted; real human prompt remains unverified';
    assert.equal(await page.evaluate(origins => chrome.permissions.remove({ origins }), origins), true);
    assert.equal((await rpc(page, { method: 'getWebDiscovery' })).permission, 'not-granted');
    record('A', 'headless-optional-grant-and-real-api-revocation', { manualPromptVerified: false });
  }
  await browser.close(); browser = undefined;

  const fixture = path.join(run, 'required-host-fixture'); await cp(extension, fixture, { recursive: true });
  const testManifest = { ...manifest, host_permissions: origins }; delete testManifest.optional_host_permissions;
  await writeFile(path.join(fixture, 'manifest.json'), JSON.stringify(testManifest, null, 2));
  session = await launch(fixture, path.join(run, 'fixture-profile'), 'B'); browser = session.context; page = session.page;
  assert.equal((await rpc(page, { method: 'getWebDiscovery' })).permission, 'granted');
  const claude = await browser.newPage(); await claude.goto('https://claude.ai/');
  const chatgpt = await browser.newPage(); await chatgpt.goto('https://chatgpt.com/');
  let detection;
  await expect.poll(async () => { detection = await rpc(page, { method: 'getWebDiscovery' }); return detection.providers.map(item => item.tabs.length); }).toEqual([1, 1]);
  const claudeTab = detection.providers.find(item => item.id === 'claude-web').tabs[0].tabId;
  const chatgptTab = detection.providers.find(item => item.id === 'chatgpt-web').tabs[0].tabId;
  assert.ok(detection.providers.every(item => item.tabs.every(tab => Object.keys(tab).sort().join(',') === 'tabId,windowId')));
  record('B', 'real-chrome-api-detects-only-synthetic-provider-tabs', { counts: [1, 1], identifiersOnly: true });
  await page.bringToFront();
  await expect(page.getByText('1 onglet observé', { exact: true })).toHaveCount(2);
  await page.getByRole('button', { name: 'Retrouver Claude', exact: true }).click();
  const activeTab = () => page.evaluate(async () => (await chrome.tabs.query({ active: true, currentWindow: true }))[0]?.id);
  assert.equal(await activeTab(), claudeTab);
  record('B', 'focus-revalidates-and-activates-matching-provider-tab');
  await claude.goto('https://example.invalid/synthetic-navigation');
  // Navigation emits several tab events; the production guard intentionally fails closed during them.
  await expect.poll(() => rpcResult(page, { method: 'openWebProvider', provider: 'chatgpt-web', tabId: chatgptTab })).toMatchObject({ ok: true });
  assert.equal(await activeTab(), chatgptTab);
  const rejected = await rpcResult(page, { method: 'openWebProvider', provider: 'claude-web', tabId: claudeTab });
  assert.equal(rejected.ok, false); assert.equal(rejected.error.code, 'navigation.changed');
  assert.equal(await activeTab(), chatgptTab);
  record('B', 'changed-origin-known-tab-id-is-rejected-without-focusing-it');
  await page.bringToFront();
  await expect.poll(async () => (await rpc(page, { method: 'getWebDiscovery' })).providers.map(item => item.tabs.length)).toEqual([0, 1]);
  await expect(page.getByText('Aucun onglet observé', { exact: true })).toHaveCount(1);
  await chatgpt.close();
  await expect(page.getByText('Aucun onglet observé', { exact: true })).toHaveCount(2);
  record('B', 'live-tab-navigation-and-closure-refresh-without-manual-registration');
  await capture(page, 'PermissionFixture');
  await browser.close(); browser = undefined;
  assert.deepEqual(evidence.errors, []); assert.deepEqual(evidence.consoleErrors, []);
  evidence.completedAt = new Date().toISOString();
} catch (error) {
  evidence.errors.push({ kind: 'assertion-or-runtime', message: String(error), stack: error.stack });
  console.error(String(error)); process.exitCode = 1;
} finally {
  await browser?.close().catch(() => {});
  const evidenceFile = path.join(run, 'standalone-evidence.json');
  await writeFile(evidenceFile, JSON.stringify(evidence, null, 2), { flag: 'wx' });
  console.log(JSON.stringify({ evidence: evidenceFile, checks: evidence.checks.length, errors: evidence.errors.length, consoleErrors: evidence.consoleErrors.length }));
}
