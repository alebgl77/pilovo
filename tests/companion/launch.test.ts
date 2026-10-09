import test from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import path from 'node:path';
import { randomBytes, randomUUID } from 'node:crypto';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import type { ChildProcessWithoutNullStreams, spawn } from 'node:child_process';
import { AgentDiscovery, probeVersion, safeExecutablePath, type DiscoveryDependencies } from '../../companion/discovery';
import { Launcher, launchArguments, childEnvironment, type LauncherDependencies } from '../../companion/launcher';
import { ProviderOutput, MAX_LINE_BYTES, MAX_OUTPUT_BYTES } from '../../companion/provider-output';
import { controlRequestSchema, type LaunchRequest } from '../../src/shared/launch';
import { NativeHost } from '../../companion/host';
import { FrameDecoder, encodeFrame } from '../../companion/framing';
import { readBounded, atomicWrite } from '../../companion/storage';
import { verify, sign } from '../../companion/envelope';
import type { HostConfig } from '../../companion/config';

const good = { type: 'result', subtype: 'success', is_error: false, result: 'PRIVATE_PROVIDER_RESULT' };
function request(patch: Partial<LaunchRequest> = {}): LaunchRequest { return { kind: 'launch.request', requestId: randomUUID(), createdAt: new Date().toISOString(), sourceId: 'claude-code', mode: 'standard', retainResult: false, title: 'Owned task', prompt: 'PRIVATE_PROMPT_$(evil) & < > --dangerously-skip-permissions', ...patch }; }
class FakeChild extends EventEmitter {
  stdin = new PassThrough(); stdout = new PassThrough(); stderr = new PassThrough(); pid = 2000000000; exitCode: number | null = null; signalCode: NodeJS.Signals | null = null; input = ''; killed = false;
  constructor(action?: (child: FakeChild) => void) { super(); this.stdin.on('data', chunk => { this.input += chunk.toString(); }); this.stdin.on('finish', () => action?.(this)); setImmediate(() => this.emit('spawn')); }
  end(code: number | null = 0) { if (this.exitCode !== null || this.signalCode !== null) return; this.exitCode = code; if (code === null) this.signalCode = 'SIGKILL'; this.stdout.end(); this.stderr.end(); this.emit('close', code); }
  kill() { this.killed = true; this.end(null); return true; }
  asChild() { return this as unknown as ChildProcessWithoutNullStreams; }
}
async function fixture(t: test.TestContext, overrides: Partial<LauncherDependencies> = {}) {
  const base = path.resolve('tests/companion/.tmp'); await fs.mkdir(base, { recursive: true });
  const root = await fs.mkdtemp(path.join(base, 'launch-')); await fs.chmod(root, 0o700);
  const config: HostConfig = { version: 1, extensionId: 'a'.repeat(32), dataDirectory: path.join(root, 'data'), secrets: { 'claude-code': randomBytes(32).toString('hex'), codex: randomBytes(32).toString('hex') } };
  const children: FakeChild[] = [], calls: { executable: string; args: string[]; options: any }[] = [], diagnostics: string[] = [];
  const deps: LauncherDependencies = { discovery: { inventory: async () => (['claude-code', 'codex'] as const).map(sourceId => ({ agent: { sourceId, availability: 'available' as const, browserMode: 'unavailable' as const, version: '1.2.3' }, executable: path.join(root, `${sourceId}.exe`) })) }, spawn: (executable, args, options) => { calls.push({ executable, args, options }); const child = new FakeChild(); children.push(child); return child.asChild(); }, stop: async child => { child.kill(); }, timeoutMs: 2000, cleanupTimeoutMs: 1000, maxRecords: 10000, diagnostic: code => diagnostics.push(code), ...overrides };
  const launcher = new Launcher(config, deps); await launcher.initialize();
  t.after(async () => { await launcher.close(); const resolved = path.resolve(root); assert.ok(resolved.startsWith(base + path.sep)); await fs.rm(resolved, { recursive: true, force: true, maxRetries: 5 }); });
  return { root, config, launcher, deps, children, calls, diagnostics };
}
async function events(config: HostConfig, source = 'claude-code') {
  const directory = path.join(config.dataDirectory, source, 'outbox');
  const output: any[] = [];
  for (const name of await fs.readdir(directory)) output.push(verify(JSON.parse(await readBounded(path.join(directory, name))), config.secrets[source as keyof typeof config.secrets]));
  return output.sort((a, b) => a.sequence - b.sequence);
}
async function waitFor(predicate: () => boolean) { const until = Date.now() + 5000; while (!predicate()) { if (Date.now() > until) throw new Error('condition_timeout'); await new Promise(resolve => setTimeout(resolve, 5)); } }

