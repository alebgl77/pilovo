// Hidden-tab acceptance: observed work and an unseen item to review must hold while their tab is in the background.
// Playwright keeps every page visible and disables timer throttling, so this script drives a headful Chrome through raw
// CDP instead: the provider tab is really hidden and Chrome really throttles its timers. It needs a display
// (Linux without one: `xvfb-run -a node tests/e2e/background-activity.mjs`) and a built `dist/`.
// QUIET and AFTER (seconds, default 100 each) set how long the hidden tab is watched while working and after its end;
// page timers fall to one wake-up per minute after about a minute hidden, so shorter runs do not exercise throttling.
// EXTENSION_DIR tests another build than `dist/`, for example the previous one, to compare.
import { chromium } from '@playwright/test';
import { spawn } from 'node:child_process';
import { cp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import assert from 'node:assert/strict';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const run = path.join(root, 'work', `background-acceptance-${new Date().toISOString().replace(/[:.]/g, '-')}`);
const quiet = Number(process.env.QUIET || 100), after = Number(process.env.AFTER || 100);
await mkdir(run, { recursive: true });
// Test-only fixture, as in activity-browser.mjs: the host permission is declared as required, since a permission prompt
// cannot be answered here. Synthetic page: recognized controls only, no provider content.
const extension = path.join(run, 'required-host-fixture'), profile = path.join(run, 'profile');
await cp(process.env.EXTENSION_DIR || path.join(root, 'dist'), extension, { recursive: true });
const manifest = JSON.parse(await readFile(path.join(extension, 'manifest.json'), 'utf8'));
manifest.host_permissions = ['https://chatgpt.com/*']; manifest.optional_host_permissions = ['https://claude.ai/*'];
await writeFile(path.join(extension, 'manifest.json'), JSON.stringify(manifest));
const html = '<!doctype html><html><title>synthetic</title><body><article>synthetic</article><form><div role="textbox" contenteditable="true">synthetic</div><button aria-label="Démarrer une conversation vocale">Control</button><button disabled aria-label="Dicter">Dictate</button></form></body></html>';
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

const chrome = spawn(process.env.CHROME_PATH || chromium.executablePath(), [`--user-data-dir=${profile}`, '--remote-debugging-port=0', `--disable-extensions-except=${extension}`, `--load-extension=${extension}`,
  '--no-first-run', '--no-default-browser-check', '--no-sandbox', '--proxy-server=http://127.0.0.1:9', '--disable-background-networking', '--window-size=1200,800', 'about:blank'], { stdio: 'ignore' });
let socket;
try {
  let port;
  for (let attempt = 0; attempt < 100 && !port; attempt++) { await sleep(200); port = await readFile(path.join(profile, 'DevToolsActivePort'), 'utf8').then(text => text.split('\n'), () => undefined); }
  assert.ok(port, 'Chrome did not start (a display is required)');
  socket = new WebSocket(`ws://127.0.0.1:${port[0]}${port[1]}`);
  await new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = reject; });
  let next = 0; const pending = new Map(), listeners = [];
  socket.onmessage = event => {
    const message = JSON.parse(event.data), waiting = message.id && pending.get(message.id);
    if (waiting) { pending.delete(message.id); if (message.error) waiting.reject(new Error(JSON.stringify(message.error))); else waiting.resolve(message.result); }
    else for (const listener of listeners) listener(message);
  };
  const send = (method, params = {}, sessionId) => new Promise((resolve, reject) => { const id = ++next; pending.set(id, { resolve, reject }); socket.send(JSON.stringify({ id, method, params, ...sessionId && { sessionId } })); });
  const evaluate = async (sessionId, expression) => {
    const result = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }, sessionId);
    if (result.exceptionDetails) assert.fail(JSON.stringify(result.exceptionDetails).slice(0, 400));
    return result.result.value;
  };
  // Chrome runs other workers too: Pilovo's is the one whose manifest declares a side panel.
  let id;
  for (let attempt = 0; attempt < 50 && !id; attempt++) {
    await sleep(300);
    for (const target of (await send('Target.getTargets')).targetInfos.filter(info => info.type === 'service_worker' && info.url.endsWith('/background.js'))) {
      const { sessionId } = await send('Target.attachToTarget', { targetId: target.targetId, flatten: true });
      const pilovo = await evaluate(sessionId, 'Boolean(chrome.runtime.getManifest().side_panel)').catch(() => false);
      await send('Target.detachFromTarget', { sessionId }).catch(() => undefined);
      if (pilovo) id = target.url.split('/')[2];
    }
  }
  assert.ok(id, 'extension service worker not found');
  const open = async () => { const { targetId } = await send('Target.createTarget', { url: 'about:blank' }); const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true }); return { targetId, sessionId }; };
  // The watcher is an extension resource with no Pilovo code: reading the badge from it never wakes the service worker,
  // as when the panel is closed.
  const watcher = await open();
  await send('Page.navigate', { url: `chrome-extension://${id}/manifest.json` }, watcher.sessionId); await sleep(1500);
  const provider = await open();
  listeners.push(message => {
    if (message.method === 'Fetch.requestPaused' && message.sessionId === provider.sessionId) void send('Fetch.fulfillRequest', { requestId: message.params.requestId, responseCode: 200, responseHeaders: [{ name: 'content-type', value: 'text/html; charset=utf-8' }], body: Buffer.from(html).toString('base64') }, provider.sessionId).catch(() => undefined);
  });
  await send('Fetch.enable', { patterns: [{ urlPattern: '*' }] }, provider.sessionId);
  await send('Page.navigate', { url: 'https://chatgpt.com/c/synthetic' }, provider.sessionId); await sleep(4500);
  const badge = () => evaluate(watcher.sessionId, 'chrome.action.getBadgeText({})');
  const shows = async (value, ms = 30000) => { for (const end = Date.now() + ms; Date.now() < end; await sleep(250)) if (await badge() === value) return true; return false; };
  // One character per second: W working, a digit for items to review, a dot for an empty badge.
  const watch = async seconds => { let line = ''; for (let second = 0; second < seconds; second++) { const text = await badge(); line += text === '…' ? 'W' : text || '.'; await sleep(1000); } return line; };

  await evaluate(provider.sessionId, "window.__ticks = []; setInterval(() => window.__ticks.push(Math.round(performance.now())), 5000); document.querySelector('form button').setAttribute('aria-label', 'Arrêter'); 1");
  assert.ok(await shows('…'), 'work is observed while the tab is visible');
  await send('Target.activateTarget', { targetId: watcher.targetId }); await sleep(500);
  assert.equal(await evaluate(provider.sessionId, 'document.visibilityState'), 'hidden');
  const working = await watch(quiet);
  console.log(`hidden, working, ${quiet} s: ${working}`);
  assert.match(working, /^W+$/, 'observed work holds in a hidden tab');
  console.log('PASS observed work keeps its evidence while its tab is hidden');
  await evaluate(provider.sessionId, "document.querySelector('form button').setAttribute('aria-label', 'Démarrer une conversation vocale'); (() => { const status = document.createElement('span'); status.role = 'status'; status.setAttribute('aria-live', 'polite'); status.textContent = 'Réponse terminée'; document.body.append(status); })(); 1");
  const ended = await watch(after);
  console.log(`hidden, after the end, ${after} s: ${ended}`);
  // The end is announced within the renewal delay and the ready debounce, then stays until seen.
  assert.match(ended, /^W{0,15}1+$/, 'the response-ready item is announced and stays while its tab is hidden');
  console.log('PASS the end of hidden work is announced and the unseen item stays on the badge');
  const ticks = await evaluate(provider.sessionId, 'window.__ticks');
  const gaps = ticks.slice(1).map((tick, index) => Math.round((tick - ticks[index]) / 1000));
  console.log(`page 5 s timer gaps while hidden (s): ${gaps.join(' ')}`);
  console.log(Math.max(...gaps) >= 30 ? 'Chrome throttled the hidden page timers during this run.' : 'Chrome did not throttle the hidden page timers during this run: lengthen QUIET and AFTER to exercise throttling.');
  await writeFile(path.join(run, 'evidence.json'), JSON.stringify({ quiet, after, working, ended, pageTimerGapsSeconds: gaps }, null, 2));
  console.log(`Evidence: ${run}/evidence.json`);
} finally { socket?.close(); chrome.kill('SIGKILL'); }
