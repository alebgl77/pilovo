import { chromium, expect } from '@playwright/test';
import { build } from 'esbuild';
import { cp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import assert from 'node:assert/strict';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const run = path.join(root, 'work', `activity-acceptance-${stamp}`);
await mkdir(run, { recursive: true });
const checks = [], failures = [];
let context;
const record = name => { checks.push(name); console.log(`PASS ${name}`); };
const canary = 'PRIVATE_PAGE_CANARY_NEVER_EXPORT';
const gpt = (state = 'idle', language = 'fr') => `<!doctype html><html><title>${canary}</title><body><article>${canary}</article><form><div role="textbox" contenteditable="true">${canary}</div><button aria-label="${state === 'working' ? language === 'fr' ? 'Arrêter' : 'Stop generating' : language === 'fr' ? 'Démarrer une conversation vocale' : 'Start voice mode'}">Control</button><button disabled aria-label="Dicter">Dictate</button></form>${state === 'finished' ? `<span role="status" aria-live="polite">${language === 'fr' ? 'Réponse terminée' : 'Response complete'}</span>` : ''}</body></html>`;
const claude = (state = 'idle', language = 'fr') => `<!doctype html><html><body><article>${canary}</article><form><div data-testid="chat-input" role="textbox" contenteditable="true">${canary}</div><button data-testid="chat-input-send" disabled>Send</button>${state === 'working' ? `<button aria-label="${language === 'fr' ? 'Arrêter' : 'Stop response'}">Stop</button>` : ''}</form>${state === 'finished' || state === 'quota' ? '<div data-testid="response-status-announcer" role="status">Claude a terminé sa réponse.</div>' : ''}${state === 'quota' ? '<div data-cds="ChatComposerNotices"><div role="status" aria-live="polite" aria-atomic="false">Vous n’avez plus de crédits d’utilisation. <button>Acheter plus</button></div></div>' : ''}</body></html>`;
const rpcResult = (page, request) => page.evaluate(request => chrome.runtime.sendMessage({ channel: 'hub.rpc', request }), request);
const rpc = async (page, request) => { const response = await rpcResult(page, request); assert.equal(response.ok, true, JSON.stringify(response)); return response.data; };
try {
  let extensionDirectory = path.join(root, 'dist'), profileDirectory = path.join(run, 'profile');
  const launch = () => chromium.launchPersistentContext(profileDirectory, {
    executablePath: process.env.CHROME_PATH || chromium.executablePath(), headless: true,
    proxy: { server: 'http://127.0.0.1:9' },
    args: [`--disable-extensions-except=${extensionDirectory}`, `--load-extension=${extensionDirectory}`, '--disable-background-networking'],
  });
  context = await launch();
  context.setDefaultTimeout(15000);
  await context.route('https://**/*', route => route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: route.request().url().startsWith('https://claude.ai/') ? claude() : gpt() }));
  let worker = context.serviceWorkers()[0] || await context.waitForEvent('serviceworker');
  let extensionId = new URL(worker.url()).host;
  let ui = await context.newPage(); await ui.goto(`chrome-extension://${extensionId}/index.html`);
  assert.deepEqual((await rpc(ui, { method: 'getWebActivity' })).observations, []);
  assert.equal((await rpc(ui, { method: 'getWebDiscovery' })).permission, 'not-granted');
  record('production extension starts without host grants or observations');
  // The separate fixture changes only the host permission declaration. Optional prompt/revoke remain unit/manual gates.
  await context.close();
  extensionDirectory = path.join(run, 'required-host-fixture'); profileDirectory = path.join(run, 'fixture-profile');
  await cp(path.join(root, 'dist'), extensionDirectory, { recursive: true });
  const fixtureManifest = JSON.parse(await readFile(path.join(extensionDirectory, 'manifest.json'), 'utf8'));
  fixtureManifest.host_permissions = ['https://chatgpt.com/*']; fixtureManifest.optional_host_permissions = ['https://claude.ai/*'];
  await writeFile(path.join(extensionDirectory, 'manifest.json'), JSON.stringify(fixtureManifest));
  context = await launch(); context.setDefaultTimeout(15000);
  await context.route('https://**/*', route => route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: route.request().url().startsWith('https://claude.ai/') ? claude() : gpt() }));
  worker = context.serviceWorkers()[0] || await context.waitForEvent('serviceworker');
  extensionId = new URL(worker.url()).host;
  ui = await context.newPage(); await ui.goto(`chrome-extension://${extensionId}/index.html`);
  assert.equal(await ui.evaluate(() => chrome.permissions.contains({ origins: ['https://chatgpt.com/*'] })), true);
  const provider = await context.newPage(); await provider.goto('https://chatgpt.com/c/synthetic-private-canary');
  const activity = () => rpc(ui, { method: 'getWebActivity' });
  const states = async () => (await activity()).observations.map(item => item.state);
  await expect.poll(states, { timeout: 12000 }).toEqual(['idle']);
  const discovery = await rpc(ui, { method: 'getWebDiscovery' });
  assert.equal(discovery.providers.find(item => item.id === 'chatgpt-web').permission, 'granted');
  assert.equal(discovery.providers.find(item => item.id === 'claude-web').permission, 'not-granted');
  record('test-only single-provider required-host fixture registers and bootstraps top frame');

  await provider.evaluate(() => document.querySelector('form button').setAttribute('aria-label', 'Arrêter'));
  await expect.poll(states).toEqual(['working']);
  await provider.evaluate(() => {
    document.querySelector('form button').setAttribute('aria-label', 'Démarrer une conversation vocale');
    const status = document.createElement('span'); status.role = 'status'; status.setAttribute('aria-live', 'polite'); status.textContent = 'Réponse terminée'; document.body.append(status);
  });
  await expect.poll(states).toEqual(['attention']);
  const observation = (await activity()).observations[0]; assert.equal(observation.attention.reason, 'response_ready');
  await expect.poll(() => ui.evaluate(() => chrome.action.getBadgeText({}))).toBe('1');
  // Response ready: brand olive with white text; the default French settings word the title.
  assert.deepEqual(await ui.evaluate(() => chrome.action.getBadgeBackgroundColor({})), [75, 93, 58, 255]);
  assert.deepEqual(await ui.evaluate(() => chrome.action.getBadgeTextColor({})), [255, 255, 255, 255]);
  await expect.poll(() => ui.evaluate(() => chrome.action.getTitle({}))).toBe('Pilovo — 1 à vérifier (réponse disponible)');
  const exportText = JSON.stringify(await rpc(ui, { method: 'exportData' }));
  assert.ok(!exportText.includes(canary)); assert.ok(!JSON.stringify(await activity()).includes(canary));
  record('observed work plus two positive completion reads create one metadata-only attention and badge');

  // Tab-level identity: the worker's number, Chrome's real tab position after a move, and a memory-only label.
  const labelCanary = 'PRIVATE_LABEL_CANARY';
  assert.equal(observation.sessionNumber, 1); assert.ok(Number.isInteger(observation.tabIndex) && observation.tabIndex >= 0, JSON.stringify(observation));
  assert.equal((await rpcResult(ui, { method: 'labelWebActivity', id: observation.id, label: 'Revue\u202Econtrat' })).ok, false);
  await rpc(ui, { method: 'labelWebActivity', id: observation.id, label: `  ${labelCanary}  ` });
  assert.equal((await activity()).observations[0].label, labelCanary);
  await ui.evaluate(id => chrome.tabs.move(id, { index: 0 }), observation.tabId);
  await expect.poll(async () => (await activity()).observations[0]?.tabIndex).toBe(0);
  assert.equal((await activity()).observations[0].id, observation.id);
  assert.ok(!JSON.stringify(await rpc(ui, { method: 'exportData' })).includes(labelCanary));
  assert.ok(!(await ui.evaluate(() => chrome.action.getTitle({}))).includes(labelCanary));
  record('stable session number, real tab position after a move and a memory-only label absent from export and badge title');

  await rpc(ui, { method: 'focusWebActivity', id: observation.id });
  assert.equal(await ui.evaluate(async () => (await chrome.tabs.query({ active: true }))[0].id), observation.tabId);
  await rpc(ui, { method: 'acknowledgeWebActivity', id: observation.id, attentionId: observation.attention.id });
  await expect.poll(() => ui.evaluate(() => chrome.action.getBadgeText({}))).toBe('');
  await expect.poll(() => ui.evaluate(() => chrome.action.getTitle({}))).toBe('Pilovo');
  record('focus revalidates ephemeral row and acknowledgement clears its badge');

  // Optional automatic seen, read through the real Chrome window and tab APIs (no tabs permission): off by default; on,
  // an attention on the active tab of the focused window is seen after the delay, never one behind the extension page.
  const complete = async () => {
    await provider.evaluate(() => document.querySelector('form button').setAttribute('aria-label', 'Arrêter'));
    await expect.poll(states).toEqual(['working']);
    // A new completion: the announcer's text node is replaced, as the provider does when a newer answer ends.
    await provider.evaluate(() => { document.querySelector('form button').setAttribute('aria-label', 'Démarrer une conversation vocale'); document.querySelector('span[role="status"]').textContent = 'Réponse terminée'; });
    await expect.poll(states).toEqual(['attention']);
  };
  const seenNow = async () => (await activity()).observations[0]?.attention?.acknowledged;
  assert.equal((await rpc(ui, { method: 'getSnapshot' })).settings.autoAcknowledgeSeconds, 0);
  assert.equal((await rpcResult(ui, { method: 'updateSettings', patch: { autoAcknowledgeSeconds: 10 } })).ok, false);
  await provider.bringToFront(); await complete();
  await new Promise(resolve => setTimeout(resolve, 6500)); assert.equal(await seenNow(), false);
  assert.equal((await rpc(ui, { method: 'updateSettings', patch: { autoAcknowledgeSeconds: 5 } })).autoAcknowledgeSeconds, 5);
  const enabled = Date.now();
  await expect.poll(seenNow, { timeout: 12000, intervals: [250] }).toBe(true);
  assert.ok(Date.now() - enabled >= 4500, `seen after ${Date.now() - enabled} ms`);
  await expect.poll(() => ui.evaluate(() => chrome.action.getBadgeText({}))).toBe('');
  await ui.bringToFront(); await complete();
  await new Promise(resolve => setTimeout(resolve, 7000)); assert.equal(await seenNow(), false);
  assert.equal(await ui.evaluate(() => chrome.action.getBadgeText({})), '1');
  // Switching to the provider tab (a real tab activation) starts the dwell: seen after the delay, counted from the switch.
  await provider.bringToFront(); const switched = Date.now();
  await expect.poll(seenNow, { timeout: 12000, intervals: [250] }).toBe(true);
  assert.ok(Date.now() - switched >= 4500, `seen ${Date.now() - switched} ms after the switch`);
  await expect.poll(() => ui.evaluate(() => chrome.action.getBadgeText({}))).toBe('');
  // Off again: a new attention on the viewed tab stays to review until seen by hand.
  assert.equal((await rpc(ui, { method: 'updateSettings', patch: { autoAcknowledgeSeconds: 0 } })).autoAcknowledgeSeconds, 0);
  await complete(); await new Promise(resolve => setTimeout(resolve, 6500)); assert.equal(await seenNow(), false);
  const pendingSeen = (await activity()).observations[0];
  await rpc(ui, { method: 'acknowledgeWebActivity', id: pendingSeen.id, attentionId: pendingSeen.attention.id });
  await expect.poll(() => ui.evaluate(() => chrome.action.getBadgeText({}))).toBe('');
  record('optional automatic seen: off by default, then after the delay on the active tab of the focused window only');

  await provider.evaluate(() => document.querySelector('form button').setAttribute('aria-label', 'Arrêter'));
  await expect.poll(states).toEqual(['working']);
  await provider.evaluate(() => document.querySelector('form button').setAttribute('aria-label', 'Démarrer une conversation vocale'));
  await expect.poll(states).toEqual(['unknown']);
  record('old completion announcer surviving newer work cannot produce response_ready');

  await provider.reload(); await expect.poll(states).toEqual(['idle']);
  assert.equal((await rpcResult(ui, { method: 'focusWebActivity', id: observation.id })).ok, false);
  const reloaded = (await activity()).observations[0];
  assert.notEqual(reloaded.id, observation.id); assert.equal(reloaded.sessionNumber, 1); assert.equal(reloaded.label, labelCanary);
  record('same-URL reload destroys prior identity and work witness but keeps the tab session number and label');

  // Exercise the exact evidence module in real DOM fixtures, including current FR markup.
  const built = await build({ entryPoints: [path.join(root, 'src/content/evidence.ts')], bundle: true, format: 'iife', globalName: 'FixtureEvidence', write: false, platform: 'browser' });
  const matrix = [
    ['gpt-fr-working', 'https://chatgpt.com/fixture', gpt('working'), 'working'],
    ['gpt-en-working', 'https://chatgpt.com/fixture', gpt('working', 'en'), 'working'],
    ['gpt-fr-ready', 'https://chatgpt.com/fixture', gpt('finished'), 'idle_ready'],
    ['gpt-hidden-stop', 'https://chatgpt.com/fixture', gpt('working').replace('<button aria-label=', '<button hidden aria-label='), 'unknown'],
    ['gpt-answer-text-is-not-state', 'https://chatgpt.com/fixture', gpt().replace('Démarrer une conversation vocale', 'Unrecognized').replace(canary, 'Réponse terminée'), 'unknown'],
    ['claude-fr-working-fixture', 'https://claude.ai/fixture', claude('working'), 'working'],
    ['claude-en-working-fixture', 'https://claude.ai/fixture', claude('working', 'en'), 'working'],
    ['claude-disabled-send-alone', 'https://claude.ai/fixture', claude(), 'idle_ready'],
    ['claude-quota-beats-false-completion', 'https://claude.ai/fixture', claude('quota'), 'error_visible'],
    ['claude-unknown-notice-beats-completion', 'https://claude.ai/fixture', claude('quota').replace('Vous n’avez plus de crédits d’utilisation.', 'Unrecognized notice'), 'unknown'],
    ['claude-disabled-composer', 'https://claude.ai/fixture', claude('finished').replace('contenteditable="true"', 'contenteditable="false"'), 'unknown'],
    ['unrecognized-dom', 'https://chatgpt.com/fixture', '<main>Stop generating Response complete</main>', 'unknown'],
  ];
  const fixture = await context.newPage();
  for (const [name, url, html, expected] of matrix) {
    await fixture.goto(url); await fixture.setContent(html); await fixture.addScriptTag({ content: built.outputFiles[0].text });
    assert.equal(await fixture.evaluate(() => FixtureEvidence.readEvidence()), expected, name);
  }
  await fixture.close(); record(`real Chromium DOM evidence matrix (${matrix.length} positive and negative fixtures)`);

  // With every product UI closed, the worker still updates the action badge.
  await ui.close();
  await provider.evaluate(() => document.querySelector('form button').setAttribute('aria-label', 'Stop generating'));
  // Work with nothing to review shows the working mark, not a count.
  await expect.poll(() => worker.evaluate(() => chrome.action.getBadgeText({}))).toBe('…');
  await expect.poll(() => worker.evaluate(() => chrome.action.getTitle({}))).toBe('Pilovo — 1 en cours');
  await new Promise(resolve => setTimeout(resolve, 2200));
  await provider.evaluate(() => {
    document.querySelector('form button').setAttribute('aria-label', 'Start voice mode');
    const status = document.createElement('span'); status.role = 'status'; status.setAttribute('aria-live', 'polite'); status.textContent = 'Response complete'; document.body.append(status);
  });
  await expect.poll(() => worker.evaluate(() => chrome.action.getBadgeText({}))).toBe('1');
  record('worker produces attention badge with all extension UI closed');
  const reopened = await context.newPage(); await reopened.goto(`chrome-extension://${extensionId}/index.html`);
  await provider.close();
  await expect.poll(async () => (await rpc(reopened, { method: 'getWebActivity' })).observations).toEqual([]);
  await expect.poll(() => reopened.evaluate(() => chrome.action.getBadgeText({}))).toBe('');
  record('closing the observed tab removes observations and clears badge');
  assert.ok(!JSON.stringify(await rpc(reopened, { method: 'exportData' })).includes(canary)); assert.ok(!JSON.stringify(await rpc(reopened, { method: 'exportData' })).includes(labelCanary));
} catch (error) { failures.push(String(error)); console.error(error); process.exitCode = 1; }
finally {
  await context?.close();
  const evidence = { checks, failures, limitations: ['Synthetic HTTPS fixtures only: no authenticated provider session or provider execution.', 'Production manifest no-grant phase is exact. Activity phase uses a TEST-ONLY clone declaring ChatGPT as required host; optional grant prompt and revocation remain unit/manual gates because headless prompt stays pending.', 'Worker termination/restart and browser-delayed badge expiry are covered by unit lifecycle tests, not a hard wall-clock guarantee.'] };
  await writeFile(path.join(run, 'evidence.json'), JSON.stringify(evidence, null, 2)); console.log(`Evidence: ${path.join(run, 'evidence.json')}`);
}
