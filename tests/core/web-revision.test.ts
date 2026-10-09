import 'fake-indexeddb/auto';
import { openDB } from 'idb';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { HubRepository } from '../../src/domain/repository';
import { rpcSchema } from '../../src/shared/rpc';
import type { WebPreparationInput } from '../../src/shared/web';

const at = '2026-10-09T00:00:00.000Z';
const repos: HubRepository[] = [];
function repository(name = crypto.randomUUID()) { const repo = new HubRepository(name, () => Date.parse(at)); repos.push(repo); return repo; }
function input(patch: Partial<WebPreparationInput> = {}): WebPreparationInput { return { id: crypto.randomUUID(), provider: 'claude-web', title: 'Research', prompt: 'PRIVATE', retainPrompt: true, ...patch }; }
afterEach(async () => { vi.restoreAllMocks(); await Promise.all(repos.splice(0).map(repo => repo.close())); });
async function seedV3(name: string, count = 1) {
  const db = await openDB(name, 3, { upgrade(db) {
    const tasks = db.createObjectStore('tasks', { keyPath: 'key' }); tasks.createIndex('by-pair', ['taskId', 'runId']); tasks.createIndex('by-source', 'sourceId'); tasks.createIndex('by-received', 'receivedAt');
    db.createObjectStore('missions', { keyPath: 'id' });
    const events = db.createObjectStore('events', { keyPath: 'id' }); events.createIndex('by-task', 'taskKey'); events.createIndex('by-source-event', ['sourceId', 'eventId'], { unique: true }); events.createIndex('by-received', 'receivedAt');
    db.createObjectStore('tombstones', { keyPath: 'key' }); db.createObjectStore('meta', { keyPath: 'key' });
    const web = db.createObjectStore('webPreparations', { keyPath: 'id' }); web.createIndex('by-updated', 'updatedAt'); web.createIndex('by-mission', 'missionId');
  } });
  const rows = Array.from({ length: count }, () => ({ id: crypto.randomUUID(), provider: 'claude-web', title: 'Existing v3', prompt: 'RETAINED', notes: 'Preserve', status: 'sent_by_user', statusProvenance: 'user_reported', createdAt: at, updatedAt: at, createFingerprint: 'original-private-digest' }));
  for (const row of rows) await db.put('webPreparations', row); db.close(); return rows;
}

