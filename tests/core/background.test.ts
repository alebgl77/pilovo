import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { openDB } from 'idb';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ApiResult } from '../../src/shared/types';
import { WEB_ORIGINS } from '../../src/shared/web';
import { rpcSchema } from '../../src/shared/rpc';

function signal() { const listeners: ((...args: any[]) => any)[] = []; return { addListener: vi.fn((listener: (...args: any[]) => any) => listeners.push(listener)), removeListener: vi.fn(), emit: (...args: any[]) => listeners.forEach(listener => listener(...args)), listeners }; }
let api: any;
const sender = { id: 'test-extension', url: 'chrome-extension://test-extension/sidepanel.html', frameId: 0 };
async function rpc(request: unknown): Promise<ApiResult<any> & { data?: any }> { return new Promise(resolve => api.runtime.onMessage.listeners[0]({ channel: 'hub.rpc', request }, sender, resolve)); }
const request = () => ({ id: crypto.randomUUID(), provider: 'claude-web', title: 'Web preparation' });
beforeEach(async () => {
  vi.resetModules(); vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] }); vi.stubGlobal('indexedDB', new IDBFactory());
  api = {
    runtime: { id: 'test-extension', getURL: (path: string) => `chrome-extension://test-extension/${path}`, sendMessage: vi.fn().mockResolvedValue(undefined), connectNative: vi.fn(), onMessage: signal(), onInstalled: signal() },
    permissions: { contains: vi.fn().mockResolvedValue(true), request: vi.fn(), onRemoved: signal(), onAdded: signal() },
    tabs: { query: vi.fn().mockResolvedValue([{ id: 4, windowId: 1, url: 'https://claude.ai/chat/private', title: 'Private title' }]), get: vi.fn(), create: vi.fn().mockResolvedValue({ id: 5 }), update: vi.fn(), onCreated: signal(), onUpdated: signal(), onRemoved: signal(), onMoved: signal(), onAttached: signal(), onDetached: signal(), onReplaced: signal() },
    scripting: { registerContentScripts: vi.fn().mockResolvedValue(undefined), unregisterContentScripts: vi.fn().mockResolvedValue(undefined), executeScript: vi.fn().mockResolvedValue([]) },
    windows: { update: vi.fn(), getLastFocused: vi.fn().mockResolvedValue({ id: 3 }), onFocusChanged: signal() }, commands: { onCommand: signal(), getAll: vi.fn() }, alarms: { create: vi.fn().mockResolvedValue(undefined), onAlarm: signal() }, sidePanel: { setPanelBehavior: vi.fn().mockResolvedValue(undefined), open: vi.fn().mockResolvedValue(undefined) }, action: { onClicked: signal(), setBadgeText: vi.fn().mockResolvedValue(undefined), setBadgeBackgroundColor: vi.fn().mockResolvedValue(undefined), setBadgeTextColor: vi.fn().mockResolvedValue(undefined), setTitle: vi.fn().mockResolvedValue(undefined) },
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
    expect(api.runtime.connectNative).not.toHaveBeenCalled(); expect(api.permissions.request).not.toHaveBeenCalled(); expect(api.permissions.contains.mock.calls.every(([query]: any[]) => query.origins.every((origin: string) => WEB_ORIGINS.includes(origin as never)))).toBe(true);
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
    const pending = rpc({ method: 'getWebDiscovery' }); await vi.waitFor(() => expect(release).toBeTypeOf('function'));
    api.permissions.onRemoved.emit({ origins: WEB_ORIGINS }); api.permissions.onAdded.emit({ origins: WEB_ORIGINS }); release([{ id: 4, windowId: 1, url: 'https://claude.ai/private' }]);
    expect((await pending).data.providers.every((provider: any) => provider.tabs.length === 0)).toBe(true);
  });
  it('coalesces tab and permission changes into a data-free notification', async () => {
    api.runtime.sendMessage.mockClear(); api.tabs.onUpdated.emit(4, {}, { title: 'Do not expose', url: 'https://unrelated.test' }); api.tabs.onCreated.emit({}); api.permissions.onAdded.emit({ origins: WEB_ORIGINS });
    await vi.advanceTimersByTimeAsync(250); expect(api.runtime.sendMessage).toHaveBeenCalledOnce(); expect(api.runtime.sendMessage).toHaveBeenCalledWith({ channel: 'hub.changed' });
  });
  it('accepts mark all only as a strict, bounded RPC and notifies after it', async () => {
    for (const invalid of [{ method: 'acknowledgeAllWebActivity', all: true }, { method: 'acknowledgeAllWebActivity', attentionIds: [] }, { method: 'acknowledgeAllWebActivity', attentionIds: ['PRIVATE_CANARY'] }, { method: 'acknowledgeAllWebActivity', attentionIds: crypto.randomUUID() }, { method: 'acknowledgeAllWebActivity', attentionIds: Array.from({ length: 257 }, () => crypto.randomUUID()) }]) {
      expect(rpcSchema.safeParse(invalid).success).toBe(false); expect(await rpc(invalid)).toMatchObject({ ok: false, error: { code: 'validation.invalid' } });
    }
    api.runtime.sendMessage.mockClear();
    expect(await rpc({ method: 'acknowledgeAllWebActivity' })).toEqual({ ok: true, data: 0 });
    expect(await rpc({ method: 'acknowledgeAllWebActivity', attentionIds: [crypto.randomUUID()] })).toEqual({ ok: true, data: 0 });
    await vi.advanceTimersByTimeAsync(250); expect(api.runtime.sendMessage).toHaveBeenCalledWith({ channel: 'hub.changed' });
  });
  it('opens the side panel inside the command gesture when nothing needs attention; other commands never open or focus', async () => {
    const [listener] = api.commands.onCommand.listeners;
    listener('focus-next-attention', { id: 4, windowId: 7 }); expect(api.sidePanel.open).toHaveBeenCalledExactlyOnceWith({ windowId: 7 });
    api.sidePanel.open.mockImplementationOnce(() => { throw new Error('gesture required'); });
    expect(() => listener('focus-next-attention', { id: 4, windowId: 7 })).not.toThrow();
    // Without a command tab, the last focused browser window, known before the gesture: seeded at startup, then tracked.
    listener('focus-next-attention'); expect(api.sidePanel.open).toHaveBeenLastCalledWith({ windowId: 3 });
    api.windows.onFocusChanged.emit(6); api.windows.onFocusChanged.emit(-1);
    const synchronous = api.sidePanel.open.mock.calls.length;
    listener('focus-next-attention'); expect(api.sidePanel.open).toHaveBeenCalledTimes(synchronous + 1); expect(api.sidePanel.open).toHaveBeenLastCalledWith({ windowId: 6 });
    expect(api.windows.getLastFocused).toHaveBeenCalledOnce();
    const opened = api.sidePanel.open.mock.calls.length;
    listener('acknowledge-all-attention', { id: 4, windowId: 7 }); listener('unknown-command', { id: 4, windowId: 7 }); await vi.advanceTimersByTimeAsync(250);
    expect(api.sidePanel.open).toHaveBeenCalledTimes(opened); expect(api.tabs.update).not.toHaveBeenCalled(); expect(api.windows.update).not.toHaveBeenCalled();
  });
  it('focuses the next attention and marks all as seen through the registered keyboard commands', async () => {
    const activationId = crypto.randomUUID(), tab = { id: 4, windowId: 1, url: 'https://claude.ai/chat/private', status: 'complete' };
    api.tabs.get.mockResolvedValue(tab);
    api.scripting.executeScript.mockImplementation(async (injection: any) => injection.args?.[0]?.requestId ? [{ frameId: 0, documentId: 'document-4', result: { version: 1, requestId: injection.args[0].requestId, activationId, evidence: 'input_required' } }] : []);
    api.tabs.onUpdated.emit(4, { status: 'complete' }, tab); await vi.advanceTimersByTimeAsync(1100);
    const [observation] = (await rpc({ method: 'getWebActivity' })).data.observations;
    expect(observation).toMatchObject({ state: 'attention', attention: { reason: 'input_required', acknowledged: false } }); expect(observation.attention.raisedAt).toBeTypeOf('number');
    expect(api.action.setBadgeText).toHaveBeenLastCalledWith({ text: '1' });
    const [listener] = api.commands.onCommand.listeners;
    listener('focus-next-attention', { id: 9, windowId: 5 }); await vi.advanceTimersByTimeAsync(1100);
    await vi.waitFor(() => expect(api.windows.update).toHaveBeenCalledWith(1, { focused: true }));
    expect(api.tabs.update).toHaveBeenCalledExactlyOnceWith(4, { active: true }); expect(api.sidePanel.open).not.toHaveBeenCalled();
    listener('acknowledge-all-attention', { id: 4, windowId: 1 }); await vi.advanceTimersByTimeAsync(0);
    expect((await rpc({ method: 'getWebActivity' })).data.observations[0].attention).toEqual({ ...observation.attention, acknowledged: true });
    expect(api.action.setBadgeText).toHaveBeenLastCalledWith({ text: '' });
  });
  it('paints a differentiated badge and a title in the app language, sending only the parts that changed', async () => {
    // The first paint of the worker clears whatever a previous worker life left; a hidden badge needs no color.
    expect(api.action.setBadgeText).toHaveBeenCalledExactlyOnceWith({ text: '' }); expect(api.action.setTitle).toHaveBeenCalledExactlyOnceWith({ title: 'Pilovo' });
    expect(api.action.setBadgeBackgroundColor).not.toHaveBeenCalled(); expect(api.action.setBadgeTextColor).not.toHaveBeenCalled();
    const tab = { id: 4, windowId: 1, url: 'https://claude.ai/chat/private', status: 'complete' }, activationId = crypto.randomUUID();
    let evidence = 'working';
    api.tabs.get.mockResolvedValue(tab);
    api.scripting.executeScript.mockImplementation(async (injection: any) => injection.args?.[0]?.requestId ? [{ frameId: 0, documentId: 'document-4', result: { version: 1, requestId: injection.args[0].requestId, activationId, evidence } }] : []);
    const names = ['setBadgeText', 'setBadgeBackgroundColor', 'setBadgeTextColor', 'setTitle'], painted: unknown[] = [];
    const action = () => Object.fromEntries(names.map(name => [name, api.action[name].mock.calls.map(([details]: any[]) => Object.values(details)[0])]));
    const sample = async (value: string) => { evidence = value; api.tabs.onUpdated.emit(4, { status: 'complete' }, tab); await vi.advanceTimersByTimeAsync(1100); };
    // Every call is kept for the final privacy check before the mocks are cleared.
    const clear = () => { painted.push(action()); for (const name of names) api.action[name].mockClear(); };
    clear(); await sample('working');
    expect(action()).toEqual({ setBadgeText: ['…'], setBadgeBackgroundColor: ['#5E5E5C'], setBadgeTextColor: ['#FFFFFF'], setTitle: ['Pilovo — 1 en cours'] });
    clear(); await sample('working'); expect(Object.values(action()).flat()).toEqual([]);
    clear(); await sample('input_required');
    expect(action()).toEqual({ setBadgeText: ['1'], setBadgeBackgroundColor: ['#8A4B08'], setBadgeTextColor: [], setTitle: ['Pilovo — 1 à vérifier (intervention demandée)'] });
    // Language follows the app's settings through the updateSettings RPC: only the title changes.
    clear(); expect((await rpc({ method: 'updateSettings', patch: { language: 'en' } })).data.language).toBe('en');
    expect(action()).toEqual({ setBadgeText: [], setBadgeBackgroundColor: [], setBadgeTextColor: [], setTitle: ['Pilovo — 1 to review (input request)'] });
    clear(); await rpc({ method: 'updateSettings', patch: { theme: 'dark' } }); await rpc({ method: 'updateSettings', patch: { language: 'en' } }); expect(Object.values(action()).flat()).toEqual([]);
    // Concurrent writes: the title ends in the language of the last committed call.
    await Promise.all([rpc({ method: 'updateSettings', patch: { language: 'fr' } }), rpc({ method: 'updateSettings', patch: { language: 'en' } })]);
    expect(api.action.setTitle).toHaveBeenLastCalledWith({ title: 'Pilovo — 1 to review (input request)' }); expect((await rpc({ method: 'getSnapshot' })).data.settings.language).toBe('en');
    clear();
    expect(await rpc({ method: 'updateSettings', patch: { language: 'de' } })).toMatchObject({ ok: false, error: { code: 'validation.invalid' } }); expect(Object.values(action()).flat()).toEqual([]);
    const [observation] = (await rpc({ method: 'getWebActivity' })).data.observations;
    clear(); await rpc({ method: 'acknowledgeWebActivity', id: observation.id, attentionId: observation.attention.id }); await vi.advanceTimersByTimeAsync(0);
    expect(action()).toEqual({ setBadgeText: [''], setBadgeBackgroundColor: [], setBadgeTextColor: [], setTitle: ['Pilovo'] });
    // Hidden, the title is the same in both languages: switching back sends nothing.
    clear(); await rpc({ method: 'updateSettings', patch: { language: 'fr' } }); expect(Object.values(action()).flat()).toEqual([]);
    clear(); expect(JSON.stringify(painted)).toMatch(/Pilovo — 1 to review/); expect(JSON.stringify(painted)).not.toMatch(/private|claude|document-4|Private title/i);
  });
  it('reads the language at startup, recovers from a failed paint and guards setBadgeTextColor', async () => {
    await rpc({ method: 'updateSettings', patch: { language: 'en' } });
    // A restarted worker: fresh listeners and module state, persisted settings, no setBadgeTextColor (before Chrome 110).
    for (const area of [api.runtime, api.permissions, api.tabs, api.windows, api.commands, api.alarms, api.action]) for (const key of Object.keys(area)) if (/^on[A-Z]/.test(key)) area[key] = signal();
    for (const name of ['setBadgeText', 'setBadgeBackgroundColor', 'setTitle']) api.action[name].mockClear();
    delete api.action.setBadgeTextColor;
    vi.resetModules(); await import('../../src/background/index'); expect((await rpc({ method: 'getSnapshot' })).data.settings.language).toBe('en');
    expect(api.action.setBadgeText).toHaveBeenCalledExactlyOnceWith({ text: '' }); expect(api.action.setTitle).toHaveBeenCalledExactlyOnceWith({ title: 'Pilovo' });
    // Startup sampling finds no controller result and observes nothing, so nothing is painted.
    await vi.advanceTimersByTimeAsync(1100); expect(api.action.setBadgeText).toHaveBeenCalledOnce();
    const tab = { id: 4, windowId: 1, url: 'https://claude.ai/chat/private', status: 'complete' }, activationId = crypto.randomUUID();
    api.tabs.get.mockResolvedValue(tab);
    api.scripting.executeScript.mockImplementation(async (injection: any) => injection.args?.[0]?.requestId ? [{ frameId: 0, documentId: 'document-4', result: { version: 1, requestId: injection.args[0].requestId, activationId, evidence: 'error_visible' } }] : []);
    api.action.setBadgeText.mockRejectedValueOnce(new Error('action unavailable'));
    api.tabs.onUpdated.emit(4, { status: 'complete' }, tab); await vi.advanceTimersByTimeAsync(1100);
    expect(api.action.setBadgeBackgroundColor).toHaveBeenLastCalledWith({ color: '#B42318' }); expect(api.action.setBadgeText).toHaveBeenLastCalledWith({ text: '1' }); expect(api.action.setTitle).toHaveBeenCalledTimes(1);
    // The failed paint is retried as a whole on the next change, here the same evidence sampled again.
    api.tabs.onUpdated.emit(4, { status: 'complete' }, tab); await vi.advanceTimersByTimeAsync(1100);
    expect(api.action.setBadgeBackgroundColor).toHaveBeenCalledTimes(2); expect(api.action.setBadgeText).toHaveBeenCalledTimes(3);
    expect(api.action.setTitle).toHaveBeenLastCalledWith({ title: 'Pilovo — 1 to review (visible error)' });
    api.tabs.onRemoved.emit(4); await vi.advanceTimersByTimeAsync(0);
    expect(api.action.setBadgeText).toHaveBeenLastCalledWith({ text: '' }); expect(api.action.setTitle).toHaveBeenLastCalledWith({ title: 'Pilovo' });
  });
  it('keeps the title in the persisted language when a settings call fails late or an older reply arrives last', async () => {
    const { HubRepository } = await import('../../src/domain/repository'), { HubError } = await import('../../src/shared/errors');
    const tab = { id: 4, windowId: 1, url: 'https://claude.ai/chat/private', status: 'complete' }, activationId = crypto.randomUUID();
    api.tabs.get.mockResolvedValue(tab);
    api.scripting.executeScript.mockImplementation(async (injection: any) => injection.args?.[0]?.requestId ? [{ frameId: 0, documentId: 'document-4', result: { version: 1, requestId: injection.args[0].requestId, activationId, evidence: 'working' } }] : []);
    api.tabs.onUpdated.emit(4, { status: 'complete' }, tab); await vi.advanceTimersByTimeAsync(1100);
    expect(api.action.setTitle).toHaveBeenLastCalledWith({ title: 'Pilovo — 1 en cours' });
    // The settings write commits, then the separate retention cleanup write fails: the call fails, the language is saved.
    vi.spyOn(HubRepository.prototype, 'cleanup').mockRejectedValueOnce(new HubError('storage.failed'));
    expect(await rpc({ method: 'updateSettings', patch: { language: 'en' } })).toMatchObject({ ok: false, error: { code: 'storage.failed' } });
    expect((await rpc({ method: 'getSnapshot' })).data.settings.language).toBe('en');
    expect(api.action.setTitle).toHaveBeenLastCalledWith({ title: 'Pilovo — 1 working' });
    // Two calls whose replies arrive in reverse order: the older one cannot restore its language over the newer one.
    const settings = (await rpc({ method: 'getSnapshot' })).data.settings, replies: ((value: unknown) => void)[] = [];
    const spy = vi.spyOn(HubRepository.prototype, 'updateSettings').mockImplementation(() => new Promise(resolve => { replies.push(resolve); }) as never);
    const older = rpc({ method: 'updateSettings', patch: { language: 'fr' } }), newer = rpc({ method: 'updateSettings', patch: { language: 'en' } });
    await vi.waitFor(() => expect(replies).toHaveLength(2));
    replies[1]({ ...settings, language: 'en' }); expect((await newer).ok).toBe(true);
    replies[0]({ ...settings, language: 'fr' }); expect((await older).ok).toBe(true);
    expect(api.action.setTitle).toHaveBeenLastCalledWith({ title: 'Pilovo — 1 working' });
    spy.mockRestore();
  });
  it('labels a current observation through a strict RPC, in memory only, and re-reads positions when tabs move', async () => {
    const activationId = crypto.randomUUID(), canary = 'PRIVATE_LABEL_CANARY';
    let index = 3;
    const tab = () => ({ id: 4, windowId: 1, index, url: 'https://claude.ai/chat/private', title: 'Private title', status: 'complete' });
    api.tabs.get.mockImplementation(async () => tab());
    api.scripting.executeScript.mockImplementation(async (injection: any) => injection.args?.[0]?.requestId ? [{ frameId: 0, documentId: 'document-4', result: { version: 1, requestId: injection.args[0].requestId, activationId, evidence: 'input_required' } }] : []);
    api.tabs.onUpdated.emit(4, { status: 'complete' }, tab()); await vi.advanceTimersByTimeAsync(1100);
    const [observation] = (await rpc({ method: 'getWebActivity' })).data.observations;
    expect(observation).toMatchObject({ tabId: 4, sessionNumber: 1, tabIndex: 3, state: 'attention' }); expect(observation).not.toHaveProperty('label');
    // Strict schema: trimmed 1-40 characters, no C0/C1 controls or bidi embedding/override/isolate characters, a UUID, no extra field.
    const bidi = ['\u202A', '\u202B', '\u202C', '\u202D', '\u202E', '\u2066', '\u2067', '\u2068', '\u2069'].map(mark => `Revue${mark}contrat`);
    const labels: unknown[] = ['', '   ', 'x'.repeat(41), ` ${'x'.repeat(41)} `, 'a\u0000b', 'a\tb', 'a\nb', 'a\rb', 'a\u007fb', 'a\u0085b', 'a\u009fb', ...bidi, 42, ['x'], { text: 'x' }, undefined];
    const invalid = [...labels.map(label => ({ method: 'labelWebActivity', id: observation.id, label })), { method: 'labelWebActivity', id: 'PRIVATE_CANARY', label: 'x' }, { method: 'labelWebActivity', label: 'x' }, { method: 'labelWebActivity', id: observation.id, label: 'x', tabId: 4 }, { method: 'labelWebActivity', id: observation.id, label: 'x', persist: true }];
    for (const request of invalid) { expect(rpcSchema.safeParse(request).success, JSON.stringify(request)).toBe(false); expect(await rpc(request)).toMatchObject({ ok: false, error: { code: 'validation.invalid' } }); }
    expect(await rpc({ method: 'labelWebActivity', id: crypto.randomUUID(), label: 'x' })).toMatchObject({ ok: false, error: { code: 'navigation.expired' } });
    expect((await rpc({ method: 'getWebActivity' })).data.observations[0]).not.toHaveProperty('label');
    // Forty characters after trimming are accepted and stored trimmed; the change notifies the panels.
    const label = `${canary} ${'x'.repeat(40 - canary.length - 1)}`;
    api.runtime.sendMessage.mockClear();
    expect(await rpc({ method: 'labelWebActivity', id: observation.id, label: `  ${label}  ` })).toMatchObject({ ok: true });
    await vi.advanceTimersByTimeAsync(250); expect(api.runtime.sendMessage).toHaveBeenCalledWith({ channel: 'hub.changed' });
    expect((await rpc({ method: 'getWebActivity' })).data.observations[0]).toMatchObject({ id: observation.id, label });
    // Never persisted, exported or painted: no IndexedDB record, export or chrome.action call carries it.
    const exported = JSON.stringify((await rpc({ method: 'exportData' })).data);
    const raw = await openDB('agent-control-hub-v1'), stored: unknown[] = [];
    for (const store of raw.objectStoreNames) stored.push(await raw.getAll(store));
    raw.close();
    const action = JSON.stringify(['setBadgeText', 'setBadgeBackgroundColor', 'setBadgeTextColor', 'setTitle'].map(name => api.action[name].mock.calls));
    for (const text of [exported, JSON.stringify(stored), action]) expect(text).not.toContain(canary);
    expect(api.action.setTitle).toHaveBeenLastCalledWith({ title: 'Pilovo — 1 à vérifier (intervention demandée)' });
    // A tab move re-reads positions only: same observation, state and label, no page access.
    const injections = api.scripting.executeScript.mock.calls.length;
    index = 0; api.tabs.onMoved.emit(4, { windowId: 1, fromIndex: 3, toIndex: 0 }); await vi.advanceTimersByTimeAsync(0);
    expect((await rpc({ method: 'getWebActivity' })).data.observations[0]).toMatchObject({ id: observation.id, tabIndex: 0, state: 'attention', label });
    expect(api.scripting.executeScript.mock.calls.length).toBe(injections);
    // null clears; closing the tab drops the row with its label and number.
    expect(await rpc({ method: 'labelWebActivity', id: observation.id, label: null })).toMatchObject({ ok: true });
    expect((await rpc({ method: 'getWebActivity' })).data.observations[0]).not.toHaveProperty('label');
    await rpc({ method: 'labelWebActivity', id: observation.id, label: 'Revue' });
    api.tabs.onRemoved.emit(4); expect((await rpc({ method: 'getWebActivity' })).data.observations).toEqual([]);
    expect(await rpc({ method: 'labelWebActivity', id: observation.id, label: 'Revue' })).toMatchObject({ ok: false, error: { code: 'navigation.expired' } });
  });
  it('re-reads observed positions when a neighboring tab opens or closes and when a tab detaches or attaches, without page access', async () => {
    const tabs = new Map<number, any>([4, 6].map((id, slot) => [id, { id, windowId: 1, index: 3 + slot * 2, url: `https://claude.ai/chat/private-${id}`, title: 'Private title', status: 'complete' }]));
    const activationId = crypto.randomUUID();
    api.tabs.query.mockImplementation(async () => [...tabs.values()].map(tab => ({ ...tab })));
    api.tabs.get.mockImplementation(async (id: number) => { const tab = tabs.get(id); if (!tab) throw new Error('No tab with id'); return { ...tab }; });
    api.scripting.executeScript.mockImplementation(async (injection: any) => injection.args?.[0]?.requestId ? [{ frameId: 0, documentId: `document-${injection.target.tabId}`, result: { version: 1, requestId: injection.args[0].requestId, activationId, evidence: 'working' } }] : []);
    for (const id of tabs.keys()) api.tabs.onUpdated.emit(id, { status: 'complete' }, tabs.get(id));
    await vi.advanceTimersByTimeAsync(1100);
    const positions = async () => Object.fromEntries((await rpc({ method: 'getWebActivity' })).data.observations.map((observation: any) => [observation.tabId, [observation.windowId, observation.tabIndex]]));
    expect(await positions()).toEqual({ 4: [1, 3], 6: [1, 5] });
    // From here on no sample can commit: a position can only change by re-reading the tabs from Chrome.
    api.scripting.executeScript.mockResolvedValue([]); const injections = api.scripting.executeScript.mock.calls.length;
    // An unobserved tab between them closes: tab 6 moves left.
    tabs.get(6).index = 4; api.tabs.onRemoved.emit(5); await vi.advanceTimersByTimeAsync(0);
    expect(await positions()).toEqual({ 4: [1, 3], 6: [1, 4] });
    // A new tab opens first in the window: both move right.
    tabs.get(4).index = 4; tabs.get(6).index = 5; api.tabs.onCreated.emit({ id: 8, windowId: 1, index: 0, url: 'https://example.test/', status: 'complete' }); await vi.advanceTimersByTimeAsync(0);
    expect(await positions()).toEqual({ 4: [1, 4], 6: [1, 5] });
    // Tab 4 is dragged out of the window: tab 6 moves left at once.
    tabs.get(6).index = 4; api.tabs.onDetached.emit(4, { oldWindowId: 1, oldPosition: 4 }); await vi.advanceTimersByTimeAsync(0);
    expect(await positions()).toEqual({ 4: [1, 4], 6: [1, 4] });
    expect(api.scripting.executeScript.mock.calls.length).toBe(injections);
    // It lands first in window 2: its row names the new window and position even before a new sample commits.
    Object.assign(tabs.get(4), { windowId: 2, index: 0 }); api.tabs.onAttached.emit(4, { newWindowId: 2, newPosition: 0 }); await vi.advanceTimersByTimeAsync(0);
    expect(await positions()).toEqual({ 4: [2, 0], 6: [1, 4] });
    expect(JSON.stringify((await rpc({ method: 'getWebActivity' })).data)).not.toMatch(/private-|Private title|https:/);
  });
  it('permits fixed provider opening after denial and refuses removed generic tab capability', async () => {
    api.permissions.contains.mockResolvedValue(false); expect((await rpc({ method: 'openWebProvider', provider: 'chatgpt-web' })).ok).toBe(true); expect(api.tabs.create).toHaveBeenCalledWith({ url: 'https://chatgpt.com/', active: true });
    expect(await rpc({ method: 'attachActiveTab', key: 'codex:t:r' })).toMatchObject({ ok: false, error: { code: 'permission.denied' } }); expect(api.permissions.request).not.toHaveBeenCalled();
  });
});
