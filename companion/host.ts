import * as fs from 'node:fs/promises';
import { watch, type FSWatcher } from 'node:fs';
import path from 'node:path';
import type { Readable, Writable } from 'node:stream';
import { z } from 'zod';
import type { SourceId } from '../src/shared/types';
import { initializeDirectories, SOURCE_IDS, type HostConfig } from './config';
import { leaseSchema, verify, verifyEvent } from './envelope';
import { FrameDecoder, encodeFrame } from './framing';
import { isMissing, readBounded } from './storage';
import { MAX_QUEUE_FILES, RETENTION_MS, UUID_FILE } from './queue';
import { controlRequestSchema } from '../src/shared/launch';
import { Launcher } from './launcher';

const ackSchema = z.object({ kind: z.literal('event.ack'), sourceId: z.enum(SOURCE_IDS), eventId: z.uuid(), status: z.enum(['accepted', 'duplicate', 'rejected']), reason: z.string().max(160).optional() }).strict();
type Pending = { file: string; sourceId: SourceId; eventId: string; sentAt: number };
export class NativeHost {
  private readonly decoder = new FrameDecoder();
  private readonly pending = new Map<string, Pending>();
  private readonly watchers: FSWatcher[] = [];
  private timer?: ReturnType<typeof setInterval>;
  private serial: Promise<unknown> = Promise.resolve();
  private queuedJobs = 0;
  private scanQueued = false;
  private closed = false;
  private readonly statuses = new Map<SourceId, string>();
  private readonly directories = new Map<SourceId, Awaited<ReturnType<typeof initializeDirectories>>>();
  private launcher: Launcher;
  private closing?: Promise<void>;
  constructor(private config: HostConfig, private input: Readable, private output: Writable, private diagnostic: (code: string) => void = code => process.stderr.write(`hub: ${code}\n`), private readFile: typeof readBounded = readBounded, private now: () => number = Date.now, launcher?: Launcher) { this.launcher = launcher || new Launcher(config, { diagnostic }); }
  async start(): Promise<void> {
    for (const source of SOURCE_IDS) this.directories.set(source, await initializeDirectories(this.config.dataDirectory, source));
    await this.launcher.initialize();
    this.input.on('data', this.onData); this.input.once('end', this.onEnd); this.input.once('error', this.onStreamError); this.output.once('error', this.onStreamError);
    await this.write({ kind: 'bridge.ready', protocolVersion: 1, capabilities: { discovery: true, launch: true, browserActivity: true } });
    if (this.closed) return;
    for (const directories of this.directories.values()) for (const directory of [directories.queue, directories.leases]) {
      const watcher = watch(directory, () => this.requestScan());
      watcher.on('error', () => this.diagnostic('watch_failed_using_periodic_scan'));
      this.watchers.push(watcher);
    }
    this.timer = setInterval(() => this.requestScan(), 10000);
    this.requestScan();
  }
  private onData = (chunk: Buffer): void => {
    try { this.decoder.push(chunk, value => {
      if (this.queuedJobs >= 128) throw new Error('input_queue_full');
      const ack = ackSchema.safeParse(value);
      if (ack.success) this.enqueue(async () => this.acknowledge(ack.data));
      else { const request = controlRequestSchema.parse(value); this.enqueue(async () => { await this.write(await this.launcher.handle(request)); this.requestScan(); }); }
    }); } catch { this.diagnostic('invalid_native_input'); void this.close(); }
  };
  private onEnd = (): void => { try { this.decoder.end(); } catch { this.diagnostic('truncated_native_input'); } void this.close(); };
  private onStreamError = (): void => { this.diagnostic('native_stream_closed'); void this.close(); };
  private enqueue(job: () => Promise<void>): void {
    if (this.closed) return;
    this.queuedJobs++;
    this.serial = this.serial.then(async () => { if (!this.closed) await job(); }).catch(() => { this.diagnostic('local_io_failed'); }).finally(() => { this.queuedJobs--; });
  }
  requestScan(): void {
    if (this.scanQueued || this.closed) return;
    this.scanQueued = true;
    this.enqueue(async () => { this.scanQueued = false; await this.scan(); });
  }
  async idle(): Promise<void> { await this.serial; }
  private async write(value: unknown): Promise<void> {
    if (this.closed) return;
    const frame = encodeFrame(value);
    await new Promise<void>((resolve, reject) => { this.output.write(frame, error => error ? reject(error) : resolve()); });
  }
  private async scan(): Promise<void> {
    const now = this.now();
    for (const sourceId of SOURCE_IDS) {
      if (this.closed) return;
      const directories = this.directories.get(sourceId)!;
      let online = false;
      for (const name of (await fs.readdir(directories.leases)).slice(0, 128)) {
        if (!UUID_FILE.test(name)) continue;
        try {
          const file = path.join(directories.leases, name);
          const lease = leaseSchema.parse(verify(JSON.parse(await this.readFile(file, 4096)), this.config.secrets[sourceId]));
          if (lease.sourceId !== sourceId || `${lease.sessionId}.json` !== name) throw new Error('lease_identity_mismatch');
          const timestamp = Date.parse(lease.timestamp), expires = Date.parse(lease.expiresAt);
          if (timestamp > now + 5000 || expires - timestamp !== 30000) throw new Error('lease_time_invalid');
          if (expires < now) { await fs.rm(file, { force: true }); continue; }
          try { process.kill(lease.pid, 0); online = true; } catch { await fs.rm(file, { force: true }); }
        } catch { this.diagnostic('lease_rejected'); }
      }
      const status = online ? 'online' : 'disconnected';
      if (online || this.statuses.get(sourceId) !== status) {
        await this.write({ kind: 'agent.connection', authenticatedSourceId: sourceId, status, timestamp: new Date(now).toISOString() });
        this.statuses.set(sourceId, status);
      }
      const events: { file: string; event: ReturnType<typeof verifyEvent> }[] = [];
      const queueNames = await fs.readdir(directories.queue);
      const present = new Set(queueNames);
      for (const [key, pending] of this.pending) if (pending.sourceId === sourceId && !present.has(`${pending.eventId}.json`)) this.pending.delete(key);
      for (const name of queueNames.slice(0, MAX_QUEUE_FILES)) {
        if (!UUID_FILE.test(name)) continue;
        const file = path.join(directories.queue, name);
        let text: string;
        try {
          text = await this.readFile(file);
        } catch (error) {
          // An I/O error is not proof of corrupt data. Keep the unique undelivered event for retry.
          if (!isMissing(error)) this.diagnostic('outbox_read_failed');
          continue;
        }
        let event: ReturnType<typeof verifyEvent>;
        try {
          event = verifyEvent(JSON.parse(text), this.config.secrets[sourceId], sourceId);
          if (`${event.eventId}.json` !== name || Date.parse(event.timestamp) > now + 300000) throw new Error('event_identity_or_time_invalid');
        } catch {
          this.diagnostic('outbox_event_rejected'); await fs.rm(file, { force: true }); this.pending.delete(`${sourceId}:${name.slice(0, -5)}`); continue;
        }
        if (Date.parse(event.timestamp) < now - RETENTION_MS) { await fs.rm(file, { force: true }); this.pending.delete(`${sourceId}:${event.eventId}`); this.diagnostic('event_retention_expired'); continue; }
        events.push({ file, event });
      }
      events.sort((a, b) => a.event.taskId.localeCompare(b.event.taskId) || a.event.runId.localeCompare(b.event.runId) || a.event.sequence - b.event.sequence || a.event.eventId.localeCompare(b.event.eventId));
      for (const { file, event } of events) {
        if (this.closed) return;
        const key = `${sourceId}:${event.eventId}`;
        const pending = this.pending.get(key);
        if (pending && now - pending.sentAt < 30000) continue;
        if (!pending && this.pending.size >= 64) break;
        this.pending.set(key, { file, sourceId, eventId: event.eventId, sentAt: now });
        await this.write({ kind: 'agent.event', authenticatedSourceId: sourceId, event });
      }
    }
  }
  private async acknowledge(ack: z.infer<typeof ackSchema>): Promise<void> {
    const key = `${ack.sourceId}:${ack.eventId}`;
    const pending = this.pending.get(key);
    if (!pending) return;
    // Only identifiers previously forwarded by this host can cause deletion. No payload supplies a path.
    await fs.rm(pending.file, { force: true });
    this.pending.delete(key);
    if (ack.status === 'rejected') this.diagnostic('extension_rejected_event');
    this.requestScan();
  }
  async close(): Promise<void> {
    if (this.closing) return this.closing;
    this.closed = true; clearInterval(this.timer); this.watchers.forEach(watcher => watcher.close());
    this.input.off('data', this.onData); this.input.off('end', this.onEnd); this.input.off('error', this.onStreamError); this.output.off('error', this.onStreamError);
    this.input.pause();
    this.closing = this.launcher.close();
    await this.closing;
    // Do not unlink outstanding events: Chrome may not have durably persisted them.
  }
}
