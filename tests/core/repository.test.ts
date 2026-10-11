import 'fake-indexeddb/auto';
import { openDB } from 'idb';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { HubRepository, LIMITS } from '../../src/domain/repository';
import { eventSchema, taskKey } from '../../src/shared/protocol';
import type { AgentEvent, SourceId } from '../../src/shared/types';
import { hashFile, MAX_VERIFICATION_BYTES } from '../../src/domain/verification';
import { DEFAULT_SETTINGS } from '../../src/shared/defaults';
import { rpcSchema } from '../../src/shared/rpc';

const now = Date.parse('2026-10-09T00:00:00.000Z');
const repos: HubRepository[] = [];
function repo(name = crypto.randomUUID(), clock = () => now) { const value = new HubRepository(name, clock); repos.push(value); return value; }
function event(overrides: Partial<AgentEvent> = {}): AgentEvent { return { schemaVersion: 1, eventId: crypto.randomUUID(), sourceId: 'claude-code', taskId: 'task-1', runId: 'run-1', sequence: 1, timestamp: new Date(now).toISOString(), type: 'task.started', payload: { title: 'Real task' }, ...overrides }; }
const key = taskKey('claude-code', 'task-1', 'run-1');
afterEach(async () => { vi.restoreAllMocks(); await Promise.all(repos.splice(0).map(repo => repo.close())); });

describe('source identity and strict contract', () => {
  it('rejects source spoof before writing', async () => { const db = repo(); await expect(db.ingest('codex', event())).rejects.toMatchObject({ code: 'source.mismatch' }); expect((await db.snapshot()).tasks).toHaveLength(0); });
  it('rejects cross-source references, but explicit starts have independent namespaces', async () => {
    const db = repo(); await db.ingest('codex', event({ sourceId: 'codex' }));
    expect(await db.ingest('claude-code', event({ type: 'task.completed', sequence: 2 }))).toMatchObject({ status: 'rejected', reason: 'source.cross_reference' });
    await db.ingest('claude-code', event()); const snapshot = await db.snapshot(); expect(snapshot.tasks).toHaveLength(2); expect(snapshot.tasks.map(t => t.sourceId).sort()).toEqual(['claude-code','codex']);
  });
  it.each(['javascript:alert(1)', 'file:///c:/secret.txt', 'data:text/html,hello', 'https://user:pass@example.com'])('rejects unsafe URL %s', url => { expect(eventSchema.safeParse(event({ payload: { contextUrl: url } })).success).toBe(false); });
  it('rejects extra controls, fake verification and unknown fields', () => { expect(eventSchema.safeParse({ ...event(), verified: true }).success).toBe(false); expect(eventSchema.safeParse(event({ payload: { progress: { current: 2,total: 1,unit: 'steps' } } })).success).toBe(false); expect(eventSchema.safeParse({ ...event(), type: 'task.paused' }).success).toBe(false); });
});