describe('web preparation optimistic revisions', () => {
  it('rejects the stale editor after global prompt erasure even with identical timestamps', async () => {
    const repo = repository(), request = input(), saved = await repo.createWebPreparation(request);
    const stale = { expectedRevision: saved.revision, title: 'Stale edit', prompt: saved.prompt, retainPrompt: true };
    await repo.updateSettings({ retainPrompts: false }); const scrubbed = (await repo.snapshot()).webPreparations![0];
    expect(scrubbed).toMatchObject({ revision: 2, updatedAt: saved.updatedAt, title: saved.title }); expect(scrubbed.prompt).toBeUndefined();
    await expect(repo.updateWebPreparation(saved.id, stale)).rejects.toMatchObject({ code: 'preparation.conflict' });
    expect((await repo.snapshot()).webPreparations![0]).toEqual(scrubbed);
    expect(await repo.createWebPreparation(request)).toEqual(scrubbed);
  });
  it.each(['global', 'record'] as const)('rejects the exact lost-response retry after %s prompt erasure', async erasure => {
    const repo = repository(), saved = await repo.createWebPreparation(input());
    const lostResponse = { expectedRevision: saved.revision, prompt: 'NEW PRIVATE', retainPrompt: true };
    const written = await repo.updateWebPreparation(saved.id, lostResponse); expect(written.revision).toBe(2);
    if (erasure === 'global') await repo.updateSettings({ retainPrompts: false });
    else await repo.updateWebPreparation(saved.id, { expectedRevision: written.revision, retainPrompt: false });
    await expect(repo.updateWebPreparation(saved.id, lostResponse)).rejects.toMatchObject({ code: 'preparation.conflict' });
    await repo.updateSettings({ retainPrompts: false });
    await expect(repo.updateWebPreparation(saved.id, lostResponse)).rejects.toMatchObject({ code: 'preparation.conflict' });
    const exported = await repo.exportData(); expect(exported.webPreparations![0]).toMatchObject({ revision: 4 }); expect(JSON.stringify(exported)).not.toContain('PRIVATE');
  });
  it('serializes competing edits from different pages with exactly one winner', async () => {
    const name = crypto.randomUUID(), first = repository(name), second = repository(name), saved = await first.createWebPreparation(input());
    const results = await Promise.allSettled([first.updateWebPreparation(saved.id, { expectedRevision: 1, title: 'First' }), second.updateWebPreparation(saved.id, { expectedRevision: 1, title: 'Second' })]);
    expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1);
    expect(results.find(result => result.status === 'rejected')).toMatchObject({ reason: { code: 'preparation.conflict' } });
    const winner = (await first.snapshot()).webPreparations![0]; expect(winner.revision).toBe(2); expect(['First', 'Second']).toContain(winner.title); expect(winner.prompt).toBe('PRIVATE'); expect(winner.updatedAt).toBe(saved.updatedAt);
    expect((await first.updateWebPreparation(saved.id, { expectedRevision: winner.revision, status: 'sent_by_user' })).prompt).toBe('PRIVATE');
  });
  it.each([false, true])('global erasure defeats an overlapping stale write, erase dispatched first=%s', async eraseFirst => {
    const repo = repository(), saved = await repo.createWebPreparation(input());
    const erase = () => repo.updateSettings({ retainPrompts: false });
    const save = () => repo.updateWebPreparation(saved.id, { expectedRevision: saved.revision, prompt: 'STALE PRIVATE', retainPrompt: true });
    await Promise.allSettled(eraseFirst ? [erase(), save()] : [save(), erase()]); expect((await repo.snapshot()).webPreparations![0].prompt).toBeUndefined();
  });
  it('advances every record on explicit privacy scrub even if none stores a prompt or the setting was already false', async () => {
    const repo = repository(), saved = await repo.createWebPreparation(input({ retainPrompt: false }));
    await repo.updateSettings({ retainPrompts: false }); await repo.updateSettings({ retainPrompts: false });
    const current = (await repo.snapshot()).webPreparations![0]; expect(current.revision).toBe(3);
    await expect(repo.updateWebPreparation(saved.id, { expectedRevision: saved.revision, prompt: 'PENDING PRIVATE', retainPrompt: true })).rejects.toMatchObject({ code: 'preparation.conflict' });
  });
  it('increments mission reassociation and detach, preserving privacy conflict detection', async () => {
    const repo = repository(), first = await repo.createMission('First'), second = await repo.createMission('Second'), saved = await repo.createWebPreparation(input({ missionId: first.id }));
    const moved = await repo.updateWebPreparation(saved.id, { expectedRevision: 1, missionId: second.id }); expect(moved.revision).toBe(2);
    await repo.deleteMission(second.id); const detached = (await repo.snapshot()).webPreparations![0]; expect(detached.revision).toBe(3); expect(detached.missionId).toBeUndefined();
    await expect(repo.updateWebPreparation(saved.id, { expectedRevision: moved.revision, missionId: first.id })).rejects.toMatchObject({ code: 'preparation.conflict' });
    const final = await repo.updateWebPreparation(saved.id, { expectedRevision: detached.revision, missionId: first.id }); expect(final.revision).toBe(4);
    await repo.deleteMission(first.id, true); await expect(repo.updateWebPreparation(saved.id, { expectedRevision: final.revision, prompt: 'RESTORE', retainPrompt: true })).rejects.toMatchObject({ code: 'task.missing' });
  });
  it.each([undefined, null, 0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1, Infinity, '1'])('rejects invalid or missing expected revision %s at both RPC and repository boundaries', async expectedRevision => {
    const repo = repository(), saved = await repo.createWebPreparation(input()), patch = { expectedRevision, status: 'sent_by_user' };
    expect(rpcSchema.safeParse({ method: 'updateWebPreparation', id: saved.id, patch }).success).toBe(false);
    await expect(repo.updateWebPreparation(saved.id, patch as never)).rejects.toMatchObject({ code: 'validation.invalid' }); expect((await repo.snapshot()).webPreparations![0].revision).toBe(1);
  });
  it('backfills v3 preparations atomically with revision 1 while preserving all existing fields', async () => {
    const name = crypto.randomUUID(), rows = await seedV3(name, 2), repo = repository(name), snapshot = await repo.snapshot();
    expect(snapshot.webPreparations).toHaveLength(2);
    for (const row of rows) { const { createFingerprint: _private, ...publicRow } = row; expect(snapshot.webPreparations!.find(record => record.id === row.id)).toEqual({ ...publicRow, revision: 1 }); }
    const raw = await openDB(name); expect(raw.version).toBe(4); for (const row of rows) expect(await raw.get('webPreparations', row.id)).toEqual({ ...row, revision: 1 }); raw.close();
    const changed = await repo.updateWebPreparation(rows[0].id, { expectedRevision: 1, notes: 'Updated' }); expect(changed.revision).toBe(2);
    const exported = await repo.exportData(); expect(exported.webPreparations!.find(row => row.id === changed.id)?.revision).toBe(2); expect(JSON.stringify(exported)).not.toMatch(/createFingerprint|original-private-digest/);
  });
  it('aborts a failed v3 migration without partially backfilling records', async () => {
    const name = crypto.randomUUID(), rows = await seedV3(name, 2), original = IDBCursor.prototype.update; let writes = 0;
    vi.spyOn(IDBCursor.prototype, 'update').mockImplementation(function(this: IDBCursor, ...args: Parameters<typeof original>) { if (++writes === 2) throw new DOMException('Quota', 'QuotaExceededError'); return original.apply(this, args); });
    const failed = new HubRepository(name); await expect(failed.snapshot()).rejects.toMatchObject({ code: 'storage.failed' }); await failed.close().catch(() => undefined); vi.restoreAllMocks();
    const old = await openDB(name); expect(old.version).toBe(3); for (const row of rows) expect(await old.get('webPreparations', row.id)).toEqual(row); old.close();
    expect((await repository(name).snapshot()).webPreparations!.every(record => record.revision === 1)).toBe(true);
  });
  it('never wraps revision counters and keeps explicit deletion available at the safe integer limit', async () => {
    const name = crypto.randomUUID(), repo = repository(name), saved = await repo.createWebPreparation(input()), raw = await openDB(name);
    const record = await raw.get('webPreparations', saved.id); await raw.put('webPreparations', { ...record, revision: Number.MAX_SAFE_INTEGER }); raw.close();
    await expect(repo.updateWebPreparation(saved.id, { expectedRevision: Number.MAX_SAFE_INTEGER, prompt: 'Changed', retainPrompt: true })).rejects.toMatchObject({ code: 'storage.limit' });
    expect((await repo.snapshot()).webPreparations![0]).toMatchObject({ revision: Number.MAX_SAFE_INTEGER, prompt: 'PRIVATE' }); await repo.deleteWebPreparation(saved.id); expect((await repo.snapshot()).webPreparations).toEqual([]);
  });
});
