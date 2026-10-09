// Synthetic browser boundary only. Persistence uses the actual preview repository.
import { createRoot } from 'react-dom/client';
import { App } from '../../src/ui/App';
import { client } from '../../src/platform/client';
import type { HubClient, Snapshot } from '../../src/shared/types';
import { emptyWebDiscovery, type WebPreparationInput, type WebPreparationPatch, type WebProvider } from '../../src/shared/web';
import '../../src/ui/styles.css';
let permission = false, deny = true, failSave = false, copied = '', clipboardMode = 'success', tabCount = 2;
const tabListeners = new Set<() => void>();
let frozenSnapshot: Snapshot | undefined;
const updates: { id: string; patch: WebPreparationPatch }[] = [];
let resolveClipboard: (() => void) | undefined;
const opens: { provider: WebProvider; tabId?: number }[] = [], creates: WebPreparationInput[] = [];
Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: (text: string) => { copied = text; if (clipboardMode === 'failure') return Promise.reject(new Error('Synthetic clipboard rejection')); if (clipboardMode === 'pending') return new Promise<void>(resolve => { resolveClipboard = resolve; }); return Promise.resolve(); } } });
const api: HubClient = {
  ...client,
  subscribe: listener => { tabListeners.add(listener); const unsubscribe = client.subscribe(() => { if (!frozenSnapshot) listener(); }); return () => { tabListeners.delete(listener); unsubscribe(); }; },
  getSnapshot: async () => ({ ...frozenSnapshot || await client.getSnapshot(), mode: 'extension' }),
  updateWebPreparation: async (id, patch) => { updates.push(structuredClone({ id, patch })); try { return await client.updateWebPreparation!(id, patch); } catch (error) { frozenSnapshot = undefined; throw error; } },
  getWebDiscovery: async () => permission ? { permission: 'granted', providers: [{ id: 'claude-web', permission: 'granted', tabs: [{ tabId: 12, windowId: 3 }, { tabId: 13, windowId: 3 }].slice(0, tabCount) }, { id: 'chatgpt-web', permission: 'granted', tabs: [] }] } : emptyWebDiscovery('not-granted'),
  requestWebDiscoveryPermission: async () => { permission = !deny; return permission; },
  removeWebDiscoveryPermission: async () => { permission = false; return true; },
  openWebProvider: async (provider, tabId) => { opens.push({ provider, tabId }); },
  createWebPreparation: async input => { creates.push(structuredClone(input)); const saved = await client.createWebPreparation!(input); if (failSave) { failSave = false; throw { code: 'storage.failed' }; } return saved; },
};
const legacy = new URL(location.href).searchParams.has('legacy');
if (legacy) { delete api.getWebDiscovery; delete api.openWebProvider; delete api.requestWebDiscoveryPermission; delete api.createWebPreparation; delete api.updateWebPreparation; delete api.deleteWebPreparation; }
const root = createRoot(document.getElementById('root')!);
Object.assign(window, { __autoporteur: {
  freezeSnapshot: async () => { frozenSnapshot = await client.getSnapshot(); },
  releaseSnapshot: () => { frozenSnapshot = undefined; tabListeners.forEach(listener => listener()); },
  updates: () => updates,
  closeObservedTab: () => { tabCount = 1; tabListeners.forEach(listener => listener()); },
  listenerCount: () => tabListeners.size,
  allowPermission: () => { deny = false; },
  failNextSave: () => { failSave = true; },
  clipboard: (mode: string) => { clipboardMode = mode; },
  resolveClipboard: () => resolveClipboard?.(),
  opens: () => opens, creates: () => creates, copied: () => copied,
  snapshot: () => client.getSnapshot(),
  setSettings: (patch: Parameters<HubClient['updateSettings']>[0]) => client.updateSettings(patch),
  unmount: () => root.unmount(),
} });
root.render(<App api={api} />);