describe('durable task state', () => {
  it('deduplicates concurrent deliveries and survives repository hydration', async () => { const name=crypto.randomUUID(); const db=repo(name); const first=event(); const results=await Promise.all([db.ingest('claude-code',first),db.ingest('claude-code',first)]); expect(results.map(r=>r.status).sort()).toEqual(['accepted','duplicate']); const restarted=repo(name); expect((await restarted.getTask(key)).eventCount).toBe(1); });
  it('keeps waiting states across offline/stale without failure inference', async () => { let clock=now; const db=repo(undefined,()=>clock); await db.setConnection('claude-code','online'); await db.ingest('claude-code',event({ type:'task.waiting',payload:{question:'Approve in agent?'} })); clock+=LIMITS.staleMs+1; await db.expireConnections(); expect(await db.getTask(key)).toMatchObject({execution:'waiting_input',connection:'stale',uncertainty:true}); await db.setConnection('claude-code','disconnected'); expect((await db.getTask(key)).execution).toBe('waiting_input'); });
  it('replayed events never claim a disconnected source is live', async () => { const db=repo(); await db.ingest('claude-code',event()); expect((await db.getTask(key)).connection).toBe('disconnected'); await db.setConnection('claude-code','online'); await db.setConnection('claude-code','disconnected'); await db.ingest('claude-code',event({type:'task.completed',sequence:2})); expect((await db.getTask(key)).connection).toBe('disconnected'); expect((await db.snapshot()).connectors[0].connection).toBe('disconnected'); });
  it('unchanged online heartbeats do not read or rewrite every source task',async()=>{const db=repo();await db.setConnection('claude-code','online');await db.ingest('claude-code',event());const reads=vi.spyOn(IDBIndex.prototype,'getAll');const writes=vi.spyOn(IDBObjectStore.prototype,'put');await db.setConnection('claude-code','online');expect(reads).not.toHaveBeenCalled();expect(writes.mock.contexts.every(store=>(store as IDBObjectStore).name==='meta')).toBe(true);});
  it('marks backwards source time uncertain and preserves hub receipt provenance',async()=>{const db=repo();await db.ingest('claude-code',event());await db.ingest('claude-code',event({sequence:2,type:'task.completed',timestamp:new Date(now-60000).toISOString()}));expect(await db.getTask(key)).toMatchObject({uncertainty:true,lastEventAt:new Date(now-60000).toISOString(),receivedAt:new Date(now).toISOString()});});
  it('marks gaps and out-of-order input without state rollback', async () => { const db=repo(); await db.ingest('claude-code',event()); await db.ingest('claude-code',event({type:'task.waiting',sequence:4,payload:{question:'Question'}})); expect(await db.ingest('claude-code',event({type:'task.progress',sequence:2}))).toMatchObject({status:'rejected',reason:'event.order'}); expect(await db.getTask(key)).toMatchObject({execution:'waiting_input',gaps:2,lastSequence:4,uncertainty:true}); });
  it('never conflates completed, verification and human acceptance', async () => { const db=repo(); await db.ingest('claude-code',event()); await db.ingest('claude-code',event({type:'task.completed',sequence:2})); await db.reviewTask(key,'accepted','Checked manually'); expect(await db.getTask(key)).toMatchObject({execution:'completed',verification:{status:'unverified'},review:{status:'accepted'}}); expect(await db.ingest('claude-code',event({type:'task.progress',sequence:3}))).toMatchObject({status:'rejected'}); });
  it('clears resolved question only on source update', async () => { const db=repo(); await db.ingest('claude-code',event({type:'task.waiting',payload:{question:'Need input'}})); await db.reviewTask(key,'accepted'); expect((await db.getTask(key)).question).toBe('Need input'); await db.ingest('claude-code',event({type:'task.progress',sequence:2})); expect((await db.getTask(key)).question).toBeUndefined(); });
  it('caps history and rejects replay after dedup history was pruned', async () => { const db=repo(); const first=event(); await db.ingest('claude-code',first); for(let i=2;i<=LIMITS.eventsPerTask+5;i++) await db.ingest('claude-code',event({sequence:i,type:'task.progress'})); expect(await db.getTaskEvents(key,10000)).toHaveLength(LIMITS.eventsPerTask); expect(await db.ingest('claude-code',first)).toMatchObject({status:'rejected',reason:'event.order'}); expect((await db.getTask(key)).eventCount).toBe(255); });
  it('rolls back both state and event when an IDB write fails', async () => {
    const db=repo(); await db.snapshot(); const original=IDBObjectStore.prototype.put;
    vi.spyOn(IDBObjectStore.prototype,'put').mockImplementation(function(this:IDBObjectStore,...args:Parameters<typeof original>){ if(this.name==='events') throw new DOMException('Quota exceeded','QuotaExceededError'); return original.apply(this,args); });
    await expect(db.ingest('claude-code',event())).rejects.toMatchObject({code:'storage.failed'}); vi.restoreAllMocks(); expect((await db.snapshot()).tasks).toHaveLength(0); expect(await db.getTaskEvents(key)).toHaveLength(0);
  });
});

