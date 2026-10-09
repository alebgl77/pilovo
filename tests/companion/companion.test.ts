import test from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import path from 'node:path';
import { randomBytes, randomUUID } from 'node:crypto';
import { PassThrough } from 'node:stream';
import { spawn, spawnSync } from 'node:child_process';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { FrameDecoder, encodeFrame, MAX_FRAME_BYTES } from '../../companion/framing';
import { sign, verifyEvent, verify } from '../../companion/envelope';
import { adapterConfigSchema, validateOrigin, loadAdapterConfig, type HostConfig, type AdapterConfig } from '../../companion/config';
import { EventQueue, AdapterLease, MAX_QUEUE_FILES, RETENTION_MS } from '../../companion/queue';
import { NativeHost } from '../../companion/host';
import { atomicWrite, readBounded, withLock } from '../../companion/storage';
import type { AgentEvent, SourceId } from '../../src/shared/types';

async function fixture(t: test.TestContext) {
  // Windows sandbox's redirected %TEMP% denies atomic rename; use disposable workspace directories.
  const temporaryBase = path.resolve('tests/companion/.tmp'); await fs.mkdir(temporaryBase, { recursive: true });
  const root = await fs.mkdtemp(path.join(temporaryBase, 'hub compagnon été tests '));
  await fs.chmod(root, 0o700);
  t.after(async () => { await fs.rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); });
  const dataDirectory = path.join(root, 'private data');
  const secrets = { 'claude-code': randomBytes(32).toString('hex'), codex: randomBytes(32).toString('hex') };
  const config: HostConfig = { version: 1, extensionId: 'a'.repeat(32), dataDirectory, secrets };
  const source = (sourceId: SourceId): AdapterConfig => ({ version: 1, sourceId, dataDirectory, secret: secrets[sourceId] });
  return { root, config, source };
}
async function waitFor(predicate: () => boolean | Promise<boolean>, label = 'condition') {
  const deadline = Date.now() + 7000;
  while (!(await predicate())) { if (Date.now() > deadline) throw new Error(`Timed out: ${label}`); await new Promise(resolve => setTimeout(resolve, 15)); }
}
async function harness(config: HostConfig, t: test.TestContext, now: () => number = Date.now) {
  const input = new PassThrough(), output = new PassThrough(), decoder = new FrameDecoder();
  const messages: any[] = [], diagnostics: string[] = [];
  output.on('data', chunk => decoder.push(chunk, message => messages.push(message)));
  const host = new NativeHost(config, input, output, code => diagnostics.push(code), readBounded, now);
  await host.start(); await host.idle();
  t.after(async () => { await host.close(); input.destroy(); output.destroy(); });
  return { host, input, output, messages, diagnostics };
}
function sample(sourceId: SourceId = 'claude-code'): AgentEvent { return { schemaVersion: 1, sourceId, eventId: randomUUID(), taskId: randomUUID(), runId: randomUUID(), sequence: 1, timestamp: new Date().toISOString(), type: 'task.started', payload: { title: 'Sample' } }; }