test('strict control schema rejects arbitrary executable/env/cwd, unsafe context, wrong source, stale shape and oversized input', () => {
  for (const patch of [{ sourceId: 'evil' }, { executable: 'cmd.exe' }, { env: {} }, { cwd: '..' }, { contextUrl: 'javascript:alert(1)' }, { contextUrl: 'https://name:password@example.org' }, { prompt: 'x'.repeat(10001) }, { createdAt: undefined }]) assert.equal(controlRequestSchema.safeParse({ ...request(), ...patch }).success, false);
  assert.equal(controlRequestSchema.safeParse(request()).success, true);
});
test('discovery searches bounded known locations/PATH without wrapper execution; validates versions and caches', async () => {
  for (const unsafe of ['\\\\server\\share', '\\rooted', '/rooted', 'C:relative', 'relative']) assert.equal(safeExecutablePath(unsafe, 'win32'), false);
  assert.equal(safeExecutablePath('C:\\safe\\claude.exe', 'win32'), true);
  const home = path.resolve('tests/fakehome'), localData = path.join(home, 'AppData', 'Local'); let probes = 0, now = 0;
  const deps: DiscoveryDependencies = { home, localData, platform: 'win32', searchPath: `relative;${path.join(home, 'bin')}`, now: () => now, list: async () => ['version2', '../escape', 'version1'], isFile: async file => file.endsWith('claude.exe'), version: async () => { probes++; return '2.1.289 (Claude Code)'; } };
  const discovery = new AgentDiscovery(deps); const candidates = await discovery.candidates();
  assert.ok(candidates.length <= 12); assert.equal(candidates.some(value => value.executable.endsWith('.cmd') || value.executable.includes('escape')), false);
  const first = await discovery.inventory(); assert.equal(first[0].agent.availability, 'available'); assert.equal(first[1].agent.availability, 'not_found'); assert.equal(first[0].agent.browserMode, 'unavailable'); assert.equal(probes, 1);
  await discovery.inventory(); assert.equal(probes, 1); now = 30001; await discovery.inventory(); assert.equal(probes, 2); await discovery.inventory(true); assert.equal(probes, 3);
  deps.version = async () => 'something malicious\nsecret'; assert.equal((await discovery.inventory(true))[0].agent.availability, 'unavailable');
});
test('version probe uses only --version, kills timed-out process and bounds output', async () => {
  let child!: FakeChild;
  const factory = ((file: string, args: string[], options: any) => { assert.equal(file, 'known.exe'); assert.deepEqual(args, ['--version']); assert.equal(options.shell, false); child = new FakeChild(); return child.asChild(); }) as unknown as typeof spawn;
  assert.equal(await probeVersion('known.exe', 10, factory), null); assert.equal(child.killed, true);
  const overflow = ((...args: any[]) => { const result = (factory as any)(...args); setImmediate(() => child.stdout.write('x'.repeat(4097))); return result; }) as typeof spawn;
  assert.equal(await probeVersion('known.exe', 100, overflow), null);
});
test('hostile prompt is stdin data; fixed arguments and private cwd; no NODE_OPTIONS inheritance', async t => {
  const f = await fixture(t); const req = request(); const result = await f.launcher.handle(req);
  assert.equal(result.kind, 'launch.result'); assert.equal((result as any).status, 'accepted');
  assert.equal(f.children[0].input, req.prompt); assert.equal(f.calls[0].args.includes(req.prompt), false); assert.equal(f.calls[0].options.shell, false); assert.equal(f.calls[0].options.windowsHide, true);
  assert.ok(f.calls[0].options.cwd.startsWith(path.join(f.config.dataDirectory, 'jobs') + path.sep));
  assert.equal(f.calls[0].args.includes('--dangerously-skip-permissions'), false); assert.ok(f.calls[0].args.includes('--safe-mode'));
  assert.equal(childEnvironment().NODE_OPTIONS, undefined);
  f.children[0].stdout.write(JSON.stringify(good) + '\n'); f.children[0].end(); await f.launcher.idle();
  const recorded = await events(f.config); assert.deepEqual(recorded.map(event => event.type), ['task.started', 'task.completed']);
  const stored: string[] = []; async function collect(directory: string) { for (const entry of await fs.readdir(directory, { withFileTypes: true })) { const file = path.join(directory, entry.name); if (entry.isDirectory()) await collect(file); else stored.push(await fs.readFile(file, 'utf8')); } } await collect(f.config.dataDirectory);
  assert.equal(stored.some(value => value.includes(req.prompt) || value.includes('PRIVATE_PROVIDER_RESULT')), false);
  for (const value of stored) { try { const parsed = JSON.parse(value); if (parsed.body) { const text = Buffer.from(parsed.body, 'base64').toString(); assert.equal(text.includes('PRIVATE_PROMPT') || text.includes('PRIVATE_PROVIDER_RESULT'), false); } } catch (error) { if ((error as any).code === 'ERR_ASSERTION') throw error; } }
});
test('same request retry returns same attempt across instances and restart; changed payload conflicts', async t => {
  const f = await fixture(t); const req = request(); const first = await f.launcher.handle(req);
  assert.deepEqual(await f.launcher.handle(req), first); assert.equal(f.calls.length, 1);
  assert.equal((await f.launcher.handle({ ...req, prompt: 'changed' }) as any).reason, 'request_conflict');
  assert.equal((await f.launcher.handle({ ...req, retainResult: true }) as any).reason, 'request_conflict');
  const other = new Launcher(f.config, f.deps); await other.initialize(); assert.deepEqual(await other.handle(req), first); assert.equal(f.calls.length, 1); await other.close();
  f.children[0].stdout.write(JSON.stringify(good) + '\n'); f.children[0].end(); await f.launcher.idle();
  const restart = new Launcher(f.config, f.deps); await restart.initialize(); assert.deepEqual(await restart.handle(req), first); assert.equal(f.calls.length, 1); await restart.close();
});
test('explicit result retention stores only bounded successful final text; errors stay fixed and consent defaults off', async t => {
  assert.equal(controlRequestSchema.parse({ ...request(), retainResult: undefined }).kind, 'launch.request');
  assert.equal((controlRequestSchema.parse({ ...request(), retainResult: undefined }) as LaunchRequest).retainResult, false);
  const f = await fixture(t); await f.launcher.handle(request({ retainResult: true })); f.children[0].stderr.write('PRIVATE_ERROR'); f.children[0].stdout.write(JSON.stringify({ ...good, result: 'é'.repeat(17000) }) + '\n'); f.children[0].end(); await f.launcher.idle();
  assert.equal((await events(f.config)).at(-1).payload.summary, 'é'.repeat(16000));
  await f.launcher.handle(request({ retainResult: true })); f.children[1].stderr.write('PRIVATE_ERROR'); f.children[1].stdout.write(JSON.stringify({ ...good, is_error: true, result: 'PRIVATE_ERROR' }) + '\n'); f.children[1].end(1); await f.launcher.idle();
  assert.equal(JSON.stringify(await events(f.config)).includes('PRIVATE_ERROR'), false);
  const codex = new ProviderOutput('codex', () => {}); codex.push(Buffer.from(JSON.stringify({ type: 'item.completed', item: { type: 'agent_message', text: 'final response' } }) + '\n' + JSON.stringify({ type: 'turn.completed', usage: { input_tokens: 1, output_tokens: 1 } }))); assert.equal(codex.finish(0).summary, 'final response');
});
test('combined stdout/stderr quota terminates the owned child; live job inventory is host-specific', async t => {
  const f = await fixture(t); const req = request(); const accepted: any = await f.launcher.handle(req);
  const inventory: any = await f.launcher.handle({ kind: 'inventory.request', requestId: randomUUID() }); assert.deepEqual(inventory.jobs, [{ launchRequestId: req.requestId, sourceId: req.sourceId, taskId: accepted.taskId, runId: accepted.runId }]);
  const other = new Launcher(f.config, f.deps); await other.initialize(); const otherInventory: any = await other.handle({ kind: 'inventory.request', requestId: randomUUID() }); assert.deepEqual(otherInventory.jobs, []); await other.close();
  f.children[0].stderr.write(Buffer.alloc(MAX_OUTPUT_BYTES - 10)); f.children[0].stdout.write(JSON.stringify(good) + '\n'); await f.launcher.idle(); assert.equal(f.children[0].killed, true); assert.equal((await events(f.config)).at(-1).type, 'task.failed');
  const endedInventory: any = await f.launcher.handle({ kind: 'inventory.request', requestId: randomUUID() }); assert.deepEqual(endedInventory.jobs, []);
});
test('durable reserved request and signed records prevent replay after interruption/tampering', async t => {
  const f = await fixture(t); const req = request(); await f.launcher.handle(req); f.children[0].end(1); await f.launcher.idle();
  const file = path.join(f.config.dataDirectory, 'launches', `${req.requestId}.json`); const record: any = verify(JSON.parse(await readBounded(file)), f.config.secrets['claude-code']);
  record.status = 'reserved'; record.ownerPid = 2147483647; record.result = { kind: 'launch.result', requestId: req.requestId, status: 'rejected', reason: 'interrupted' }; await atomicWrite(file, sign(record, f.config.secrets['claude-code']));
  const restart = new Launcher(f.config, f.deps); await restart.initialize(); assert.equal((await restart.handle(req) as any).reason, 'interrupted'); assert.equal(f.calls.length, 1); await restart.close();
  await atomicWrite(file, { ...sign(record, f.config.secrets['claude-code']), signature: '0'.repeat(64) });
  assert.equal((await f.launcher.handle(req) as any).reason, 'storage_failed'); assert.equal(f.calls.length, 1);
});
test('expiry, modes, and unavailable CLI reject before any inference', async t => {
  const f = await fixture(t);
  for (const createdAt of [new Date(Date.now() - 301000).toISOString(), new Date(Date.now() + 31000).toISOString()]) assert.equal((await f.launcher.handle(request({ createdAt })) as any).reason, 'expired_request');
  assert.equal((await f.launcher.handle(request({ mode: 'claude-chrome' })) as any).reason, 'browser_setup_required'); assert.equal((await f.launcher.handle(request({ sourceId: 'codex', mode: 'claude-chrome' })) as any).reason, 'unsupported_mode'); assert.equal(f.calls.length, 0);
  const missing = new Launcher(f.config, { ...f.deps, discovery: { inventory: async () => [] } }); await missing.initialize(); assert.equal((await missing.handle(request()) as any).reason, 'cli_not_found'); await missing.close();
});
test('global concurrent capacity and no-eviction quota reject before spawn', async t => {
  const f = await fixture(t, { maxRecords: 3 }); const second = new Launcher(f.config, f.deps); await second.initialize();
  await f.launcher.handle(request()); await second.handle(request()); assert.equal(f.calls.length, 2);
  assert.equal((await f.launcher.handle(request()) as any).reason, 'capacity_reached'); assert.equal(f.calls.length, 2);
  await second.close(); for (const child of f.children) child.end(1); await f.launcher.idle();
  assert.equal((await f.launcher.handle(request()) as any).reason, 'capacity_reached'); assert.equal(f.calls.length, 2);
});
test('outbox capacity rejects before process launch', async t => {
  const f = await fixture(t); const queue = path.join(f.config.dataDirectory, 'claude-code', 'outbox');
  await Promise.all(Array.from({ length: 1020 }, () => fs.writeFile(path.join(queue, `${randomUUID()}.json`), '{}')));
  assert.equal((await f.launcher.handle(request()) as any).reason, 'capacity_reached'); assert.equal(f.calls.length, 0);
});
test('provider framing requires structured success AND zero exit, rejects malformed/duplicate/error terminal and oversized output', () => {
  const denied = new ProviderOutput('claude-code', () => {}); denied.push(Buffer.from(JSON.stringify({ ...good, permission_denials: [{ tool_name: 'Bash' }] }))); assert.equal(denied.finish(0).success, false);
  const malformedDenied = new ProviderOutput('claude-code', () => {}); malformedDenied.push(Buffer.from(JSON.stringify({ ...good, permission_denials: 'invalid' }))); assert.equal(malformedDenied.finish(0).success, false);
  const errorThenTerminal = new ProviderOutput('claude-code', () => {}); errorThenTerminal.push(Buffer.from('{"type":"error"}\n' + JSON.stringify(good))); assert.equal(errorThenTerminal.finish(0).success, false);
  for (const [text, code, expected] of [[JSON.stringify(good), 0, true], [JSON.stringify(good), 1, false], ['', 0, false], ['nonsense\n' + JSON.stringify(good), 0, false], [JSON.stringify({ ...good, is_error: true }), 0, false], [JSON.stringify(good) + '\n' + JSON.stringify(good), 0, false]] as const) { const parser = new ProviderOutput('claude-code', () => {}); for (const byte of Buffer.from(text)) parser.push(Buffer.from([byte])); assert.equal(parser.finish(code).success, expected); }
  const unicode = new ProviderOutput('claude-code', () => {}); for (const byte of Buffer.from(JSON.stringify({ ...good, result: 'été 🐈' }))) unicode.push(Buffer.from([byte])); assert.equal(unicode.finish(0).summary, 'été 🐈');
  assert.throws(() => new ProviderOutput('claude-code', () => {}).push(Buffer.alloc(MAX_LINE_BYTES + 1, 65)), /line_limit/);
  assert.throws(() => new ProviderOutput('claude-code', () => {}).push(Buffer.alloc(MAX_OUTPUT_BYTES + 1)), /output_limit/);
  const codex = new ProviderOutput('codex', () => {}); codex.push(Buffer.from(JSON.stringify({ type: 'turn.completed', usage: { input_tokens: 1, output_tokens: 1 } }))); assert.equal(codex.finish(0).success, true);
  const badCodex = new ProviderOutput('codex', () => {}); badCodex.push(Buffer.from('{"type":"turn.completed"}')); assert.equal(badCodex.finish(0).success, false);
});
test('durable started receipt exists before spawn; spawn failure is terminal and never receives stdin', async t => {
  const f = await fixture(t); let observed = false;
  const launcher = new Launcher(f.config, { ...f.deps, spawn: () => { observed = true; throw new Error('PRIVATE_SPAWN_ERROR'); } }); await launcher.initialize();
  const req = request(); const result = await launcher.handle(req); assert.equal((result as any).reason, 'spawn_failed'); assert.equal(observed, true);
  const recorded = await events(f.config); assert.deepEqual(recorded.map(event => event.type), ['task.started', 'task.failed']); assert.equal(JSON.stringify(recorded).includes('PRIVATE_SPAWN_ERROR'), false); await launcher.close();
  const record: any = verify(JSON.parse(await readBounded(path.join(f.config.dataDirectory, 'launches', `${req.requestId}.json`))), f.config.secrets['claude-code']); assert.equal(record.status, 'finished');
});
test('failed cleanup has bounded response and cannot claim cancellation before actual exit', async t => {
  const f = await fixture(t, { cleanupTimeoutMs: 20, stop: async () => { throw new Error('cannot stop'); } }); const req = request(); await f.launcher.handle(req);
  const response = await f.launcher.handle({ kind: 'launch.cancel', requestId: randomUUID(), launchRequestId: req.requestId }); assert.equal((response as any).reason, 'cleanup_failed'); assert.equal(f.children[0].exitCode, null); assert.equal((await events(f.config)).at(-1).type, 'task.started');
  await f.launcher.close(); assert.ok(f.diagnostics.includes('cleanup_failed_owned_child_still_running')); f.children[0].end(1); await f.launcher.idle();
});
test('terminal publication retries contention and persists recovery intent for a later host', async t => {
  const f = await fixture(t); const req = request(); await f.launcher.handle(req);
  const lock = path.join(f.config.dataDirectory, 'claude-code', '.writer-lock'); await fs.mkdir(lock); f.children[0].stdout.write(JSON.stringify(good) + '\n'); f.children[0].end(); await f.launcher.idle();
  assert.ok(f.diagnostics.includes('launch_finalization_failed_recovery_required'));
  const recordFile = path.join(f.config.dataDirectory, 'launches', `${req.requestId}.json`); const record: any = verify(JSON.parse(await readBounded(recordFile)), f.config.secrets['claude-code']); assert.equal(record.terminalPending, 'task.completed');
  await fs.rmdir(lock); const restart = new Launcher(f.config, f.deps); await restart.initialize(); assert.equal((await events(f.config)).at(-1).type, 'task.completed'); await restart.close(); assert.equal(f.calls.length, 1);
});
test('expired task state does not break host startup or evict launch replay protection', async t => {
  const f = await fixture(t); const req = request(); const accepted: any = await f.launcher.handle(req); f.children[0].end(1); await f.launcher.idle();
  const file = path.join(f.config.dataDirectory, 'launches', `${req.requestId}.json`); const record: any = verify(JSON.parse(await readBounded(file)), f.config.secrets['claude-code']); record.terminalPending = 'task.failed'; await atomicWrite(file, sign(record, f.config.secrets['claude-code']));
  await fs.rm(path.join(f.config.dataDirectory, 'claude-code', 'states', `${accepted.taskId}.json`));
  const restart = new Launcher(f.config, f.deps); await restart.initialize(); assert.equal((await restart.handle(req) as any).taskId, accepted.taskId); assert.equal(f.calls.length, 1); assert.ok(f.diagnostics.includes('launch_receipt_retention_expired')); await restart.close();
});
test('browser observations correlate exact bounded known tool names and discard inputs/results', () => {
  const activities: any[] = [], parser = new ProviderOutput('claude-code', activity => activities.push(activity));
  const tool = 'mcp__claude_in_chrome__read_page';
  const messages = [{ type: 'assistant', message: { content: [{ type: 'tool_use', id: 'known', name: tool, input: { secret: 'never retained' } }, { type: 'tool_use', id: 'unknown', name: 'mcp__claude_in_chrome__javascript_tool' }] } }, { type: 'user', message: { content: [{ type: 'tool_result', tool_use_id: 'wrong' }, { type: 'tool_result', tool_use_id: 'known', is_error: true, content: 'secret content' }, { type: 'tool_result', tool_use_id: 'known' }] } }];
  for (const message of messages) parser.push(Buffer.from(JSON.stringify(message) + '\n'));
  assert.deepEqual(activities, [{ tool, status: 'requested' }, { tool, status: 'failed' }]);
});
test('timeout, cancellation and host close terminate only owned jobs and await exit before cancelled receipts', async t => {
  const f = await fixture(t, { timeoutMs: 20 }); await f.launcher.handle(request()); await f.launcher.idle(); assert.equal(f.children[0].killed, true); assert.equal((await events(f.config)).at(-1).type, 'task.failed');
  const g = await fixture(t, { stop: async child => { setTimeout(() => child.kill(), 20); } }); const req = request(); await g.launcher.handle(req);
  let resolved = false; const cancelled = g.launcher.handle({ kind: 'launch.cancel', requestId: randomUUID(), launchRequestId: req.requestId }).then(value => { resolved = true; return value; });
  await new Promise(resolve => setTimeout(resolve, 5)); assert.equal(resolved, false); assert.equal((await events(g.config)).at(-1).type, 'task.started'); assert.equal((await cancelled as any).status, 'cancelled'); assert.equal((await events(g.config)).at(-1).type, 'task.cancelled');
  assert.equal((await g.launcher.handle({ kind: 'launch.cancel', requestId: randomUUID(), launchRequestId: randomUUID() }) as any).reason, 'not_owned');
  const third = request(); await g.launcher.handle(third); await g.launcher.close(); assert.equal(g.children[1].killed, true); assert.equal((await g.launcher.handle(request()) as any).reason, 'host_closed');
});
test('native host announces controls, forwards inventory and owns disconnect cleanup', async t => {
  const f = await fixture(t); const input = new PassThrough(), output = new PassThrough(), decoder = new FrameDecoder(), messages: any[] = [];
  output.on('data', chunk => decoder.push(chunk, value => messages.push(value)));
  const host = new NativeHost(f.config, input, output, () => {}, readBounded, Date.now, f.launcher); await host.start();
  assert.deepEqual(messages[0].capabilities, { discovery: true, launch: true, browserActivity: true });
  input.write(encodeFrame({ kind: 'inventory.request', requestId: randomUUID() })); await host.idle(); assert.equal(messages.some(value => value.kind === 'inventory.result'), true);
  input.write(encodeFrame(request())); await host.idle(); assert.equal(f.calls.length, 1); input.end(); await waitFor(() => f.children[0].killed); await host.close(); input.destroy(); output.destroy();
});
test('Codex launch has isolated cwd, read-only sandbox and no arbitrary configuration or browser claim', () => {
  const args = launchArguments(request({ sourceId: 'codex' }), 'owned-dir'); assert.deepEqual(args, ['exec', '--json', '--ephemeral', '--ignore-user-config', '--sandbox', 'read-only', '--skip-git-repo-check', '-C', 'owned-dir', '-']);
});