describe('privacy, missions and deletion', () => {
  it('drops prompts before persistence and redacts export', async()=>{const db=repo();await db.ingest('claude-code',event({payload:{prompt:'SECRET',summary:'result'}}));expect(JSON.stringify(await db.exportData())).not.toContain('SECRET');expect((await db.getTaskEvents(key))[0].payload.prompt).toBeUndefined();});
  it('revoking prompt consent scrubs receipts and event history atomically',async()=>{const db=repo();await db.updateSettings({retainPrompts:true});await db.ingest('claude-code',event({payload:{prompt:'SECRET'}}));expect((await db.getTask(key)).prompt).toBe('SECRET');await db.updateSettings({retainPrompts:false});expect(JSON.stringify(await db.exportData())).not.toContain('SECRET');});
  it('preserves provenance and correction history during mission move',async()=>{const db=repo();await db.ingest('claude-code',event());const a=await db.createMission('One'),b=await db.createMission('Two');await db.assignTask(key,a.id);await db.assignTask(key,b.id);const snapshot=await db.snapshot();expect(snapshot.missions.find(m=>m.id===a.id)?.taskKeys).toEqual([]);expect(snapshot.missions.find(m=>m.id===b.id)?.taskKeys).toEqual([key]);expect((await db.getTask(key)).associationHistory).toHaveLength(2);expect((await db.getTask(key)).sourceId).toBe('claude-code');});
  it('delete mission can unassign or explicitly delete associated runs',async()=>{const db=repo();await db.ingest('claude-code',event());const a=await db.createMission('One');await db.assignTask(key,a.id);await db.deleteMission(a.id);expect((await db.getTask(key)).missionId).toBeUndefined();const b=await db.createMission('Two');await db.assignTask(key,b.id);await db.deleteMission(b.id,true);expect((await db.snapshot()).tasks).toHaveLength(0);});
  it('deleting task blocks same run with a new event ID and higher sequence',async()=>{const db=repo();await db.ingest('claude-code',event());await db.deleteTask(key);expect(await db.ingest('claude-code',event({sequence:2,type:'task.completed'}))).toMatchObject({status:'rejected',reason:'event.deleted'});expect((await db.snapshot()).tasks).toHaveLength(0);expect(await db.getTaskEvents(key)).toEqual([]);});
  it('purge blocks old unseen replay and allows genuinely new tasks',async()=>{let clock=now;const db=repo(undefined,()=>clock);await db.ingest('claude-code',event());await db.createMission('Delete me');await db.purgeAll();expect(await db.ingest('claude-code',event({taskId:'old-unknown'}))).toMatchObject({status:'rejected',reason:'event.deleted'});clock+=1000;expect(await db.ingest('claude-code',event({taskId:'new',timestamp:new Date(clock).toISOString()}))).toMatchObject({status:'accepted'});expect((await db.snapshot()).missions).toEqual([]);});
  it('retention removes events, checks and mission search references',async()=>{let clock=now;const db=repo(undefined,()=>clock);await db.ingest('claude-code',event());const mission=await db.createMission('Mission');await db.assignTask(key,mission.id);clock+=31*86400_000;await db.cleanup();expect((await db.snapshot()).tasks).toEqual([]);expect((await db.snapshot()).missions[0].taskKeys).toEqual([]);expect(await db.getTaskEvents(key)).toEqual([]);});
  it('rejects invalid preferences and unsupported notifications',async()=>{const db=repo();await expect(db.updateSettings({retentionDays:0})).rejects.toMatchObject({code:'validation.invalid'});await expect(db.updateSettings({notifications:true})).rejects.toMatchObject({code:'validation.invalid'});});
});

describe('local artifact verification',()=>{
  const reference='ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad';
  it('checks the SHA256 known vector without retaining file content or global success',async()=>{const db=repo();await db.ingest('claude-code',event());const evidence=await hashFile(new File(['abc'],'result.txt'),reference);expect(evidence.actualSha256).toBe(reference);const check=await db.recordVerification(key,evidence);expect(check.passed).toBe(true);expect((await db.getTask(key)).verification.status).toBe('unverified');expect((await db.exportData()).tasks[0].verificationChecks[0]).toMatchObject({method:'sha256',referenceProvenance:'user_supplied',byteSize:3});});
  it('records mismatches explicitly and keeps human review independent',async()=>{const db=repo();await db.ingest('claude-code',event());const evidence=await hashFile(new File(['abcd'],'result.txt'),reference);expect((await db.recordVerification(key,evidence)).passed).toBe(false);expect((await db.getTask(key)).review.status).toBe('pending');});
  it('rejects oversized file before reading bytes and malformed reference',async()=>{const file={size:MAX_VERIFICATION_BYTES+1,arrayBuffer:vi.fn()} as unknown as File;await expect(hashFile(file,reference)).rejects.toMatchObject({code:'validation.invalid'});expect(file.arrayBuffer).not.toHaveBeenCalled();await expect(hashFile(new File(['abc'],'x'),'xyz')).rejects.toMatchObject({code:'validation.invalid'});});
});

