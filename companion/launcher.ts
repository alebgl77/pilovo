import { createHmac } from 'node:crypto';
import * as fs from 'node:fs/promises';
import path from 'node:path';
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { z } from 'zod';
import { controlRequestSchema, launchResultSchema, type ControlRequest, type ControlResponse, type LaunchRequest, type LaunchResult, type LaunchReason, type BrowserActivity } from '../src/shared/launch';
import type { SourceId } from '../src/shared/types';
import type { HostConfig } from './config';
import { AgentDiscovery } from './discovery';
import { EventQueue, AdapterLease, UUID_FILE } from './queue';
import { atomicWrite, ensurePrivateDirectory, isMissing, readBounded, withLock } from './storage';
import { ProviderOutput, MAX_OUTPUT_BYTES } from './provider-output';
import { sign, verify } from './envelope';

const terminalType = z.enum(['task.completed', 'task.failed', 'task.cancelled']);
const recordSchema = z.object({ version: z.literal(1), requestId: z.uuid(), digest: z.string().regex(/^[a-f0-9]{64}$/), sourceId: z.enum(['claude-code', 'codex']), ownerPid: z.number().int().positive(), status: z.enum(['reserved', 'running', 'finished', 'interrupted']), result: launchResultSchema, terminalPending: terminalType.optional(), updatedAt: z.iso.datetime() }).strict();
type LaunchRecord = z.infer<typeof recordSchema>;
type SpawnJob = (executable: string, args: string[], options: { cwd: string; env: NodeJS.ProcessEnv; shell: false; windowsHide: true; stdio: ['pipe', 'pipe', 'pipe'] }) => ChildProcessWithoutNullStreams;
export interface LauncherDependencies { discovery: Pick<AgentDiscovery, 'inventory'>; spawn: SpawnJob; stop(child: ChildProcessWithoutNullStreams): Promise<void>; timeoutMs: number; cleanupTimeoutMs: number; maxRecords: number; diagnostic(code: string): void }
type Job = { child: ChildProcessWithoutNullStreams; record: LaunchRecord; queue: EventQueue; retainResult: boolean; handle?: string; lease?: AdapterLease; serial: Promise<unknown>; done: Promise<void>; resolve(): void; stopReason?: 'cancelled' | 'timeout' | 'output_limit' | 'storage_failed' | 'disconnected'; timer?: ReturnType<typeof setTimeout>; exited: boolean; finalizationFailed?: boolean };
async function retryStorage(action: () => Promise<unknown>): Promise<void> { for (let attempt = 0; ; attempt++) { try { await action(); return; } catch (error) { if ((error as Error).message === 'task_already_ended') return; if (attempt >= 2) throw error; await new Promise(resolve => setTimeout(resolve, 25)); } } }
async function boundedWait(promise: Promise<unknown>, timeoutMs: number): Promise<boolean> { let timer: ReturnType<typeof setTimeout>; return Promise.race([promise.then(() => true, () => false), new Promise<boolean>(resolve => { timer = setTimeout(() => resolve(false), timeoutMs); })]).finally(() => clearTimeout(timer!)); }

