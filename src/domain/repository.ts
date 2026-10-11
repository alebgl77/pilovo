import { openDB, type DBSchema, type IDBPDatabase, type IDBPTransaction } from 'idb';
import { z } from 'zod';
import { CONNECTORS, DEFAULT_SETTINGS } from '../shared/defaults';
import { HubError } from '../shared/errors';
import { eventSchema, taskKey } from '../shared/protocol';
import type { AgentEvent, BridgeStatus, Connector, Diagnostics, ExportData, Mission, Settings, Snapshot, SourceId, TabBinding, TaskRun } from '../shared/types';
import type { EventAck } from '../shared/protocol';
import { makeVerificationCheck, type HashEvidence } from './verification';
import { webPreparationInputSchema, webPreparationPatchSchema, type WebPreparation, type WebPreparationInput, type WebPreparationPatch } from '../shared/web';
import { autoAcknowledgeSchema } from '../shared/activity';

export const LIMITS = { tasks: 2000, missions: 250, webPreparations: 250, eventsPerTask: 250, eventsTotal: 10000, deletedRuns: 10000, staleMs: 90_000 } as const;
type StoredEvent = AgentEvent & { id: string; taskKey: string; receivedAt: string };
type StoredWebPreparation = WebPreparation & { createFingerprint: string };
interface Meta { key: string; value: unknown }
interface HubDB extends DBSchema {
  tasks: { key: string; value: TaskRun; indexes: { 'by-pair': [string, string]; 'by-source': SourceId; 'by-received': string } };
  missions: { key: string; value: Mission };
  events: { key: string; value: StoredEvent; indexes: { 'by-task': string; 'by-source-event': [SourceId, string]; 'by-received': string } };
  tombstones: { key: string; value: { key: string; deletedAt: string } };
  meta: { key: string; value: Meta };
  webPreparations: { key: string; value: StoredWebPreparation; indexes: { 'by-updated': string; 'by-mission': string } };
}
type WriteTx = IDBPTransaction<HubDB, ['tasks', 'missions', 'events', 'tombstones', 'meta', 'webPreparations'], 'readwrite'>;
const stores = ['tasks', 'missions', 'events', 'tombstones', 'meta', 'webPreparations'] as const;
const settingSchema = z.object({ language: z.enum(['fr', 'en']).optional(), theme: z.enum(['system', 'light', 'dark']).optional(), retentionDays: z.number().int().min(1).max(365).optional(), retainPrompts: z.boolean().optional(), notifications: z.literal(false).optional(), bridgeEnabled: z.boolean().optional(), autoAcknowledgeSeconds: autoAcknowledgeSchema.optional() }).strict();
// Settings written by older versions lack newer fields (autoAcknowledgeSeconds): every read merges the stored value over
// the defaults, without a migration, and an unexpected stored value falls back to its default (off).
function storedSettings(value: unknown): Settings {
  const settings: Settings = { ...DEFAULT_SETTINGS, ...(value && typeof value === 'object' ? value as Partial<Settings> : {}), bridgeEnabled: false };
  if (!autoAcknowledgeSchema.safeParse(settings.autoAcknowledgeSeconds).success) settings.autoAcknowledgeSeconds = DEFAULT_SETTINGS.autoAcknowledgeSeconds;
  return settings;
}
const titleSchema = z.string().trim().min(1).max(240);
const terminal = new Set(['completed', 'failed', 'cancelled']);
const eventExecution = { 'task.started': 'running', 'task.progress': 'running', 'task.waiting': 'waiting_input', 'task.completed': 'completed', 'task.failed': 'failed', 'task.cancelled': 'cancelled' } as const;
const initialDiagnostics = (): Diagnostics => ({ acceptedEvents: 0, duplicateEvents: 0, rejectedEvents: 0 });
function validate<T>(schema: z.ZodType<T>, value: unknown): T { const result = schema.safeParse(value); if (!result.success) throw new HubError('validation.invalid'); return result.data; }
function cleanEvent(event: AgentEvent, retain: boolean): AgentEvent { const copy = structuredClone(event); if (!retain) delete copy.payload.prompt; return copy; }
function unstore(event: StoredEvent): AgentEvent { const { id: _id, taskKey: _key, receivedAt: _received, ...clean } = event; return clean; }
function publicPreparation(value: StoredWebPreparation): WebPreparation { const { createFingerprint: _fingerprint, ...preparation } = value; return preparation; }
function nextPreparationRevision(revision: number): number {
  if (!Number.isSafeInteger(revision) || revision < 1 || revision >= Number.MAX_SAFE_INTEGER) throw new HubError('storage.limit');
  return revision + 1;
}
async function preparationFingerprint(input: WebPreparationInput): Promise<string> {
  // Fixed-order, bounded input; retain only a digest for retry comparison, never an unconsented prompt.
  const bytes = new TextEncoder().encode(JSON.stringify([input.id, input.provider, input.title, input.prompt ?? null, input.notes ?? null, input.missionId ?? null, input.retainPrompt === true]));
  return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), byte => byte.toString(16).padStart(2, '0')).join('');
}