describe('automatic seen preference', () => {
  // Exactly what 0.4.0 stored: every preference except the one added later.
  const legacy = { language: 'en', theme: 'dark', retentionDays: 7, retainPrompts: true, notifications: false, bridgeEnabled: true };
  const store = async (name: string, value: unknown) => { const raw = await openDB(name); await raw.put('meta', { key: 'settings', value }); raw.close(); };
  const stored = async (name: string) => { const raw = await openDB(name); const row = await raw.get('meta', 'settings'); raw.close(); return row?.value; };
  it('is off by default in a fresh profile, its snapshot and its export', async () => {
    const db = repo();
    expect(DEFAULT_SETTINGS.autoAcknowledgeSeconds).toBe(0);
    expect((await db.snapshot()).settings).toEqual(DEFAULT_SETTINGS); expect((await db.exportData()).settings.autoAcknowledgeSeconds).toBe(0);
  });
  it('merges settings stored by an older version over the defaults on every read, without a migration', async () => {
    const name = crypto.randomUUID(), db = repo(name); await db.snapshot(); await store(name, legacy);
    const expected = { ...legacy, bridgeEnabled: false, autoAcknowledgeSeconds: 0, notifyProviders: [] };
    expect((await db.snapshot()).settings).toEqual(expected);
    expect((await db.exportData())).toMatchObject({ schemaVersion: 2, settings: expected });
    // Retention and prompt reads keep working on the old record.
    await db.cleanup(); await db.ingest('claude-code', event({ payload: { prompt: 'KEPT' } })); expect((await db.getTask(key)).prompt).toBe('KEPT');
    expect(await stored(name)).toEqual(legacy);
    // The next write completes the stored record; nothing else changes.
    expect(await db.updateSettings({ theme: 'light' })).toEqual({ ...expected, theme: 'light' });
    expect(await stored(name)).toEqual({ ...expected, theme: 'light' });
    // An unexpected stored value is read as off, and replaced on the next write.
    for (const value of [10, -1, '5', null, 5.5]) {
      await store(name, { ...legacy, autoAcknowledgeSeconds: value });
      expect((await db.snapshot()).settings.autoAcknowledgeSeconds, JSON.stringify(value)).toBe(0); expect((await db.exportData()).settings.autoAcknowledgeSeconds).toBe(0);
    }
    expect((await db.updateSettings({ language: 'fr' })).autoAcknowledgeSeconds).toBe(0); expect(await stored(name)).toMatchObject({ autoAcknowledgeSeconds: 0 });
  });
  it('accepts only 0, 5, 15 or 30 seconds, keeps the choice across restarts and carries it in the export', async () => {
    const name = crypto.randomUUID(), db = repo(name);
    for (const seconds of [5, 15, 30, 0, 15] as const) expect((await db.updateSettings({ autoAcknowledgeSeconds: seconds })).autoAcknowledgeSeconds).toBe(seconds);
    for (const invalid of [10, -1, 1, 60, 5.5, '5', '15', null, true, NaN, Infinity]) {
      await expect(db.updateSettings({ autoAcknowledgeSeconds: invalid as never }), JSON.stringify(invalid)).rejects.toMatchObject({ code: 'validation.invalid' });
      expect(rpcSchema.safeParse({ method: 'updateSettings', patch: { autoAcknowledgeSeconds: invalid } }).success, JSON.stringify(invalid)).toBe(false);
    }
    for (const seconds of [0, 5, 15, 30]) expect(rpcSchema.safeParse({ method: 'updateSettings', patch: { autoAcknowledgeSeconds: seconds } }).success).toBe(true);
    expect(rpcSchema.safeParse({ method: 'updateSettings', patch: { autoAcknowledgeSeconds: 5, autoAcknowledge: true } }).success).toBe(false);
    const restarted = repo(name);
    expect((await restarted.snapshot()).settings.autoAcknowledgeSeconds).toBe(15); expect((await restarted.exportData()).settings.autoAcknowledgeSeconds).toBe(15);
    // Purge keeps preferences, this one included.
    await restarted.purgeAll(); expect((await restarted.snapshot()).settings.autoAcknowledgeSeconds).toBe(15);
  });
});

