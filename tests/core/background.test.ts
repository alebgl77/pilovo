import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { openDB } from 'idb';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ApiResult } from '../../src/shared/types';
import { WEB_ORIGINS } from '../../src/shared/web';

function signal() { const listeners: ((...args: any[]) => any)[] = []; return { addListener: vi.fn((listener: (...args: any[]) => any) => listeners.push(listener)), removeListener: vi.fn(), emit: (...args: any[]) => listeners.forEach(listener => listener(...args)), listeners }; }
let api: any;
const sender = { id: 'test-extension', url: 'chrome-extension://test-extension/sidepanel.html', frameId: 0 };
async function rpc(request: unknown): Promise<ApiResult<any> & { data?: any }> { return new Promise(resolve => api.runtime.onMessage.listeners[0]({ channel: 'hub.rpc', request }, sender, resolve)); }
const request = () => ({ id: crypto.randomUUID(), provider: 'claude-web', title: 'Web preparation' });
beforeEach(async () => {
  vi.resetModules(); vi.stubGlobal('indexedDB', new IDBFactory());
  api = {
    runtime: { id: 'test-extension', getURL: (path: string) => `chrome-extension://test-extension/${path}`, sendMessage: vi.fn().mockResolvedValue(undefined), connectNative: vi.fn(), onMessage: signal(), onInstalled: signal() },
    permissions: { contains: vi.fn().mockResolvedValue(true), request: vi.fn(), onRemoved: signal(), onAdded: signal() },
    tabs: { query: vi.fn().mockResolvedValue([{ id: 4, windowId: 1, url: 'https://claude.ai/chat/private', title: 'Private title' }]), get: vi.fn(), create: vi.fn().mockResolvedValue({ id: 5 }), update: vi.fn(), onCreated: signal(), onUpdated: signal(), onRemoved: signal(), onAttached: signal(), onDetached: signal(), onReplaced: signal() },
    windows: { update: vi.fn() }, alarms: { create: vi.fn().mockResolvedValue(undefined), onAlarm: signal() }, sidePanel: { setPanelBehavior: vi.fn().mockResolvedValue(undefined), open: vi.fn().mockResolvedValue(undefined) }, action: { onClicked: signal() },
  };
  vi.stubGlobal('chrome', api);
  const { HubRepository } = await import('../../src/domain/repository'); const seed = new HubRepository(); await seed.snapshot(); await seed.close();
  const raw = await openDB('agent-control-hub-v1'); await raw.put('meta', { key: 'settings', value: { language: 'fr', theme: 'system', retentionDays: 30, retainPrompts: false, notifications: false, bridgeEnabled: true } }); raw.close();
  await import('../../src/background/index'); expect((await rpc({ method: 'getSnapshot' })).ok).toBe(true);
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

describe('standalone service worker trust boundary', () => {
  it('accepts only own top-level UI pages and rejects malformed RPCs', async () => {
    const reply = vi.fn(), listener = api.runtime.onMessage.listeners[0], message = { channel: 'hub.rpc', request: { method: 'purgeAll' } };
    for (const untrusted of [{ ...sender, id: 'other' }, { ...sender, url: 'https://example.com/' }, { ...sender, url: 'chrome-extension://test-extension/arbitrary.html' }, { ...sender, frameId: 2 }, { ...sender, url: sender.url + '/evil' }]) expect(listener(message, untrusted, reply)).toBe(false);
    expect(reply).not.toHaveBeenCalled();
    for (const invalid of [{ method: 'pauseTask' }, { method: 'requestWebDiscoveryPermission' }, { method: 'openWebProvider', provider: 'claude-web', url: 'https://evil.test' }, { method: 'createWebPreparation', input: { ...request(), status: 'completed_by_user' } }, { method: 'updateWebPreparation', id: crypto.randomUUID(), patch: { sourceId: 'codex' } }]) expect(await rpc(invalid)).toMatchObject({ ok: false, error: { code: 'validation.invalid' } });
  });
  it('never starts native transport even with old persisted settings or legacy RPC', async () => {
    expect((await rpc({ method: 'getSnapshot' })).data).toMatchObject({ settings: { bridgeEnabled: false }, bridgeStatus: 'disabled', webPreparations: [] });
    expect(await rpc({ method: 'connectBridge' })).toMatchObject({ ok: false, error: { code: 'bridge.unavailable' } });
    expect(await rpc({ method: 'controlAgent', request: { kind: 'inventory.request', requestId: crypto.randomUUID() } })).toMatchObject({ ok: false, error: { code: 'bridge.unavailable' } });
    expect((await rpc({ method: 'updateSettings', patch: { bridgeEnabled: true } })).data.bridgeEnabled).toBe(false);
    expect(api.runtime.connectNative).not.toHaveBeenCalled(); expect(api.permissions.request).not.toHaveBeenCalled(); expect(api.permissions.contains).not.toHaveBeenCalled();
  });
  it('supports durable web CRUD through the actual worker RPC and never forges an AgentEvent', async () => {
    const input = request(), first = await rpc({ method: 'createWebPreparation', input }); expect(first.ok).toBe(true);
    expect(await rpc({ method: 'createWebPreparation', input })).toEqual(first);
    expect((await rpc({ method: 'updateWebPreparation', id: input.id, patch: { expectedRevision: 1, status: 'sent_by_user' } })).data).toMatchObject({ status: 'sent_by_user', statusProvenance: 'user_reported', revision: 2 });
    api.tabs.onUpdated.emit(4, { status: 'complete' }, { id: 4, url: 'https://claude.ai/' });
    const exported = (await rpc({ method: 'exportData' })).data; expect(exported).toMatchObject({ schemaVersion: 2, tasks: [], events: [] }); expect(exported.webPreparations[0].status).toBe('sent_by_user');
    await rpc({ method: 'deleteWebPreparation', id: input.id }); expect((await rpc({ method: 'getSnapshot' })).data.webPreparations).toEqual([]);
  });
  it('survives worker module restart without retaining or relying on discovered tab IDs', async () => {
    const input = request(); await rpc({ method: 'createWebPreparation', input }); await rpc({ method: 'getWebDiscovery' });
    vi.resetModules(); api.runtime.onMessage = signal(); await import('../../src/background/index');
    expect((await rpc({ method: 'getSnapshot' })).data.webPreparations).toHaveLength(1);
    api.tabs.get.mockRejectedValue(new Error('Closed after restart')); expect(await rpc({ method: 'openWebProvider', provider: 'claude-web', tabId: 4 })).toMatchObject({ ok: false, error: { code: 'navigation.closed' } }); expect(api.tabs.create).not.toHaveBeenCalled(); expect(api.runtime.connectNative).not.toHaveBeenCalled();
  });
  it('rejects stale revisions through worker RPC after prompt erasure without restoring content', async () => {
    const input = { ...request(), prompt: 'PRIVATE', retainPrompt: true }, created = await rpc({ method: 'createWebPreparation', input });
    expect(created.data.revision).toBe(1);
    expect(await rpc({ method: 'updateWebPreparation', id: input.id, patch: { prompt: 'PRIVATE', retainPrompt: true } })).toMatchObject({ ok: false, error: { code: 'validation.invalid' } });
    await rpc({ method: 'updateSettings', patch: { retainPrompts: false } });
    expect(await rpc({ method: 'updateWebPreparation', id: input.id, patch: { expectedRevision: 1, prompt: 'PRIVATE', retainPrompt: true } })).toMatchObject({ ok: false, error: { code: 'preparation.conflict' } });
    const exported = (await rpc({ method: 'exportData' })).data; expect(exported.webPreparations[0].revision).toBe(2); expect(JSON.stringify(exported)).not.toContain('PRIVATE');
  });
  it('returns only permitted IDs and drops discovery after host revocation', async () => {
    const response = await rpc({ method: 'getWebDiscovery' }); expect(response.data.providers[0].tabs).toEqual([{ tabId: 4, windowId: 1 }]); expect(JSON.stringify(response)).not.toMatch(/private|Private title/); expect(api.tabs.query).toHaveBeenCalledWith({ url: WEB_ORIGINS });
    api.permissions.contains.mockResolvedValue(false); api.permissions.onRemoved.emit({ origins: WEB_ORIGINS });
    expect((await rpc({ method: 'getWebDiscovery' })).data.permission).toBe('not-granted'); expect((await rpc({ method: 'getSnapshot' })).ok).toBe(true); expect((await rpc({ method: 'exportData' })).ok).toBe(true);
  });
  it('invalidates an in-flight query after revoke/regrant through real event listeners', async () => {
    let release!: (value: unknown[]) => void; api.tabs.query.mockImplementation(() => new Promise(resolve => { release = resolve; }));
    const pending = rpc({ method: 'getWebDiscovery' }); await vi.waitFor(() => expect(api.tabs.query).toHaveBeenCalled());
    api.permissions.onRemoved.emit({ origins: WEB_ORIGINS }); api.permissions.onAdded.emit({ origins: WEB_ORIGINS }); release([{ id: 4, windowId: 1, url: 'https://claude.ai/private' }]);
    expect((await pending).data.providers.every((provider: any) => provider.tabs.length === 0)).toBe(true);
  });
  it('coalesces tab and permission changes into a data-free notification', async () => {
    vi.useFakeTimers(); api.runtime.sendMessage.mockClear(); api.tabs.onUpdated.emit(4, {}, { title: 'Do not expose', url: 'https://unrelated.test' }); api.tabs.onCreated.emit({}); api.permissions.onAdded.emit({ origins: WEB_ORIGINS });
    await vi.advanceTimersByTimeAsync(250); expect(api.runtime.sendMessage).toHaveBeenCalledOnce(); expect(api.runtime.sendMessage).toHaveBeenCalledWith({ channel: 'hub.changed' });
  });
  it('permits fixed provider opening after denial and refuses removed generic tab capability', async () => {
    api.permissions.contains.mockResolvedValue(false); expect((await rpc({ method: 'openWebProvider', provider: 'chatgpt-web' })).ok).toBe(true); expect(api.tabs.create).toHaveBeenCalledWith({ url: 'https://chatgpt.com/', active: true });
    expect(await rpc({ method: 'attachActiveTab', key: 'codex:t:r' })).toMatchObject({ ok: false, error: { code: 'permission.denied' } }); expect(api.permissions.request).not.toHaveBeenCalled();
  });
});