export class HubRepository {
  private readonly db: Promise<IDBPDatabase<HubDB>>;
  constructor(name = 'agent-control-hub-v1', private readonly now: () => number = Date.now) {
    this.db = openDB<HubDB>(name, 4, { upgrade(db, oldVersion, _newVersion, tx) {
      if (oldVersion < 1) {
      db.createObjectStore('tasks', { keyPath: 'key' }).createIndex('by-pair', ['taskId', 'runId']);
      db.createObjectStore('missions', { keyPath: 'id' });
      const events = db.createObjectStore('events', { keyPath: 'id' });
      events.createIndex('by-task', 'taskKey'); events.createIndex('by-source-event', ['sourceId', 'eventId'], { unique: true });
      db.createObjectStore('tombstones', { keyPath: 'key' }); db.createObjectStore('meta', { keyPath: 'key' });
      }
      if (oldVersion < 2) { tx.objectStore('tasks').createIndex('by-source', 'sourceId'); tx.objectStore('tasks').createIndex('by-received', 'receivedAt'); tx.objectStore('events').createIndex('by-received', 'receivedAt'); }
      if (oldVersion < 3) { const web = db.createObjectStore('webPreparations', { keyPath: 'id' }); web.createIndex('by-updated', 'updatedAt'); web.createIndex('by-mission', 'missionId'); }
      if (oldVersion < 4) {
        // openDB reports migration failure; also consume the wrapped transaction's rejection.
        void tx.done.catch(() => undefined);
        void (async () => {
          let cursor = await tx.objectStore('webPreparations').openCursor();
          while (cursor) { await cursor.update({ ...cursor.value, revision: 1 }); cursor = await cursor.continue(); }
        })().catch(() => { try { tx.abort(); } catch { /* The failed migration already aborted the transaction. */ } });
      }
    } });
  }
  async close() { (await this.db).close(); }
  private date() { return new Date(this.now()).toISOString(); }
  private async write<T>(run: (tx: WriteTx) => Promise<T>): Promise<T> {
    let tx: WriteTx | undefined;
    try { tx = (await this.db).transaction([...stores], 'readwrite'); const result = await run(tx); await tx.done; return result; }
    catch (error) { try { tx?.abort(); } catch { /* Already aborted or committed. */ } if (tx) await tx.done.catch(() => undefined); throw error instanceof HubError ? error : new HubError('storage.failed'); }
  }
  private async meta<T>(tx: WriteTx, key: string, fallback: T): Promise<T> { return ((await tx.objectStore('meta').get(key))?.value as T | undefined) ?? structuredClone(fallback); }
  private async setMeta(tx: WriteTx, key: string, value: unknown) { await tx.objectStore('meta').put({ key, value }); }
  private async settings(tx: WriteTx) { return storedSettings((await tx.objectStore('meta').get('settings'))?.value); }
  private async task(tx: WriteTx, key: string) { const task = await tx.objectStore('tasks').get(key); if (!task) throw new HubError('task.missing'); return task; }
  private async diagnostics(tx: WriteTx, kind: 'accepted' | 'duplicate' | 'rejected', code?: Diagnostics['lastError']) {
    const diagnostics = await this.meta(tx, 'diagnostics', initialDiagnostics());
    diagnostics[`${kind}Events`] = Math.min(Number.MAX_SAFE_INTEGER, diagnostics[`${kind}Events`] + 1);
    if (code) { diagnostics.lastError = code; diagnostics.lastErrorAt = this.date(); }
    await this.setMeta(tx, 'diagnostics', diagnostics);
  }
  async ingest(authenticatedSourceId: SourceId, input: unknown): Promise<EventAck> {
    const parsed = eventSchema.safeParse(input);
    if (!parsed.success) throw new HubError('validation.invalid');
    const event = parsed.data;
    if (event.sourceId !== authenticatedSourceId) throw new HubError('source.mismatch');
    if (Date.parse(event.timestamp) > this.now() + 300_000) throw new HubError('validation.invalid');
    return this.write(async tx => {
      const key = taskKey(event.sourceId, event.taskId, event.runId);
      const ack = (status: EventAck['status'], reason?: string): EventAck => ({ kind: 'event.ack', sourceId: event.sourceId, eventId: event.eventId, status, ...(reason ? { reason } : {}) });
      const reject = async (reason: Diagnostics['lastError']) => { await this.diagnostics(tx, 'rejected', reason); return ack('rejected', reason); };
      const purgedBefore = await this.meta(tx, 'purgedBefore', 0);
      if (await this.meta(tx, 'ingestPaused', false)) return reject('storage.limit');
      if (await tx.objectStore('tombstones').get(key) || Date.parse(event.timestamp) <= purgedBefore) return reject('event.deleted');
      if (await tx.objectStore('events').index('by-source-event').get([event.sourceId, event.eventId])) { await this.diagnostics(tx, 'duplicate'); return ack('duplicate'); }
      const current = await tx.objectStore('tasks').get(key);
      if (!current && event.type !== 'task.started') {
        const pair = await tx.objectStore('tasks').index('by-pair').getAll([event.taskId, event.runId]);
        if (pair.some(other => other.sourceId !== event.sourceId)) return reject('source.cross_reference');
      }
      if (current && (event.sequence <= current.lastSequence || terminal.has(current.execution))) {
        if (event.sequence <= current.lastSequence) { current.uncertainty = true; await tx.objectStore('tasks').put(current); }
        return reject('event.order');
      }
      if (!current && await tx.objectStore('tasks').count() >= LIMITS.tasks) return reject('storage.limit');
      const settings = await this.settings(tx);
      const connections = await this.meta<Record<string, { connection: Connector['connection']; lastSeenAt: string }>>(tx, 'connections', {});
      const clean = cleanEvent(event, settings.retainPrompts);
      const now = this.date();
      const task: TaskRun = current ?? { key, sourceId: event.sourceId, taskId: event.taskId, runId: event.runId, title: clean.payload.title ?? event.taskId, execution: 'running', connection: connections[event.sourceId]?.connection ?? 'disconnected', lastEventAt: event.timestamp, receivedAt: now, createdAt: now, lastSequence: 0, eventCount: 0, gaps: 0, uncertainty: event.type !== 'task.started', verification: { status: 'unverified' }, review: { status: 'pending' }, artifacts: [], provenance: { status: 'agent_reported', metadata: 'agent_reported', connection: 'hub_observed' }, associationHistory: [], verificationChecks: [] };
      const missing = event.sequence - task.lastSequence - 1;
      task.gaps = Math.min(Number.MAX_SAFE_INTEGER, task.gaps + Math.max(0, missing));
      task.uncertainty ||= missing > 0 || Date.parse(event.timestamp) < Date.parse(task.lastEventAt);
      task.lastSequence = event.sequence; task.eventCount++; task.execution = eventExecution[event.type]; task.lastEventAt = event.timestamp; task.receivedAt = now;
      if (event.type === 'task.started' && !task.startedAt) task.startedAt = event.timestamp;
      if (terminal.has(task.execution)) task.endedAt = event.timestamp;
      for (const field of ['title', 'summary', 'question', 'model', 'prompt', 'contextUrl', 'artifacts', 'progress'] as const) {
        if (clean.payload[field] !== undefined) Object.assign(task, { [field]: clean.payload[field] });
      }
      if (event.type !== 'task.waiting') delete task.question;
      if (!settings.retainPrompts) delete task.prompt;
      // An adapter's mission hint can associate only an existing mission, never create or overwrite it.
      if (!current && clean.payload.missionId) {
        const mission = await tx.objectStore('missions').get(clean.payload.missionId);
        if (mission) { task.missionId = mission.id; mission.taskKeys.push(key); await tx.objectStore('missions').put(mission); }
      }
      await tx.objectStore('tasks').put(task);
      await tx.objectStore('events').put({ ...clean, id: `${event.sourceId}:${event.eventId}`, taskKey: key, receivedAt: now });
      const saved = await tx.objectStore('events').index('by-task').getAll(key);
      saved.sort((a, b) => b.sequence - a.sequence);
      for (const old of saved.slice(LIMITS.eventsPerTask)) await tx.objectStore('events').delete(old.id);
      if (await tx.objectStore('events').count() > LIMITS.eventsTotal) { const oldest = await tx.objectStore('events').index('by-received').openCursor(); if (oldest) await oldest.delete(); }
      await this.diagnostics(tx, 'accepted');
      return ack('accepted');
    });
  }
  async snapshot(mode: Snapshot['mode'] = 'extension'): Promise<Snapshot> {
    try {
      const tx = (await this.db).transaction(['tasks', 'missions', 'meta', 'webPreparations']);
      const [tasks, missions, rows, preparations] = await Promise.all([tx.objectStore('tasks').getAll(), tx.objectStore('missions').getAll(), tx.objectStore('meta').getAll(), tx.objectStore('webPreparations').getAll()]);
      const meta = Object.fromEntries(rows.map(row => [row.key, row.value]));
      const settings = storedSettings(meta.settings);
      return { tasks: tasks.map(task => ({ ...task, connection: 'disconnected' as const })).sort((a, b) => b.receivedAt.localeCompare(a.receivedAt)), webPreparations: preparations.map(publicPreparation).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)), missions: missions.sort((a, b) => b.createdAt.localeCompare(a.createdAt)), settings, connectors: CONNECTORS.map(connector => ({ ...structuredClone(connector), connection: 'disconnected', capabilities: { ...connector.capabilities, automaticDiscovery: false, launch: false } })), diagnostics: (meta.diagnostics ?? initialDiagnostics()) as Diagnostics, bridgeStatus: 'disabled', mode };
    } catch { throw new HubError('storage.failed'); }
  }
  async getTaskEvents(key: string, limit = 100): Promise<AgentEvent[]> {
    try { const events = await (await this.db).getAllFromIndex('events', 'by-task', key); return events.sort((a, b) => b.sequence - a.sequence).slice(0, Math.max(1, Math.min(250, Number.isFinite(limit) ? Math.floor(limit) : 100))).reverse().map(unstore); } catch { throw new HubError('storage.failed'); }
  }
  async createMission(title: string): Promise<Mission> {
    const clean = validate(titleSchema, title);
    return this.write(async tx => { if (await tx.objectStore('missions').count() >= LIMITS.missions) throw new HubError('storage.limit'); const mission = { id: crypto.randomUUID(), title: clean, createdAt: this.date(), taskKeys: [] }; await tx.objectStore('missions').put(mission); return mission; });
  }
  async createWebPreparation(input: WebPreparationInput): Promise<WebPreparation> {
    const clean = validate(webPreparationInputSchema, input);
    const createFingerprint = await preparationFingerprint(clean);
    return this.write(async tx => {
      const store = tx.objectStore('webPreparations');
      const existing = await store.get(clean.id);
      if (existing) { if (existing.createFingerprint !== createFingerprint) throw new HubError('validation.invalid'); return publicPreparation(existing); }
      if (await tx.objectStore('tombstones').get(`web:${clean.id}`)) throw new HubError('event.deleted');
      if (await tx.objectStore('tombstones').count() >= LIMITS.deletedRuns) throw new HubError('storage.limit');
      if (await store.count() >= LIMITS.webPreparations) throw new HubError('storage.limit');
      if (clean.missionId && !await tx.objectStore('missions').get(clean.missionId)) throw new HubError('mission.missing');
      const at = this.date();
      const preparation: StoredWebPreparation = { id: clean.id, revision: 1, provider: clean.provider, title: clean.title, status: 'prepared', statusProvenance: 'user_reported', createdAt: at, updatedAt: at, createFingerprint };
      if (clean.notes !== undefined) preparation.notes = clean.notes;
      if (clean.missionId) preparation.missionId = clean.missionId;
      if (clean.retainPrompt === true && clean.prompt !== undefined) preparation.prompt = clean.prompt;
      await store.add(preparation); return publicPreparation(preparation);
    });
  }
  async updateWebPreparation(id: string, patch: WebPreparationPatch): Promise<WebPreparation> {
    validate(z.uuid(), id); const clean = validate(webPreparationPatchSchema, patch);
    return this.write(async tx => {
      const store = tx.objectStore('webPreparations'), preparation = await store.get(id);
      if (!preparation) throw new HubError('task.missing');
      if (preparation.revision !== clean.expectedRevision) throw new HubError('preparation.conflict');
      const revision = nextPreparationRevision(preparation.revision);
      if (clean.missionId && !await tx.objectStore('missions').get(clean.missionId)) throw new HubError('mission.missing');
      for (const field of ['title', 'notes', 'missionId', 'status'] as const) {
        if (clean[field] === null) delete preparation[field];
        else if (clean[field] !== undefined) Object.assign(preparation, { [field]: clean[field] });
      }
      if (clean.retainPrompt === false || Object.hasOwn(clean, 'prompt')) {
        if (clean.retainPrompt === true && typeof clean.prompt === 'string') preparation.prompt = clean.prompt;
        else delete preparation.prompt;
      }
      preparation.revision = revision; preparation.updatedAt = this.date(); await store.put(preparation); return publicPreparation(preparation);
    });
  }
  private async removeWebPreparation(tx: WriteTx, id: string) {
    if (!await tx.objectStore('webPreparations').get(id)) return;
    // Deletion always works. At receipt capacity, new creation is disabled so old requests cannot resurrect data.
    if (await tx.objectStore('tombstones').count() < LIMITS.deletedRuns) await tx.objectStore('tombstones').put({ key: `web:${id}`, deletedAt: this.date() });
    await tx.objectStore('webPreparations').delete(id);
  }
  async deleteWebPreparation(id: string) { validate(z.uuid(), id); return this.write(tx => this.removeWebPreparation(tx, id)); }
  async updateMission(id: string, title: string): Promise<Mission> {
    const clean = validate(titleSchema, title);
    return this.write(async tx => { const mission = await tx.objectStore('missions').get(id); if (!mission) throw new HubError('mission.missing'); mission.title = clean; await tx.objectStore('missions').put(mission); return mission; });
  }
  async assignTask(key: string, missionId?: string) {
    return this.write(async tx => {
      const task = await this.task(tx, key); if (task.missionId === missionId) return;
      const destination = missionId ? await tx.objectStore('missions').get(missionId) : undefined;
      if (missionId && !destination) throw new HubError('mission.missing');
      if (task.missionId) { const old = await tx.objectStore('missions').get(task.missionId); if (old) { old.taskKeys = old.taskKeys.filter(id => id !== key); await tx.objectStore('missions').put(old); } }
      task.associationHistory.push({ from: task.missionId, to: missionId, at: this.date() }); task.associationHistory = task.associationHistory.slice(-100); task.missionId = missionId;
      if (destination) { destination.taskKeys = [...new Set([...destination.taskKeys, key])]; await tx.objectStore('missions').put(destination); }
      await tx.objectStore('tasks').put(task);
    });
  }
  async reviewTask(key: string, status: TaskRun['review']['status'], comment?: string) {
    validate(z.enum(['pending', 'accepted', 'rejected']), status); if (comment !== undefined) validate(z.string().max(4000), comment);
    return this.write(async tx => { const task = await this.task(tx, key); task.review = { status, comment, at: this.date() }; await tx.objectStore('tasks').put(task); });
  }
  async recordVerification(key: string, evidence: HashEvidence) {
    const check = makeVerificationCheck(evidence, this.date());
    return this.write(async tx => { const task = await this.task(tx, key); task.verificationChecks = [...(task.verificationChecks ?? []), check].slice(-20); await tx.objectStore('tasks').put(task); return check; });
  }
  async updateSettings(patch: Partial<Settings>): Promise<Settings> {
    const valid = validate(settingSchema, patch);
    const result = await this.write(async tx => {
      const settings: Settings = { ...await this.settings(tx), ...valid, bridgeEnabled: false };
      if (valid.retainPrompts === false) {
        let taskCursor = await tx.objectStore('tasks').openCursor();
        while (taskCursor) { const task = taskCursor.value; if ('prompt' in task) { delete task.prompt; await taskCursor.update(task); } taskCursor = await taskCursor.continue(); }
        let eventCursor = await tx.objectStore('events').openCursor();
        while (eventCursor) { const event = eventCursor.value; if ('prompt' in event.payload) { delete event.payload.prompt; await eventCursor.update(event); } eventCursor = await eventCursor.continue(); }
        let webCursor = await tx.objectStore('webPreparations').openCursor();
        while (webCursor) { const preparation = webCursor.value; preparation.revision = nextPreparationRevision(preparation.revision); delete preparation.prompt; await webCursor.update(preparation); webCursor = await webCursor.continue(); }
      }
      await this.setMeta(tx, 'settings', settings); return settings;
    });
    await this.cleanup(); return result;
  }
  private async removeTask(tx: WriteTx, key: string) {
    const task = await tx.objectStore('tasks').get(key); if (!task) return;
    if (await tx.objectStore('tombstones').count() >= LIMITS.deletedRuns && !await tx.objectStore('tombstones').get(key)) await this.setMeta(tx, 'ingestPaused', true);
    else await tx.objectStore('tombstones').put({ key, deletedAt: this.date() });
    await tx.objectStore('tasks').delete(key);
    for (const event of await tx.objectStore('events').index('by-task').getAll(key)) await tx.objectStore('events').delete(event.id);
    if (task.missionId) { const mission = await tx.objectStore('missions').get(task.missionId); if (mission) { mission.taskKeys = mission.taskKeys.filter(id => id !== key); await tx.objectStore('missions').put(mission); } }
  }
  async deleteTask(key: string) { return this.write(tx => this.removeTask(tx, key)); }
  async deleteMission(id: string, deleteTasks = false) {
    return this.write(async tx => {
      const mission = await tx.objectStore('missions').get(id); if (!mission) throw new HubError('mission.missing');
      for (const key of mission.taskKeys) { if (deleteTasks) await this.removeTask(tx, key); else { const task = await tx.objectStore('tasks').get(key); if (task) { task.associationHistory.push({ from: id, at: this.date() }); task.associationHistory = task.associationHistory.slice(-100); delete task.missionId; await tx.objectStore('tasks').put(task); } } }
      for (const preparation of await tx.objectStore('webPreparations').index('by-mission').getAll(id)) {
        if (deleteTasks) await this.removeWebPreparation(tx, preparation.id);
        else { preparation.revision = nextPreparationRevision(preparation.revision); delete preparation.missionId; preparation.updatedAt = this.date(); await tx.objectStore('webPreparations').put(preparation); }
      }
      await tx.objectStore('missions').delete(id);
    });
  }
  async purgeAll() {
    return this.write(async tx => {
      for (const task of await tx.objectStore('tasks').getAll()) await this.removeTask(tx, task.key);
      for (const preparation of await tx.objectStore('webPreparations').getAll()) await this.removeWebPreparation(tx, preparation.id);
      await tx.objectStore('missions').clear(); await tx.objectStore('events').clear();
      await this.setMeta(tx, 'purgedBefore', this.now()); await this.setMeta(tx, 'diagnostics', initialDiagnostics());
    });
  }
  async exportData(): Promise<ExportData> {
    // Single read transaction gives a consistent portable snapshot during ingestion.
    try {
      const tx = (await this.db).transaction(['tasks', 'missions', 'events', 'meta', 'webPreparations']);
      const [tasks, missions, events, settingsRow, preparations] = await Promise.all([tx.objectStore('tasks').getAll(), tx.objectStore('missions').getAll(), tx.objectStore('events').getAll(), tx.objectStore('meta').get('settings'), tx.objectStore('webPreparations').getAll()]);
      const settings = storedSettings(settingsRow?.value);
      return { schemaVersion: 2, exportedAt: this.date(), settings, missions, webPreparations: preparations.map(publicPreparation), tasks: tasks.map(task => { const copy = structuredClone(task); delete copy.tabBinding; if (!settings.retainPrompts) delete copy.prompt; return copy; }), events: events.map(event => cleanEvent(unstore(event), settings.retainPrompts)) };
    } catch { throw new HubError('storage.failed'); }
  }
  async cleanup() {
    return this.write(async tx => { const settings = await this.settings(tx); const before = new Date(this.now() - settings.retentionDays * 86400_000).toISOString(); for (const key of await tx.objectStore('tasks').index('by-received').getAllKeys(IDBKeyRange.upperBound(before, true))) await this.removeTask(tx, key); for (const id of await tx.objectStore('webPreparations').index('by-updated').getAllKeys(IDBKeyRange.upperBound(before, true))) await this.removeWebPreparation(tx, id); });
  }
  async setConnection(sourceId: SourceId, connection: 'online' | 'disconnected') {
    return this.write(async tx => { const connections = await this.meta<Record<string, { connection: Connector['connection']; lastSeenAt: string }>>(tx, 'connections', {}); const changed = connections[sourceId]?.connection !== connection; connections[sourceId] = { connection, lastSeenAt: this.date() }; await this.setMeta(tx, 'connections', connections); if (changed) for (const task of await tx.objectStore('tasks').index('by-source').getAll(sourceId)) if (task.connection !== connection) { task.connection = connection; await tx.objectStore('tasks').put(task); } });
  }
  async expireConnections() {
    return this.write(async tx => { const connections = await this.meta<Record<string, { connection: Connector['connection']; lastSeenAt: string }>>(tx, 'connections', {}); for (const [source, value] of Object.entries(connections)) { if (value.connection === 'online' && this.now() - Date.parse(value.lastSeenAt) > LIMITS.staleMs) { value.connection = 'stale'; for (const task of await tx.objectStore('tasks').index('by-source').getAll(source as SourceId)) if (task.connection !== 'stale') { task.connection = 'stale'; task.uncertainty ||= !terminal.has(task.execution); await tx.objectStore('tasks').put(task); } } } await this.setMeta(tx, 'connections', connections); });
  }
  async setBridgeStatus(status: BridgeStatus) { return this.write(tx => this.setMeta(tx, 'bridgeStatus', status)); }
  async bindTab(key: string, binding: TabBinding) { return this.write(async tx => { const task = await this.task(tx, key); task.tabBinding = binding; await tx.objectStore('tasks').put(task); }); }
  async getTask(key: string): Promise<TaskRun> { try { const task = await (await this.db).get('tasks', key); if (!task) throw new HubError('task.missing'); return task; } catch (error) { throw error instanceof HubError ? error : new HubError('storage.failed'); } }
}
