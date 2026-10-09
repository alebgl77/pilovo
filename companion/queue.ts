import { randomUUID } from 'node:crypto';
import * as fs from 'node:fs/promises';
import path from 'node:path';
import { z } from 'zod';
import type { AgentEvent, EventType } from '../src/shared/types';
import { eventSchema } from '../src/shared/protocol';
import type { AdapterConfig } from './config';
import { initializeDirectories } from './config';
import { sign, verify, leaseSchema } from './envelope';
import { atomicWrite, isMissing, readBounded, withLock } from './storage';

export const RETENTION_MS = 7 * 24 * 60 * 60 * 1000;
export const MAX_QUEUE_FILES = 1024;
export const MAX_QUEUE_BYTES = 16 * 1024 * 1024;
export const MAX_STATES = 1024;
export const UUID_FILE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.json$/;
const stateSchema = z.object({ version: z.literal(1), sourceId: z.enum(['claude-code', 'codex']), taskId: z.uuid(), runId: z.uuid(), sequence: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER), ended: z.boolean(), updatedAt: z.iso.datetime(), pending: eventSchema.optional() }).strict();
type RunState = z.infer<typeof stateSchema>;
export interface QueuedResult { status: 'queued'; sourceId: string; taskHandle: string; taskId: string; runId: string; eventId: string; sequence: number; instruction: string }
export class EventQueue {
  private serial: Promise<unknown> = Promise.resolve();
  private constructor(readonly config: AdapterConfig, readonly directories: Awaited<ReturnType<typeof initializeDirectories>>) {}
  static async create(config: AdapterConfig): Promise<EventQueue> {
    const queue = new EventQueue(config, await initializeDirectories(config.dataDirectory, config.sourceId));
    await queue.exclusive(async () => {
      await queue.cleanup();
      for (const name of await fs.readdir(queue.directories.states)) {
        if (!UUID_FILE.test(name)) continue;
        const state = await queue.loadState(name.slice(0, -5));
        if (state.pending) await queue.flush(state);
      }
    });
    return queue;
  }
  private exclusive<T>(fn: () => Promise<T>): Promise<T> {
    const next = this.serial.then(() => withLock(this.directories.root, fn));
    this.serial = next.catch(() => {});
    return next;
  }
  private statePath(taskId: string): string {
    if (!z.uuid().safeParse(taskId).success) throw new Error('task_handle_invalid');
    return path.join(this.directories.states, `${taskId}.json`);
  }
  private async loadState(taskId: string): Promise<RunState> {
    const state = stateSchema.parse(verify(JSON.parse(await readBounded(this.statePath(taskId))), this.config.secret));
    if (state.taskId !== taskId || state.sourceId !== this.config.sourceId || (state.pending && (state.pending.taskId !== taskId || state.pending.runId !== state.runId || state.pending.sourceId !== state.sourceId || state.pending.sequence !== state.sequence))) throw new Error('state_identity_mismatch');
    return state;
  }
  private async saveState(state: RunState): Promise<void> { await atomicWrite(this.statePath(state.taskId), sign(state, this.config.secret)); }
  private async flush(state: RunState): Promise<void> {
    if (!state.pending) return;
    const event = state.pending;
    const file = path.join(this.directories.queue, `${event.eventId}.json`);
    const encoded = sign(event, this.config.secret);
    let alreadyExists = false;
    try {
      const existing = await readBounded(file);
      if (existing !== JSON.stringify(encoded)) throw new Error('event_id_collision');
      alreadyExists = true;
    } catch (error) { if (!isMissing(error)) throw error; }
    if (!alreadyExists) {
      const entries = await fs.readdir(this.directories.queue, { withFileTypes: true });
      let bytes = 0;
      for (const entry of entries) {
        if (!entry.isFile()) throw new Error('unsafe_queue_entry');
        const stat = await fs.lstat(path.join(this.directories.queue, entry.name)); bytes += stat.size;
      }
      if (entries.length >= MAX_QUEUE_FILES || bytes + Buffer.byteLength(JSON.stringify(encoded)) > MAX_QUEUE_BYTES) throw new Error('outbox_full');
      await atomicWrite(file, encoded);
    }
    delete state.pending;
    await this.saveState(state);
  }
  private async cleanup(): Promise<void> {
    const cutoff = Date.now() - RETENTION_MS;
    for (const directory of [this.directories.states, this.directories.queue, this.directories.leases]) {
      for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
        if (!entry.isFile() || (!UUID_FILE.test(entry.name) && !/^\.[0-9a-f-]{36}\.tmp$/.test(entry.name))) throw new Error('unsafe_storage_entry');
        const file = path.join(directory, entry.name);
        const stat = await fs.lstat(file);
        if (stat.mtimeMs < cutoff) await fs.rm(file, { force: true });
      }
    }
  }
  async checkCapacity(): Promise<void> {
    await this.exclusive(async () => {
      await this.cleanup();
      if ((await fs.readdir(this.directories.states)).length >= MAX_STATES) throw new Error('task_capacity_reached');
      const files = await fs.readdir(this.directories.queue);
      let bytes = 0;
      for (const file of files) bytes += (await fs.lstat(path.join(this.directories.queue, file))).size;
      if (files.length >= MAX_QUEUE_FILES - 4 || bytes > MAX_QUEUE_BYTES - 256 * 1024) throw new Error('outbox_full');
    });
  }
  async start(payload: AgentEvent['payload']): Promise<QueuedResult> {
    return this.exclusive(async () => {
      await this.cleanup();
      if ((await fs.readdir(this.directories.states)).length >= MAX_STATES) throw new Error('task_capacity_reached');
      const state: RunState = { version: 1, sourceId: this.config.sourceId, taskId: randomUUID(), runId: randomUUID(), sequence: 0, ended: false, updatedAt: new Date().toISOString() };
      return this.emit(state, 'task.started', payload);
    });
  }
  async update(taskHandle: string, type: Exclude<EventType, 'task.started'>, payload: AgentEvent['payload']): Promise<QueuedResult> {
    return this.exclusive(async () => {
      await this.cleanup();
      const state = await this.loadState(taskHandle);
      if (state.pending) await this.flush(state);
      if (state.ended) throw new Error('task_already_ended');
      return this.emit(state, type, payload);
    });
  }
  private async emit(state: RunState, type: EventType, payload: AgentEvent['payload']): Promise<QueuedResult> {
    if (payload.prompt !== undefined) throw new Error('prompt_collection_disabled');
    const event = eventSchema.parse({ schemaVersion: 1, eventId: randomUUID(), sourceId: this.config.sourceId, taskId: state.taskId, runId: state.runId, sequence: state.sequence + 1, timestamp: new Date().toISOString(), type, payload });
    state.sequence = event.sequence; state.updatedAt = event.timestamp; state.ended = type === 'task.completed' || type === 'task.failed' || type === 'task.cancelled'; state.pending = event;
    // Write-ahead state: after a crash, the exact eventId/sequence is re-enqueued before another update.
    await this.saveState(state);
    await this.flush(state);
    return { status: 'queued', sourceId: this.config.sourceId, taskHandle: state.taskId, taskId: state.taskId, runId: state.runId, eventId: event.eventId, sequence: event.sequence, instruction: 'Queued locally. Delivery and durable receipt must be checked in the hub. Completion is agent-reported, not independently verified. Keep taskHandle for subsequent updates.' };
  }
}
export class AdapterLease {
  readonly sessionId = randomUUID();
  private timer?: ReturnType<typeof setInterval>;
  private serial: Promise<unknown> = Promise.resolve();
  private closed = false;
  private constructor(private queue: EventQueue) {}
  static async start(queue: EventQueue): Promise<AdapterLease> {
    const lease = new AdapterLease(queue);
    if ((await fs.readdir(queue.directories.leases)).length >= 128) throw new Error('adapter_capacity_reached');
    await lease.refresh();
    lease.timer = setInterval(() => { void lease.refresh().catch(() => { process.stderr.write('hub: lease_refresh_failed\n'); }); }, 10000);
    lease.timer.unref();
    return lease;
  }
  private refresh(): Promise<void> {
    const write = async () => {
      if (this.closed) return;
      const now = Date.now();
      const lease = leaseSchema.parse({ version: 1, sourceId: this.queue.config.sourceId, sessionId: this.sessionId, pid: process.pid, timestamp: new Date(now).toISOString(), expiresAt: new Date(now + 30000).toISOString() });
      await atomicWrite(path.join(this.queue.directories.leases, `${this.sessionId}.json`), sign(lease, this.queue.config.secret));
    };
    const next = this.serial.then(write); this.serial = next.catch(() => {}); return next;
  }
  async close(): Promise<void> { this.closed = true; clearInterval(this.timer); await this.serial; await fs.rm(path.join(this.queue.directories.leases, `${this.sessionId}.json`), { force: true }); }
}