describe('optional OS notification services preference', () => {
  const legacy = { language: 'en', theme: 'dark', retentionDays: 7, retainPrompts: true, notifications: false, bridgeEnabled: true, autoAcknowledgeSeconds: 15 };
  const store = async (name: string, value: unknown) => { const raw = await openDB(name); await raw.put('meta', { key: 'settings', value }); raw.close(); };
  const stored = async (name: string) => { const raw = await openDB(name); const row = await raw.get('meta', 'settings'); raw.close(); return row?.value; };
  it('is empty by default, and settings stored before it existed read as empty without a migration', async () => {
    expect(DEFAULT_SETTINGS.notifyProviders).toEqual([]);
    const fresh = repo(); expect((await fresh.snapshot()).settings.notifyProviders).toEqual([]); expect((await fresh.exportData()).settings.notifyProviders).toEqual([]);
    const name = crypto.randomUUID(), db = repo(name); await db.snapshot(); await store(name, legacy);
    expect((await db.snapshot()).settings).toEqual({ ...legacy, bridgeEnabled: false, notifyProviders: [] }); expect(await stored(name)).toEqual(legacy);
    // Unexpected stored values read as empty and are replaced on the next write; the legacy notifications flag is untouched.
    for (const value of [['claude-web', 'claude-web'], ['other-web'], 'claude-web', null, 1, [true]]) {
      await store(name, { ...legacy, notifyProviders: value });
      expect((await db.snapshot()).settings.notifyProviders, JSON.stringify(value)).toEqual([]); expect((await db.exportData()).settings.notifyProviders).toEqual([]);
    }
    expect(await db.updateSettings({ theme: 'light' })).toMatchObject({ notifyProviders: [], notifications: false, autoAcknowledgeSeconds: 15 }); expect(await stored(name)).toMatchObject({ notifyProviders: [] });
    // The shared default is never mutated through a returned settings object.
    (await db.snapshot()).settings.notifyProviders.push('claude-web'); expect(DEFAULT_SETTINGS.notifyProviders).toEqual([]);
  });
  it('accepts only a list of distinct services, keeps it across restarts and purge, and carries it in the export', async () => {
    const name = crypto.randomUUID(), db = repo(name);
    for (const value of [['claude-web'], ['chatgpt-web', 'claude-web'], [], ['chatgpt-web']] as const) expect((await db.updateSettings({ notifyProviders: [...value] })).notifyProviders).toEqual(value);
    for (const invalid of [['claude-web', 'claude-web'], ['claude-web', 'chatgpt-web', 'chatgpt-web'], ['claude-code'], ['codex'], ['CLAUDE-WEB'], 'claude-web', null, true, 1, [1], [null], { 0: 'claude-web' }]) {
      await expect(db.updateSettings({ notifyProviders: invalid as never }), JSON.stringify(invalid)).rejects.toMatchObject({ code: 'validation.invalid' });
      expect(rpcSchema.safeParse({ method: 'updateSettings', patch: { notifyProviders: invalid } }).success, JSON.stringify(invalid)).toBe(false);
    }
    expect(rpcSchema.safeParse({ method: 'updateSettings', patch: { notifyProviders: ['claude-web'], notifyAll: true } }).success).toBe(false);
    // The legacy native-agent flag stays refused: the new setting does not reopen it.
    await expect(db.updateSettings({ notifications: true })).rejects.toMatchObject({ code: 'validation.invalid' });
    const restarted = repo(name);
    expect((await restarted.snapshot()).settings.notifyProviders).toEqual(['chatgpt-web']); expect((await restarted.exportData()).settings.notifyProviders).toEqual(['chatgpt-web']);
    await restarted.purgeAll(); expect((await restarted.snapshot()).settings.notifyProviders).toEqual(['chatgpt-web']);
  });
});
