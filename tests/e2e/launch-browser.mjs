import { chromium, expect } from '@playwright/test';
import { mkdir, cp, readFile, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import assert from 'node:assert/strict';
const run = path.resolve('../work/browser-acceptance-owned', `launch-${Date.now()}`); await mkdir(run, { recursive: true });
const extension = path.join(run, 'test-extension'); await cp('dist', extension, { recursive: true });
const manifest = JSON.parse(await readFile(path.join(extension, 'manifest.json'), 'utf8'));
manifest.permissions = [...new Set([...manifest.permissions, 'nativeMessaging', 'tabs', 'management'])]; delete manifest.optional_permissions;
await writeFile(path.join(extension, 'manifest.json'), JSON.stringify(manifest, null, 2));
const evidence = { startedAt: new Date().toISOString(), permissionVariant: 'TEST ONLY required nativeMessaging/tabs/management; real optional grants remain manual', checks: [], errors: [], registryCleanup: false };
const record = (name, details = {}) => { evidence.checks.push({ name, ...details }); console.log(JSON.stringify({ name, ...details })); };
const command = (script, args) => { const result = spawnSync('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', path.resolve(script), ...args], { encoding: 'utf8', windowsHide: true }); if (result.status !== 0) throw new Error(result.stderr.slice(0, 1000) || `PowerShell exit ${result.status}`); };
let browser, registered = false; const registration = path.join(run, 'companion-install', 'dev.agentcontrolhub.bridge.json');
try {
  browser = await chromium.launchPersistentContext(path.join(run, 'browser-profile'), { executablePath: process.env.CHROME_PATH || chromium.executablePath(), headless: true, args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`] });
  const worker = browser.serviceWorkers()[0] ?? await browser.waitForEvent('serviceworker'); const id = new URL(worker.url()).host;
  evidence.chromiumVersion = browser.browser().version(); evidence.extensionId = id;
  command('scripts/install-companion.ps1', ['-ExtensionId', id, '-InstallDirectory', path.join(run, 'companion-install'), '-NodeExecutable', process.execPath, '-BundleDirectory', path.resolve('companion-dist'), '-PrepareOnly']);
  command('tests/e2e/register-owned.ps1', ['-Action', 'register', '-ManifestPath', registration]); registered = true;
  const page = await browser.newPage(); page.on('pageerror', error => evidence.errors.push(error.message));
  await page.goto(`chrome-extension://${id}/index.html`);
  const rpc = async request => { const value = await page.evaluate(request => chrome.runtime.sendMessage({ channel: 'hub.rpc', request }), request); assert.equal(value.ok, true, JSON.stringify(value)); return value.data; };
  await page.getByRole('navigation').getByRole('button', { name: 'Connexions', exact: true }).click();
  await page.getByRole('button', { name: 'Connecter le compagnon', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Lancer', exact: true }).first()).toBeEnabled({ timeout: 30000 });
  const detection = await rpc({ method: 'getAgentDetection' });
  assert.deepEqual(detection.localAgents.map(item => [item.sourceId, item.availability]), [['claude-code', 'available'], ['codex', 'available']]);
  assert.ok(detection.browserAgents.every(item => item.presence === 'unknown'));
  record('automatic-real-cli-detection-without-declaration', { agents: detection.localAgents, browserPresence: 'Neither known official extension is installed in this isolated profile; no false activity claim.' });
  for (const [index, source] of ['claude-code', 'codex'].entries()) {
    await page.getByRole('button', { name: 'Lancer', exact: true }).nth(index).click();
    await page.getByLabel('Titre de la tâche', { exact: true }).fill(`Live launch acceptance ${source}`);
    await page.getByLabel('Consigne', { exact: true }).fill('Reply with exactly HUB_LAUNCH_OK. Do not use any tool or inspect files. This is an integration connectivity test.');
    await page.getByLabel('Conserver la réponse dans le reçu local').check();
    await page.getByRole('button', { name: 'Lancer la tâche', exact: true }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0, { timeout: 30000 });
    record('real-user-interface-launch-accepted', { source });
  }
  let snapshot;
  await expect.poll(async () => { snapshot = await rpc({ method: 'getSnapshot' }); return snapshot.tasks.length === 2 && snapshot.tasks.every(task => ['completed', 'failed', 'cancelled'].includes(task.execution)); }, { timeout: 145000, intervals: [1000, 2000] }).toBe(true);
  for (const task of snapshot.tasks) {
    const events = await rpc({ method: 'getTaskEvents', key: task.key });
    record('real-provider-terminal-receipt', { source: task.sourceId, execution: task.execution, verification: task.verification.status, eventIds: events.map(item => item.eventId), taskId: task.taskId, runId: task.runId, exactAnswerMatched: task.summary?.trim() === 'HUB_LAUNCH_OK', noPromptField: !task.prompt });
    assert.equal(task.execution, 'completed', `${task.sourceId}: ${task.summary}`);
    assert.equal(task.summary.trim(), 'HUB_LAUNCH_OK'); assert.equal(task.verification.status, 'unverified'); assert.equal(task.prompt, undefined);
  }
  const mission = await rpc({ method: 'createMission', title: 'Live launch — Claude Code + Codex' });
  for (const task of snapshot.tasks) await rpc({ method: 'assignTask', key: task.key, missionId: mission.id });
  await page.getByRole('navigation').getByRole('button', { name: 'Historique', exact: true }).click();
  await page.screenshot({ path: path.join(run, 'real-launch-receipts.png'), fullPage: true });
  record('both-real-launches-grouped-in-one-mission');
  await rpc({ method: 'disconnectBridge' }); await page.reload();
  assert.equal((await rpc({ method: 'getSnapshot' })).tasks.filter(task => task.execution === 'completed').length, 2);
  record('real-receipts-durable-after-disconnect-and-reload'); evidence.completedAt = new Date().toISOString();
} catch (error) { evidence.errors.push(String(error)); console.error(String(error)); process.exitCode = 1; }
finally {
  await browser?.close().catch(() => {});
  if (registered) { try { command('tests/e2e/register-owned.ps1', ['-Action', 'unregister', '-ManifestPath', registration]); evidence.registryCleanup = true; } catch (error) { evidence.errors.push(String(error)); process.exitCode = 1; } }
  await writeFile(path.join(run, 'launch-evidence.json'), JSON.stringify(evidence, null, 2));
  console.log(JSON.stringify({ evidence: path.join(run, 'launch-evidence.json'), checks: evidence.checks.length, errors: evidence.errors.length, registryCleanup: evidence.registryCleanup }));
}
