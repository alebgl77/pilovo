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
  const exportText = JSON.stringify(await rpc(ui, { method: 'exportData' }));
  assert.ok(!exportText.includes(canary)); assert.ok(!JSON.stringify(await activity()).includes(canary));
  record('observed work plus two positive completion reads create one metadata-only attention and badge');

  await rpc(ui, { method: 'focusWebActivity', id: observation.id });
  assert.equal(await ui.evaluate(async () => (await chrome.tabs.query({ active: true }))[0].id), observation.tabId);
  await rpc(ui, { method: 'acknowledgeWebActivity', id: observation.id, attentionId: observation.attention.id });
  await expect.poll(() => ui.evaluate(() => chrome.action.getBadgeText({}))).toBe('');
  record('focus revalidates ephemeral row and acknowledgement clears its badge');

  await provider.evaluate(() => document.querySelector('form button').setAttribute('aria-label', 'Arrêter'));
  await expect.poll(states).toEqual(['working']);
  await provider.evaluate(() => document.querySelector('form button').setAttribute('aria-label', 'Démarrer une conversation vocale'));
  await expect.poll(states).toEqual(['unknown']);
  record('old completion announcer surviving newer work cannot produce response_ready');

  await provider.reload(); await expect.poll(states).toEqual(['idle']);
  assert.equal((await rpcResult(ui, { method: 'focusWebActivity', id: observation.id })).ok, false);
  record('same-URL reload destroys prior identity and work witness');

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
  await expect.poll(() => worker.evaluate(() => chrome.action.getBadgeText({}))).toBe('');
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
  assert.ok(!JSON.stringify(await rpc(reopened, { method: 'exportData' })).includes(canary));
} catch (error) { failures.push(String(error)); console.error(error); process.exitCode = 1; }
finally {
  await context?.close();
  const evidence = { checks, failures, limitations: ['Synthetic HTTPS fixtures only: no authenticated provider session or provider execution.', 'Production manifest no-grant phase is exact. Activity phase uses a TEST-ONLY clone declaring ChatGPT as required host; optional grant prompt and revocation remain unit/manual gates because headless prompt stays pending.', 'Worker termination/restart and browser-delayed badge expiry are covered by unit lifecycle tests, not a hard wall-clock guarantee.'] };
  await writeFile(path.join(run, 'evidence.json'), JSON.stringify(evidence, null, 2)); console.log(`Evidence: ${path.join(run, 'evidence.json')}`);
}
