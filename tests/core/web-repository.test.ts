import 'fake-indexeddb/auto';
import { openDB } from 'idb';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { HubRepository, LIMITS } from '../../src/domain/repository';
import { DEFAULT_SETTINGS } from '../../src/shared/defaults';
import type { WebPreparationInput } from '../../src/shared/web';

const start = Date.parse('2026-10-09T00:00:00Z');
const repos: HubRepository[] = [];
function repository(name = crypto.randomUUID(), clock = () => start) { const repo = new HubRepository(name, clock); repos.push(repo); return repo; }
function input(patch: Partial<WebPreparationInput> = {}): WebPreparationInput { return { id: crypto.randomUUID(), provider: 'claude-web', title: 'Prepare research', ...patch }; }
afterEach(async () => { vi.restoreAllMocks(); await Promise.all(repos.splice(0).map(repo => repo.close())); });

describe('web preparation storage and migration', () => {
  it('upgrades v2 in place preserving all legacy stores, indexes and history', async () => {
    const name = crypto.randomUUID();
    const old = await openDB(name, 2, { upgrade(db) {
      const tasks = db.createObjectStore('tasks', { keyPath: 'key' }); tasks.createIndex('by-pair', ['taskId', 'runId']); tasks.createIndex('by-source', 'sourceId'); tasks.createIndex('by-received', 'receivedAt');
      db.createObjectStore('missions', { keyPath: 'id' });
      const events = db.createObjectStore('events', { keyPath: 'id' }); events.createIndex('by-task', 'taskKey'); events.createIndex('by-source-event', ['sourceId', 'eventId'], { unique: true }); events.createIndex('by-received', 'receivedAt');
      db.createObjectStore('tombstones', { keyPath: 'key' }); db.createObjectStore('meta', { keyPath: 'key' });
    } });
    const mission = { id: crypto.randomUUID(), title: 'Legacy mission', createdAt: new Date(start).toISOString(), taskKeys: ['codex:t:r'] };
    const task = { key: 'codex:t:r', sourceId: 'codex', taskId: 't', runId: 'r', title: 'Legacy task', receivedAt: new Date(start).toISOString(), connection: 'online', prompt: 'Legacy retained', review: { status: 'accepted' }, verificationChecks: [{ id: 'legacy-check' }] };
    const event = { id: 'codex:e', taskKey: task.key, receivedAt: task.receivedAt, eventId: 'e', sourceId: 'codex', sequence: 1, payload: { summary: 'Legacy result' } };
    await old.put('tasks', task); await old.put('missions', mission); await old.put('events', event); await old.put('tombstones', { key: 'codex:deleted:r', deletedAt: task.receivedAt }); await old.put('meta', { key: 'settings', value: { ...DEFAULT_SETTINGS, retainPrompts: true, bridgeEnabled: true } }); old.close();
    const repo = repository(name); const snapshot = await repo.snapshot();
    expect(snapshot.webPreparations).toEqual([]); expect(snapshot.missions).toEqual([mission]); expect(snapshot.tasks[0]).toMatchObject({ title: 'Legacy task', review: task.review, verificationChecks: task.verificationChecks, connection: 'disconnected' });
    expect(snapshot.settings).toMatchObject({ retainPrompts: true, bridgeEnabled: false }); expect(snapshot.bridgeStatus).toBe('disabled'); expect(snapshot.connectors.every(item => item.connection === 'disconnected' && !item.capabilities.launch)).toBe(true);
    expect((await repo.getTaskEvents(task.key))[0].payload.summary).toBe('Legacy result');
    const raw = await openDB(name); expect(raw.version).toBe(4); expect(await raw.get('tasks', task.key)).toEqual(task); expect(await raw.get('tombstones', 'codex:deleted:r')).toBeTruthy(); raw.close();
    expect((await repo.exportData()).schemaVersion).toBe(2); await repo.createWebPreparation(input());
  });
  it('atomically deduplicates concurrent saves from multiple pages and survives restart', async () => {
    const name = crypto.randomUUID(), first = repository(name), second = repository(name), request = input({ prompt: 'Transient private prompt' });
    const [a, b] = await Promise.all([first.createWebPreparation(request), second.createWebPreparation({ ...request })]); expect(a).toEqual(b);
    expect((await repository(name).snapshot()).webPreparations).toEqual([a]); expect(a.prompt).toBeUndefined();
    await expect(second.createWebPreparation({ ...request, prompt: 'Changed request' })).rejects.toMatchObject({ code: 'validation.invalid' });
    await expect(second.createWebPreparation({ ...request, title: 'Changed title' })).rejects.toMatchObject({ code: 'validation.invalid' });
    const raw = await openDB(name); const stored = await raw.get('webPreparations', a.id); expect(JSON.stringify(stored)).not.toContain('Transient private prompt'); expect(stored.createFingerprint).toMatch(/^[a-f0-9]{64}$/); raw.close();
    expect(JSON.stringify(await first.exportData())).not.toContain('createFingerprint');
  });
  it('requires per-write consent and preserves an existing consented prompt for unrelated edits', async () => {
    const repo = repository(); await repo.updateSettings({ retainPrompts: true });
    const noConsent = await repo.createWebPreparation(input({ prompt: 'NEVER-SAVE' })); expect(noConsent.prompt).toBeUndefined();
    const request = input({ prompt: 'SAVED', retainPrompt: true }); const saved = await repo.createWebPreparation(request); expect(saved.prompt).toBe('SAVED');
    expect((await repo.updateWebPreparation(saved.id, { expectedRevision: 1, status: 'sent_by_user', notes: 'Manual update' })).prompt).toBe('SAVED');
    expect((await repo.updateWebPreparation(saved.id, { expectedRevision: 2, prompt: 'REPLACEMENT WITHOUT CONSENT' })).prompt).toBeUndefined();
    expect((await repo.updateWebPreparation(saved.id, { expectedRevision: 3, prompt: 'RESAVED', retainPrompt: true })).prompt).toBe('RESAVED');
    expect((await repo.updateWebPreparation(saved.id, { expectedRevision: 4, retainPrompt: false })).prompt).toBeUndefined();
    expect((await repo.createWebPreparation(request)).prompt).toBeUndefined();
    expect(JSON.stringify(await repo.exportData())).not.toContain('NEVER-SAVE');
  });
  it('scrubs web prompts when settings false is explicit even when already false; retries cannot restore them', async () => {
    const repo = repository(), request = input({ prompt: 'ERASE-ME', retainPrompt: true });
    const saved = await repo.createWebPreparation(request); expect((await repo.snapshot()).settings.retainPrompts).toBe(false);
    await repo.updateSettings({ language: 'en' }); expect((await repo.snapshot()).webPreparations?.[0].prompt).toBe('ERASE-ME');
    await repo.updateSettings({ retainPrompts: false }); expect((await repo.createWebPreparation(request)).prompt).toBeUndefined();
    expect((await repo.updateWebPreparation(saved.id, { expectedRevision: 2, retainPrompt: true })).prompt).toBeUndefined();
    expect(JSON.stringify(await repo.exportData())).not.toContain('ERASE-ME');
  });
  it('keeps user-reported lifecycle separate from legacy events and validates all bounded fields', async () => {
    let clock = start; const repo = repository(undefined, () => clock), request = input({ title: '  Title  ', notes: 'Note' });
    const saved = await repo.createWebPreparation(request); expect(saved).toMatchObject({ title: 'Title', status: 'prepared', statusProvenance: 'user_reported' });
    clock += 1000; expect(await repo.updateWebPreparation(saved.id, { expectedRevision: 1, status: 'sent_by_user' })).toMatchObject({ status: 'sent_by_user', updatedAt: new Date(clock).toISOString(), createdAt: saved.createdAt });
    expect((await repo.updateWebPreparation(saved.id, { expectedRevision: 2, status: 'completed_by_user', notes: null })).notes).toBeUndefined();
    expect((await repo.updateWebPreparation(saved.id, { expectedRevision: 3, status: 'prepared' })).status).toBe('prepared');
    expect((await repo.exportData()).events).toEqual([]); expect((await repo.snapshot()).tasks).toEqual([]);
    for (const patch of [{ title: 'x'.repeat(161) }, { prompt: 'x'.repeat(10001) }, { notes: 'x'.repeat(16001) }, { status: 'running' }, { provider: 'codex' }, { statusProvenance: 'agent_reported' }]) await expect(repo.updateWebPreparation(saved.id, { expectedRevision: 4, ...patch } as never)).rejects.toMatchObject({ code: 'validation.invalid' });
    await expect(repo.createWebPreparation(input({ missionId: crypto.randomUUID() }))).rejects.toMatchObject({ code: 'mission.missing' });
    await expect(repo.updateWebPreparation(saved.id, { expectedRevision: 4, missionId: crypto.randomUUID() })).rejects.toMatchObject({ code: 'mission.missing' });
    await expect(repo.updateWebPreparation(crypto.randomUUID(), { expectedRevision: 1 })).rejects.toMatchObject({ code: 'task.missing' });
  });
  it('unassigns or deletes mission preparations atomically and blocks delayed create replay', async () => {
    const repo = repository(), first = await repo.createMission('First'), second = await repo.createMission('Second');
    const request = input({ missionId: first.id }); const saved = await repo.createWebPreparation(request);
    expect((await repo.snapshot()).missions[0].taskKeys).toEqual([]);
    await repo.deleteMission(first.id); expect((await repo.snapshot()).webPreparations?.[0].missionId).toBeUndefined();
    await repo.updateWebPreparation(saved.id, { expectedRevision: 2, missionId: second.id }); await repo.deleteMission(second.id, true);
    expect((await repo.snapshot()).webPreparations).toEqual([]); await expect(repo.createWebPreparation(request)).rejects.toMatchObject({ code: 'event.deleted' });
  });
  it('clears records and private fingerprints on delete, purge and retention and rejects delayed retries', async () => {
    let clock = start; const name = crypto.randomUUID(), repo = repository(name, () => clock);
    const deleted = input({ prompt: 'DELETED', retainPrompt: true }); await repo.createWebPreparation(deleted); await repo.deleteWebPreparation(deleted.id); await repo.deleteWebPreparation(deleted.id);
    const purged = input({ prompt: 'PURGED', retainPrompt: true }); await repo.createWebPreparation(purged); await repo.purgeAll();
    const expired = input({ prompt: 'EXPIRED', retainPrompt: true }); await repo.createWebPreparation(expired); clock += 31 * 86400000; await repo.cleanup();
    for (const request of [deleted, purged, expired]) await expect(repo.createWebPreparation(request)).rejects.toMatchObject({ code: 'event.deleted' });
    expect((await repo.snapshot()).webPreparations).toEqual([]); const raw = await openDB(name); expect(await raw.getAll('webPreparations')).toEqual([]); expect(JSON.stringify(await raw.getAll('tombstones'))).not.toMatch(/DELETED|PURGED|EXPIRED|createFingerprint/); raw.close();
  });
  it('enforces 250 preparations while allowing a retry at capacity', async () => {
    const repo = repository(), request = input(); await repo.createWebPreparation(request);
    for (let index = 1; index < LIMITS.webPreparations; index++) await repo.createWebPreparation(input());
    await expect(repo.createWebPreparation(input())).rejects.toMatchObject({ code: 'storage.limit' }); expect((await repo.createWebPreparation(request)).id).toBe(request.id);
  });
  it('rolls back a preparation mutation on failed persistence without damaging the old record', async () => {
    const repo = repository(), request = input({ notes: 'Original' }); await repo.createWebPreparation(request);
    const original = IDBObjectStore.prototype.put;
    vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementation(function(this: IDBObjectStore, ...args: Parameters<typeof original>) { if (this.name === 'webPreparations') throw new DOMException('Quota', 'QuotaExceededError'); return original.apply(this, args); });
    await expect(repo.updateWebPreparation(request.id, { expectedRevision: 1, notes: 'Changed' })).rejects.toMatchObject({ code: 'storage.failed' }); vi.restoreAllMocks(); expect((await repo.snapshot()).webPreparations?.[0]).toMatchObject({ notes: 'Original', revision: 1 });
  });
  it('keeps deletion and purge available when deletion receipts are full, without allowing resurrection', async () => {
    const name = crypto.randomUUID(), repo = repository(name), request = input({ prompt: 'DELETE-AT-CAPACITY', retainPrompt: true });
    await repo.createWebPreparation(request); const raw = await openDB(name); const tx = raw.transaction('tombstones', 'readwrite');
    for (let index = 0; index < LIMITS.deletedRuns; index++) void tx.store.put({ key: `old:${index}`, deletedAt: new Date(start).toISOString() });
    await tx.done; raw.close(); await repo.purgeAll(); expect((await repo.snapshot()).webPreparations).toEqual([]);
    await expect(repo.createWebPreparation(request)).rejects.toMatchObject({ code: 'storage.limit' });
    expect(JSON.stringify(await repo.exportData())).not.toContain('DELETE-AT-CAPACITY');
  });
  it('rolls back mission deletion and prompt erasure together if any preparation write fails', async () => {
    const repo = repository(), mission = await repo.createMission('Keep on failure'), preparation = await repo.createWebPreparation(input({ missionId: mission.id, prompt: 'CONSENTED', retainPrompt: true }));
    const original = IDBObjectStore.prototype.put;
    vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementation(function(this: IDBObjectStore, ...args: Parameters<typeof original>) { if (this.name === 'webPreparations') throw new DOMException('Quota', 'QuotaExceededError'); return original.apply(this, args); });
    await expect(repo.deleteMission(mission.id)).rejects.toMatchObject({ code: 'storage.failed' }); vi.restoreAllMocks();
    expect((await repo.snapshot()).missions).toHaveLength(1); expect((await repo.snapshot()).webPreparations?.[0]).toMatchObject({ id: preparation.id, missionId: mission.id, prompt: 'CONSENTED' });
    const update = IDBCursor.prototype.update; vi.spyOn(IDBCursor.prototype, 'update').mockImplementation(function(this: IDBCursor, ...args: Parameters<typeof update>) { throw new DOMException('Quota', 'QuotaExceededError'); });
    await expect(repo.updateSettings({ retainPrompts: false, language: 'en' })).rejects.toMatchObject({ code: 'storage.failed' }); vi.restoreAllMocks();
    const snapshot = await repo.snapshot(); expect(snapshot.settings.language).toBe('fr'); expect(snapshot.webPreparations?.[0].prompt).toBe('CONSENTED');
  });
});