test('native framing handles UTF-8, arbitrary fragmentation and multiple frames; rejects malformed, oversized and truncated frames', () => {
  const decoder = new FrameDecoder(), output: unknown[] = [];
  const combined = Buffer.concat([encodeFrame({ title: 'Été 🚀' }), encodeFrame({ second: true })]);
  for (const byte of combined) decoder.push(Buffer.from([byte]), value => output.push(value));
  decoder.end(); assert.deepEqual(output, [{ title: 'Été 🚀' }, { second: true }]);
  for (const size of [0, MAX_FRAME_BYTES + 1, 0xffffffff]) { const bytes = Buffer.alloc(4); bytes.writeUInt32LE(size); assert.throws(() => new FrameDecoder().push(bytes, () => {})); }
  assert.throws(() => encodeFrame({ value: 'x'.repeat(MAX_FRAME_BYTES) }));
  const truncated = new FrameDecoder(); truncated.push(encodeFrame({ x: 1 }).subarray(0, 5), () => {}); assert.throws(() => truncated.end());
  const invalidJson = Buffer.from([1, 0, 0, 0, 0x7b]); assert.throws(() => new FrameDecoder().push(invalidJson, () => {}));
  const invalidUtf8 = Buffer.from([1, 0, 0, 0, 0xff]); assert.throws(() => new FrameDecoder().push(invalidUtf8, () => {}));
});
test('authenticated identities, strict schemas, URL safety, prompt privacy and exact caller origin', () => {
  const secret = randomBytes(32).toString('hex'), other = randomBytes(32).toString('hex'), event = sample();
  assert.deepEqual(verifyEvent(sign(event, secret), secret, 'claude-code'), event);
  assert.throws(() => verifyEvent(sign(event, other), secret, 'claude-code'));
  assert.throws(() => verifyEvent(sign(event, secret), secret, 'codex'));
  for (const patch of [{ schemaVersion: 2 }, { taskId: '../../outside' }, { surprise: true }, { sequence: 0 }, { eventId: 'not-uuid' }, { payload: { prompt: 'do not collect' } }, { payload: { contextUrl: 'javascript:alert(1)' } }, { payload: { contextUrl: 'https://user:secret@example.com' } }]) assert.throws(() => verifyEvent(sign({ ...event, ...patch }, secret), secret, 'claude-code'));
  assert.throws(() => verify({ ...sign(event, secret), version: 2 }, secret));
  validateOrigin(`chrome-extension://${'a'.repeat(32)}/`, 'a'.repeat(32)); validateOrigin(`chrome-extension://${'a'.repeat(32)}`, 'a'.repeat(32));
  for (const origin of [undefined, `chrome-extension://${'b'.repeat(32)}/`, `chrome-extension://${'a'.repeat(32)}/evil`, 'https://example.com']) assert.throws(() => validateOrigin(origin, 'a'.repeat(32)));
  assert.equal(adapterConfigSchema.safeParse({ version: 1, sourceId: 'other', dataDirectory: '/', secret }).success, false);
});
test('atomic private writes and exclusive locks fail closed without deleting someone else’s lock', async t => {
  const f = await fixture(t), file = path.join(f.root, 'record.json');
  await atomicWrite(file, { complete: true }); assert.equal(await readBounded(file), '{"complete":true}');
  await assert.rejects(() => readBounded(file, 3));
  const lock = path.join(f.root, '.writer-lock');
  await withLock(f.root, async () => { await assert.rejects(() => withLock(f.root, async () => {}), /writer_busy/); assert.equal((await fs.stat(lock)).isDirectory(), true); });
  await assert.rejects(() => fs.stat(lock), { code: 'ENOENT' });
  assert.equal((await fs.readdir(f.root)).some(name => name.endsWith('.tmp')), false);
});
test('managed runs survive restart, serialize concurrent calls, prohibit cross-source handles and terminal changes', async t => {
  const f = await fixture(t), first = await EventQueue.create(f.source('claude-code'));
  const started = await first.start({ title: 'durable' });
  const restarted = await EventQueue.create(f.source('claude-code'));
  const updates = await Promise.all([restarted.update(started.taskHandle, 'task.progress', { summary: 'one' }), restarted.update(started.taskHandle, 'task.waiting', { question: 'Continue?' })]);
  assert.deepEqual(updates.map(event => event.sequence), [2, 3]);
  const other = await EventQueue.create(f.source('codex'));
  await assert.rejects(() => other.update(started.taskHandle, 'task.progress', {}));
  await assert.rejects(() => restarted.update('../escape', 'task.progress', {}));
  const completed = await restarted.update(started.taskHandle, 'task.completed', { summary: 'done' }); assert.equal(completed.sequence, 4);
  await assert.rejects(() => restarted.update(started.taskHandle, 'task.progress', {}), /task_already_ended/);
  await assert.rejects(() => restarted.start({ title: 'bad', prompt: 'private' }), /prompt_collection_disabled/);
  const state = verify(JSON.parse(await readBounded(path.join(first.directories.states, `${started.taskHandle}.json`))), f.config.secrets['claude-code']) as any;
  assert.equal(state.pending, undefined); assert.equal(JSON.stringify(state).includes('done'), false);
});
test('write and sync failures close handles, erase partial private temporary files and preserve previous committed data', async t => {
  const f = await fixture(t), file = path.join(f.root, 'durable.json');
  await atomicWrite(file, { old: true });
  for (const operation of ['writeFile', 'sync'] as const) {
    let closed = false;
    await assert.rejects(() => atomicWrite(file, { secret: 'PARTIAL_PAYLOAD' }, {
      ...fs,
      open: async (...args: Parameters<typeof fs.open>) => {
        const handle = await fs.open(...args), originalClose = handle.close.bind(handle);
        handle[operation] = async () => { throw Object.assign(new Error('injected_io_failure'), { code: 'EIO' }); };
        handle.close = async () => { closed = true; await originalClose(); };
        return handle;
      },
    }), /injected_io_failure/);
    assert.equal(closed, true); assert.equal(await readBounded(file), '{"old":true}');
    assert.equal((await fs.readdir(f.root)).some(name => name.endsWith('.tmp')), false);
  }
});
test('transient native outbox read failure preserves a unique event and delivers it on retry', async t => {
  const f = await fixture(t), queue = await EventQueue.create(f.source('claude-code')), event = await queue.start({ title: 'must survive EIO' });
  const input = new PassThrough(), output = new PassThrough(), decoder = new FrameDecoder(), messages: any[] = [], diagnostics: string[] = [];
  output.on('data', chunk => decoder.push(chunk, message => messages.push(message)));
  let failRead = true;
  const host = new NativeHost(f.config, input, output, code => diagnostics.push(code), async (file, max) => {
    if (file.endsWith(`${event.eventId}.json`) && failRead) throw Object.assign(new Error('transient'), { code: 'EIO' });
    return readBounded(file, max);
  });
  t.after(async () => { await host.close(); input.destroy(); output.destroy(); });
  await host.start(); await host.idle();
  assert.equal((await fs.readdir(queue.directories.queue)).length, 1); assert.equal(messages.some(message => message.kind === 'agent.event'), false); assert.ok(diagnostics.includes('outbox_read_failed'));
  failRead = false; host.requestScan(); await host.idle();
  assert.ok(messages.some(message => message.kind === 'agent.event' && message.event.eventId === event.eventId));
  assert.equal((await fs.readdir(queue.directories.queue)).length, 1);
});
test('write-ahead pending event recovers with identical UUID and sequence after interrupted enqueue', async t => {
  const f = await fixture(t), queue = await EventQueue.create(f.source('claude-code'));
  const event = sample();
  await atomicWrite(path.join(queue.directories.states, `${event.taskId}.json`), sign({ version: 1, sourceId: event.sourceId, taskId: event.taskId, runId: event.runId, sequence: 1, ended: false, updatedAt: event.timestamp, pending: event }, f.config.secrets['claude-code']));
  const recovered = await EventQueue.create(f.source('claude-code'));
  assert.equal(verifyEvent(JSON.parse(await readBounded(path.join(queue.directories.queue, `${event.eventId}.json`))), f.config.secrets['claude-code'], 'claude-code').eventId, event.eventId);
  assert.equal((await recovered.update(event.taskId, 'task.progress', {})).sequence, 2);
});
test('queue cap fails explicitly, old queue/state data expires after retention, unsupported filesystem entries fail closed', async t => {
  const f = await fixture(t), queue = await EventQueue.create(f.source('claude-code'));
  const old = await queue.start({ title: 'old' });
  const oldTime = new Date(Date.now() - RETENTION_MS - 60000);
  await fs.utimes(path.join(queue.directories.queue, `${old.eventId}.json`), oldTime, oldTime);
  await fs.utimes(path.join(queue.directories.states, `${old.taskHandle}.json`), oldTime, oldTime);
  await EventQueue.create(f.source('claude-code'));
  assert.equal((await fs.readdir(queue.directories.queue)).length, 0);
  assert.equal((await fs.readdir(queue.directories.states)).length, 0);
  for (let index = 0; index < MAX_QUEUE_FILES; index++) await fs.writeFile(path.join(queue.directories.queue, `${randomUUID()}.json`), '{}');
  await assert.rejects(() => queue.start({ title: 'full' }), /outbox_full/);
  await fs.mkdir(path.join(queue.directories.queue, 'unsafe-directory'));
  await assert.rejects(() => EventQueue.create(f.source('claude-code')), /unsafe_storage_entry/);
});
test('native delivery replays until matching durable ack, ignores foreign ack, removes rejected event and reports live leases only', async t => {
  const f = await fixture(t), queue = await EventQueue.create(f.source('claude-code'));
  const event = await queue.start({ title: 'historical' });
  const h = await harness(f.config, t);
  assert.ok(h.messages.some(message => message.kind === 'agent.event' && message.event.eventId === event.eventId));
  assert.equal(h.messages.some(message => message.kind === 'agent.connection' && message.status === 'online'), false);
  assert.equal((await fs.readdir(queue.directories.queue)).length, 1);
  h.input.write(encodeFrame({ kind: 'event.ack', sourceId: 'codex', eventId: event.eventId, status: 'accepted' })); await h.host.idle();
  assert.equal((await fs.readdir(queue.directories.queue)).length, 1);
  await h.host.close();
  const replay = await harness(f.config, t);
  assert.equal(replay.messages.filter(message => message.kind === 'agent.event').length, 1);
  replay.input.write(encodeFrame({ kind: 'event.ack', sourceId: 'claude-code', eventId: event.eventId, status: 'duplicate' }));
  await waitFor(async () => (await fs.readdir(queue.directories.queue)).length === 0, 'duplicate ack deletion');
  const lease = await AdapterLease.start(queue); t.after(() => lease.close());
  replay.host.requestScan(); await replay.host.idle();
  assert.ok(replay.messages.some(message => message.kind === 'agent.connection' && message.status === 'online'));
  await lease.close(); replay.host.requestScan(); await replay.host.idle();
  assert.equal(replay.messages.filter(message => message.kind === 'agent.connection' && message.authenticatedSourceId === 'claude-code').at(-1)?.status, 'disconnected');
  const rejected = await queue.start({ title: 'rejected' }); replay.host.requestScan(); await replay.host.idle();
  replay.input.write(encodeFrame({ kind: 'event.ack', sourceId: 'claude-code', eventId: rejected.eventId, status: 'rejected', reason: 'storage.limit' }));
  await waitFor(async () => (await fs.readdir(queue.directories.queue)).length === 0);
  assert.ok(replay.diagnostics.includes('extension_rejected_event'));
});
test('native rejects forged queue events, invalid leases and malformed frames without leaking contents', async t => {
  const f = await fixture(t), queue = await EventQueue.create(f.source('claude-code'));
  const event = sample(); event.payload.title = 'SECRET_NOT_LOGGED';
  await atomicWrite(path.join(queue.directories.queue, `${event.eventId}.json`), sign(event, f.config.secrets.codex));
  await atomicWrite(path.join(queue.directories.leases, `${randomUUID()}.json`), { secret: 'SECRET_NOT_LOGGED' });
  const h = await harness(f.config, t);
  assert.equal(h.messages.some(message => message.kind === 'agent.event'), false);
  assert.equal(h.messages.some(message => message.status === 'online'), false);
  assert.equal(h.diagnostics.join('').includes('SECRET'), false);
  h.input.write(Buffer.from([0, 0, 0, 0])); await h.host.idle(); assert.ok(h.diagnostics.includes('invalid_native_input'));
});
test('expired or externally removed in-flight files release the bounded native delivery window', async t => {
  const f = await fixture(t), queue = await EventQueue.create(f.source('claude-code'));
  let clock = Date.now();
  const seeded: AgentEvent[] = [];
  for (let index = 0; index < 64; index++) { const event = sample(); seeded.push(event); await atomicWrite(path.join(queue.directories.queue, `${event.eventId}.json`), sign(event, f.config.secrets['claude-code'])); }
  const h = await harness(f.config, t, () => clock); assert.equal(h.messages.filter(message => message.kind === 'agent.event').length, 64);
  for (let index = 0; index < seeded.length; index++) {
    const event = seeded[index], file = path.join(queue.directories.queue, `${event.eventId}.json`);
    if (index % 2) await fs.rm(file, { force: true });
  }
  clock += RETENTION_MS + 60000;
  const fresh = sample(); fresh.timestamp = new Date(clock).toISOString();
  await atomicWrite(path.join(queue.directories.queue, `${fresh.eventId}.json`), sign(fresh, f.config.secrets['claude-code'])); h.host.requestScan();
  await waitFor(() => h.messages.some(message => message.kind === 'agent.event' && message.event.eventId === fresh.eventId));
  assert.ok(h.diagnostics.includes('event_retention_expired'));
});
for (const sourceId of ['claude-code', 'codex'] as const) test(`${sourceId} real MCP stdio SDK client -> bundled adapter -> signed outbox -> native frame -> accepted ack`, { timeout: 15000 }, async t => {
  const f = await fixture(t), configFile = path.join(f.root, `${sourceId}-config.json`);
  await atomicWrite(configFile, f.source(sourceId));
  const transport = new StdioClientTransport({ command: process.execPath, args: [path.resolve(`companion-dist/${sourceId}.cjs`), '--config', configFile], stderr: 'pipe' });
  const client = new Client({ name: 'acceptance-client', version: '1.0.0' });
  t.after(async () => { await client.close(); });
  await client.connect(transport);
  const list = await client.listTools(); assert.deepEqual(list.tools.map(tool => tool.name).sort(), ['hub_ask_question', 'hub_complete_task', 'hub_fail_task', 'hub_start_task', 'hub_update_task']);
  const start = await client.callTool({ name: 'hub_start_task', arguments: { title: `MCP ${sourceId}`, contextUrl: 'https://example.com' } });
  assert.equal(start.isError, undefined); const result = JSON.parse((start.content as any)[0].text); assert.equal(result.status, 'queued'); assert.equal(result.sourceId, sourceId);
  const invalid = await client.callTool({ name: 'hub_start_task', arguments: { title: 'forged source', sourceId: sourceId === 'codex' ? 'claude-code' : 'codex' } }); assert.equal(invalid.isError, true);
  const complete = await client.callTool({ name: 'hub_complete_task', arguments: { taskHandle: result.taskHandle, summary: 'SDK transport acceptance completed' } }); assert.equal(complete.isError, undefined);
  const h = await harness(f.config, t), events = h.messages.filter(message => message.kind === 'agent.event');
  assert.deepEqual(events.map(message => message.event.sequence), [1, 2]); assert.equal(events[1].event.type, 'task.completed');
  for (const message of events) { assert.equal(message.authenticatedSourceId, sourceId); h.input.write(encodeFrame({ kind: 'event.ack', sourceId, eventId: message.event.eventId, status: 'accepted' })); }
  await waitFor(async () => (await fs.readdir(path.join(f.config.dataDirectory, sourceId, 'outbox'))).length === 0);
  await client.close();
});
test('profile launch config cannot authenticate as the other source', async t => {
  const f = await fixture(t), file = path.join(f.root, 'profile.json'); await atomicWrite(file, f.source('codex'));
  await assert.rejects(() => loadAdapterConfig(file, 'claude-code'), /source_profile_mismatch/);
  await assert.rejects(() => loadAdapterConfig('relative.json', 'codex'), /absolute_config_required/);
});
test('Windows installer dry run has no side effects, rejects unsafe paths, prepares a working quoted native CMD launcher without registry writes', { skip: process.platform !== 'win32', timeout: 20000 }, async t => {
  const f = await fixture(t), installDirectory = path.join(f.root, 'prepared companion'), script = path.resolve('scripts/install-companion.ps1');
  const common = ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', script, '-ExtensionId', f.config.extensionId, '-InstallDirectory', installDirectory, '-NodeExecutable', process.execPath, '-BundleDirectory', path.resolve('companion-dist'), '-PrepareOnly'];
  const dry = spawnSync('powershell.exe', [...common, '-DryRun'], { encoding: 'utf8', windowsHide: true }); assert.equal(dry.status, 0, dry.stderr); assert.equal(JSON.parse(dry.stdout).dryRun, true); await assert.rejects(() => fs.stat(installDirectory), { code: 'ENOENT' });
  const unsafeArgs = [...common]; unsafeArgs[8] = path.join(f.root, 'bad%PATH%');
  const unsafe = spawnSync('powershell.exe', [...unsafeArgs, '-DryRun'], { encoding: 'utf8', windowsHide: true }); assert.notEqual(unsafe.status, 0); assert.match(unsafe.stderr, /Unsupported path characters/);
  // Regression: never resolve the ACL cmdlet from a caller-controlled/incompatible module path.
  const poisonModules = path.join(f.root, 'poison-modules'), poisonSecurity = path.join(poisonModules, 'Microsoft.PowerShell.Security');
  await fs.mkdir(poisonSecurity, { recursive: true });
  await fs.writeFile(path.join(poisonSecurity, 'Microsoft.PowerShell.Security.psd1'), "@{ ModuleVersion = '99.0.0'; RootModule = 'poison.psm1'; FunctionsToExport = @('Set-Acl') }");
  await fs.writeFile(path.join(poisonSecurity, 'poison.psm1'), "throw 'POISON_MODULE_MUST_NOT_LOAD'\nfunction Set-Acl { throw 'POISON_MODULE_MUST_NOT_LOAD' }");
  const prepare = spawnSync('powershell.exe', common, { encoding: 'utf8', windowsHide: true, env: { ...process.env, PSModulePath: `${poisonModules};${process.env.PSModulePath ?? ''}` } }); assert.equal(prepare.status, 0, prepare.stderr); assert.equal(prepare.stderr.includes('POISON_MODULE_MUST_NOT_LOAD'), false);
  const manifest = JSON.parse(await fs.readFile(path.join(installDirectory, 'dev.agentcontrolhub.bridge.json'), 'utf8')); assert.deepEqual(manifest.allowed_origins, [`chrome-extension://${f.config.extensionId}/`]);
  const hostConfig = JSON.parse(await fs.readFile(path.join(installDirectory, 'host-config.json'), 'utf8')); assert.notEqual(hostConfig.secrets['claude-code'], hostConfig.secrets.codex);
  const codexFragment = await fs.readFile(path.join(installDirectory, 'codex-mcp.toml'), 'utf8');
  assert.match(codexFragment, /^required = true$/m); assert.match(codexFragment, /^startup_timeout_sec = 30$/m); assert.match(codexFragment, /^enabled = true$/m);
  const command = `""${manifest.path}" "chrome-extension://${f.config.extensionId}/" --parent-window=0"`;
  const child = spawn(process.env.ComSpec ?? 'cmd.exe', ['/d', '/s', '/c', command], { windowsVerbatimArguments: true, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
  t.after(() => { child.kill(); });
  const messages: any[] = [], decoder = new FrameDecoder(); let stderr = '';
  child.stdout.on('data', chunk => decoder.push(chunk, message => messages.push(message))); child.stderr.on('data', chunk => { stderr += chunk; });
  await waitFor(() => messages.some(message => message.kind === 'bridge.ready'), `CMD native ready: ${stderr}`);
  child.stdin.end(); await new Promise<void>(resolve => child.once('exit', () => resolve()));
  const denied = spawnSync(process.execPath, [path.join(installDirectory, 'native-host.cjs'), '--config', path.join(installDirectory, 'host-config.json'), `chrome-extension://${'b'.repeat(32)}/`], { encoding: 'utf8', windowsHide: true }); assert.equal(denied.status, 1); assert.equal(denied.stdout, ''); assert.equal(denied.stderr.includes(hostConfig.secrets.codex), false);
});