export function launchArguments(request: LaunchRequest, directory: string): string[] {
  if (request.sourceId === 'codex') return ['exec', '--json', '--ephemeral', '--ignore-user-config', '--sandbox', 'read-only', '--skip-git-repo-check', '-C', directory, '-'];
  return ['-p', '--output-format', 'stream-json', '--verbose', '--input-format', 'text', '--tools', '', '--strict-mcp-config', '--mcp-config', path.join(directory, 'mcp.json'), '--setting-sources', '', '--no-session-persistence', '--disable-slash-commands', '--safe-mode', '--permission-mode', 'manual', '--permission-prompts', 'none', '--no-chrome'];
}
export function childEnvironment(): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {};
  for (const key of ['PATH', 'Path', 'SystemRoot', 'WINDIR', 'COMSPEC', 'PATHEXT', 'USERPROFILE', 'HOME', 'APPDATA', 'LOCALAPPDATA', 'TEMP', 'TMP', 'CODEX_HOME', 'CLAUDE_CONFIG_DIR', 'ANTHROPIC_API_KEY', 'OPENAI_API_KEY', 'HTTP_PROXY', 'HTTPS_PROXY', 'NO_PROXY', 'SSL_CERT_FILE', 'SSL_CERT_DIR']) if (process.env[key] !== undefined) env[key] = process.env[key];
  return env;
}
export async function stopOwnedChild(child: ChildProcessWithoutNullStreams): Promise<void> {
  if (child.exitCode !== null || child.signalCode !== null || !child.pid) return;
  if (process.platform === 'win32') {
    // Fixed system executable, arguments and an in-memory owned child PID; never a UI-supplied PID.
    const taskkill = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'taskkill.exe');
    await new Promise<void>(resolve => {
      const killer = spawn(taskkill, ['/PID', String(child.pid), '/T', '/F'], { shell: false, windowsHide: true, stdio: 'ignore' });
      const timer = setTimeout(() => { killer.kill(); resolve(); }, 5000);
      killer.once('error', () => { clearTimeout(timer); resolve(); }); killer.once('close', () => { clearTimeout(timer); resolve(); });
    });
  }
  if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
}
export class Launcher {
  private jobs = new Map<string, Job>();
  private queues = new Map<SourceId, EventQueue>();
  private serial: Promise<unknown> = Promise.resolve();
  private closed = false;
  private ready = false;
  private directory: string;
  private deps: LauncherDependencies;
  constructor(private config: HostConfig, deps: Partial<LauncherDependencies> = {}) {
    this.directory = path.join(config.dataDirectory, 'launches');
    this.deps = { discovery: new AgentDiscovery(), spawn: (file, args, options) => spawn(file, args, options), stop: stopOwnedChild, timeoutMs: 120000, cleanupTimeoutMs: 10000, maxRecords: 10000, diagnostic: () => {}, ...deps };
    if (!Number.isInteger(this.deps.timeoutMs) || this.deps.timeoutMs < 1 || this.deps.timeoutMs > 600000 || !Number.isInteger(this.deps.cleanupTimeoutMs) || this.deps.cleanupTimeoutMs < 1 || this.deps.cleanupTimeoutMs > 10000 || !Number.isInteger(this.deps.maxRecords) || this.deps.maxRecords < 1 || this.deps.maxRecords > 10000) throw new Error('invalid_launch_limits');
  }
  async initialize(): Promise<void> {
    if (this.ready) return;
    await ensurePrivateDirectory(this.config.dataDirectory); await ensurePrivateDirectory(this.directory); await ensurePrivateDirectory(path.join(this.config.dataDirectory, 'jobs'));
    for (const sourceId of ['claude-code', 'codex'] as const) this.queues.set(sourceId, await EventQueue.create({ version: 1, sourceId, dataDirectory: this.config.dataDirectory, secret: this.config.secrets[sourceId] }));
    await withLock(this.directory, async () => {
      for (const name of (await fs.readdir(this.directory)).filter(name => UUID_FILE.test(name))) {
        const record = await this.load(name);
        if (record.requestId + '.json' !== name) throw new Error('launch_identity_invalid');
        if (record.terminalPending && record.result.taskId) { await this.recoverTerminal(record, record.terminalPending, 'Recovered provider lifecycle receipt; response text is unavailable.'); continue; }
        if (record.status !== 'reserved' && record.status !== 'running') continue;
        let alive = false; try { process.kill(record.ownerPid, 0); alive = true; } catch {}
        if (alive) continue;
        record.status = 'interrupted'; record.updatedAt = new Date().toISOString();
        await this.save(record);
        if (record.result.taskId) await this.recoverTerminal(record, 'task.failed', 'Launch interrupted; completion was not observed.');
      }
    });
    this.ready = true;
  }
  handle(input: unknown): Promise<ControlResponse> {
    const request = controlRequestSchema.parse(input);
    if (request.kind === 'launch.cancel') return this.cancel(request);
    const next = this.serial.then(async () => {
      await this.initialize();
      if (request.kind === 'inventory.request') return { kind: 'inventory.result' as const, requestId: request.requestId, checkedAt: new Date().toISOString(), agents: (await this.deps.discovery.inventory(request.refresh)).map(value => value.agent), jobs: [...this.jobs.values()].filter(job => !job.exited && job.record.result.taskId && job.record.result.runId).map(job => ({ launchRequestId: job.record.requestId, taskId: job.record.result.taskId!, runId: job.record.result.runId!, sourceId: job.record.sourceId })) };
      return this.launch(request);
    });
    this.serial = next.catch(() => {}); return next;
  }
  private save(record: LaunchRecord): Promise<void> { return atomicWrite(path.join(this.directory, `${record.requestId}.json`), sign(record, this.config.secrets[record.sourceId])); }
  private async load(name: string): Promise<LaunchRecord> {
    const signed = JSON.parse(await readBounded(path.join(this.directory, name), 8192));
    for (const sourceId of ['claude-code', 'codex'] as const) {
      try { const record = recordSchema.parse(verify(signed, this.config.secrets[sourceId])); if (record.sourceId === sourceId && record.requestId + '.json' === name) return record; } catch {}
    }
    throw new Error('launch_record_invalid');
  }
  private reject(requestId: string, reason: LaunchReason): LaunchResult { return { kind: 'launch.result', requestId, status: 'rejected', reason }; }
  private async terminal(record: LaunchRecord, type: z.infer<typeof terminalType>, summary: string): Promise<void> {
    record.terminalPending = type; record.updatedAt = new Date().toISOString(); await retryStorage(() => this.save(record));
    if (record.result.taskId) await retryStorage(() => this.queues.get(record.sourceId)!.update(record.result.taskId!, type, { summary }));
    delete record.terminalPending; record.status = 'finished'; await retryStorage(() => this.save(record));
  }
  private async recoverTerminal(record: LaunchRecord, type: z.infer<typeof terminalType>, summary: string): Promise<void> {
    try { await this.terminal(record, type, summary); }
    catch (error) {
      if (!isMissing(error)) throw error;
      // EventQueue's seven-day retention may already have removed the task state. Keep replay protection forever.
      delete record.terminalPending; record.status = 'interrupted'; await this.save(record); this.deps.diagnostic('launch_receipt_retention_expired');
    }
  }
  private async launch(request: LaunchRequest): Promise<LaunchResult> {
    if (this.closed) return this.reject(request.requestId, 'host_closed');
    const digest = createHmac('sha256', this.config.secrets[request.sourceId]).update(JSON.stringify(request)).digest('hex');
    let record: LaunchRecord;
    try {
      const reserved = await withLock(this.directory, async (): Promise<LaunchRecord | LaunchResult> => {
        try {
          const previous = await this.load(`${request.requestId}.json`);
          if (previous.digest !== digest) return this.reject(request.requestId, 'request_conflict');
          return previous.result;
        } catch (error) { if (!isMissing(error)) throw error; }
        const names = (await fs.readdir(this.directory)).filter(name => UUID_FILE.test(name));
        if (names.length >= this.deps.maxRecords) return this.reject(request.requestId, 'capacity_reached');
        if (Date.now() - Date.parse(request.createdAt) > 300000 || Date.parse(request.createdAt) - Date.now() > 30000) return this.reject(request.requestId, 'expired_request');
        const active = [];
        for (const name of names) { const prior = await this.load(name); if (prior.status === 'reserved' || prior.status === 'running') active.push(prior); }
        let reason: LaunchReason | undefined;
        if (request.mode !== 'standard') reason = request.sourceId !== 'claude-code' ? 'unsupported_mode' : 'browser_setup_required';
        else if (active.length >= 2) reason = 'capacity_reached';
        const entry: LaunchRecord = { version: 1, requestId: request.requestId, digest, sourceId: request.sourceId, ownerPid: process.pid, status: reason ? 'finished' : 'reserved', result: this.reject(request.requestId, reason || 'interrupted'), updatedAt: new Date().toISOString() };
        await this.save(entry); return entry;
      });
      if ('kind' in reserved) return reserved;
      record = reserved;
    } catch { return this.reject(request.requestId, 'storage_failed'); }
    if (record.status === 'finished') return record.result;
    const fail = async (reason: LaunchReason): Promise<LaunchResult> => { record.result = { ...this.reject(request.requestId, reason), ...(record.result.taskId ? { taskId: record.result.taskId, runId: record.result.runId } : {}) }; record.status = 'finished'; record.updatedAt = new Date().toISOString(); try { await this.save(record); } catch { this.deps.diagnostic('launch_record_write_failed'); } return record.result; };
    let executable: string | undefined;
    try {
      const found = (await this.deps.discovery.inventory()).find(value => value.agent.sourceId === request.sourceId);
      if (!found?.executable) return fail(found?.agent.availability === 'unavailable' ? 'cli_unavailable' : 'cli_not_found');
      executable = found.executable;
      await this.queues.get(request.sourceId)!.checkCapacity();
    } catch { return fail('capacity_reached'); }
    if (this.closed) return fail('host_closed');
    const directory = path.join(this.config.dataDirectory, 'jobs', request.requestId);
    try { await ensurePrivateDirectory(directory); await atomicWrite(path.join(directory, 'mcp.json'), { mcpServers: {} }); } catch { return fail('storage_failed'); }
    const queue = this.queues.get(request.sourceId)!;
    let handle: string;
    try {
      const started = await queue.start({ title: request.title, ...(request.contextUrl ? { contextUrl: request.contextUrl } : {}) }); handle = started.taskHandle;
      record.result = { ...record.result, taskId: started.taskId, runId: started.runId }; await this.save(record);
    } catch { if (record.result.taskId) { try { await this.terminal(record, 'task.failed', 'Launch could not be durably prepared.'); } catch { this.deps.diagnostic('launch_preparation_recovery_required'); } } return fail('storage_failed'); }
    if (this.closed) { await this.terminal(record, 'task.cancelled', 'Host closed before process launch.'); return fail('host_closed'); }
    let child: ChildProcessWithoutNullStreams;
    try { child = this.deps.spawn(executable, launchArguments(request, directory), { cwd: directory, env: childEnvironment(), shell: false, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] }); } catch { await this.terminal(record, 'task.failed', 'The provider process could not start.'); return fail('spawn_failed'); }
    let resolve!: () => void;
    const job: Job = { child, record, queue, handle, retainResult: request.retainResult, serial: Promise.resolve(), done: new Promise<void>(done => { resolve = done; }), resolve: () => resolve(), exited: false };
    this.jobs.set(request.requestId, job);
    const parser = new ProviderOutput(request.sourceId, activity => this.activity(job, activity));
    let outputBytes = 0;
    child.stdout.on('data', (chunk: Buffer) => { if (job.stopReason) return; outputBytes += chunk.length; if (outputBytes > MAX_OUTPUT_BYTES) { void this.stop(job, 'output_limit'); return; } try { parser.push(chunk); } catch { void this.stop(job, 'output_limit'); } });
    child.stderr.on('data', (chunk: Buffer) => { if (job.stopReason) return; outputBytes += chunk.length; if (outputBytes > MAX_OUTPUT_BYTES) void this.stop(job, 'output_limit'); });
    child.stdin.on('error', () => { void this.stop(job, 'disconnected'); });
    const spawned = new Promise<boolean>(done => { child.once('spawn', () => done(true)); child.once('error', () => done(false)); });
    let release!: () => void;
    const initialized = new Promise<void>(done => { release = done; });
    child.once('close', code => { job.exited = true; clearTimeout(job.timer); void initialized.then(() => this.finish(job, parser, code)).catch(() => { job.finalizationFailed = true; this.deps.diagnostic('launch_finalization_failed_recovery_required'); }).finally(() => { this.jobs.delete(request.requestId); job.resolve(); }); });
    try {
      if (!await spawned) { record.result = { ...record.result, status: 'rejected', reason: 'spawn_failed' }; return record.result; }
      job.timer = setTimeout(() => { void this.stop(job, 'timeout'); }, this.deps.timeoutMs);
      record.result = { kind: 'launch.result', requestId: request.requestId, status: 'accepted', taskId: record.result.taskId, runId: record.result.runId }; record.status = 'running'; record.updatedAt = new Date().toISOString(); await this.save(record);
      job.lease = await AdapterLease.start(job.queue);
      if (this.closed) await this.stop(job, 'disconnected'); else child.stdin.end(request.prompt, 'utf8');
      return record.result;
    } catch { await this.stop(job, 'storage_failed'); return this.reject(request.requestId, 'storage_failed'); }
    finally { release(); }
  }
  private activity(job: Job, activity: BrowserActivity): void {
    if (!job.handle || job.stopReason) return;
    job.serial = job.serial.then(() => job.queue.update(job.handle!, 'task.progress', { browserActivity: activity })).catch(() => { void this.stop(job, 'storage_failed'); });
  }
  private async finish(job: Job, parser: ProviderOutput, code: number | null): Promise<void> {
    let result = { success: false, summary: '' }; try { result = parser.finish(code); } catch {}
    await job.serial;
    try {
      if (job.handle) {
        const type = job.stopReason === 'cancelled' || job.stopReason === 'disconnected' ? 'task.cancelled' : !job.stopReason && result.success ? 'task.completed' : 'task.failed';
        const summary = type === 'task.completed' ? job.retainResult ? result.summary : 'The provider reported successful completion and exited successfully. Result text was not retained. Work is not independently verified.' : job.stopReason === 'timeout' ? 'Execution timed out.' : type === 'task.cancelled' ? 'Execution stopped after process exit.' : 'Execution failed; no successful provider completion was confirmed.';
        await this.terminal(job.record, type, summary);
      }
    } finally { await job.lease?.close(); }
  }
  private async stop(job: Job, reason: Job['stopReason']): Promise<void> {
    if (job.exited) return;
    job.stopReason ||= reason;
    if (!await boundedWait(this.deps.stop(job.child), this.deps.cleanupTimeoutMs)) this.deps.diagnostic('child_cleanup_failed');
  }
  private async cancel(request: Extract<ControlRequest, { kind: 'launch.cancel' }>): Promise<ControlResponse> {
    const job = this.jobs.get(request.launchRequestId);
    if (!job) return { kind: 'cancel.result', requestId: request.requestId, status: 'rejected', reason: 'not_owned' };
    await this.stop(job, 'cancelled'); const finished = await boundedWait(job.done, this.deps.cleanupTimeoutMs);
    if (!finished || !job.exited) return { kind: 'cancel.result', requestId: request.requestId, status: 'rejected', reason: 'cleanup_failed' };
    return job.finalizationFailed ? { kind: 'cancel.result', requestId: request.requestId, status: 'rejected', reason: 'storage_failed' } : { kind: 'cancel.result', requestId: request.requestId, status: 'cancelled' };
  }
  async idle(): Promise<void> { await this.serial; await Promise.all([...this.jobs.values()].map(job => job.done)); }
  async close(): Promise<void> {
    this.closed = true; await this.serial;
    await Promise.all([...this.jobs.values()].map(async job => { await this.stop(job, 'disconnected'); if (!await boundedWait(job.done, this.deps.cleanupTimeoutMs)) this.deps.diagnostic('cleanup_failed_owned_child_still_running'); }));
  }
}
