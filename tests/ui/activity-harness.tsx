// Synthetic fixture only; not a production entry and never contacts providers.
import { createRoot } from 'react-dom/client';
import { App } from '../../src/ui/App';
import { client } from '../../src/platform/client';
import { DEFAULT_SETTINGS } from '../../src/shared/defaults';
import { monotonicEpoch, type WebActivityObservation, type WebActivitySnapshot } from '../../src/shared/activity';
import { emptyWebDiscovery, type WebProvider } from '../../src/shared/web';
import type { HubClient, Snapshot } from '../../src/shared/types';
import '../../src/ui/styles.css';

const listeners = new Set<() => void>(), grants = new Set<WebProvider>();
const calls = { focus: [] as string[], ack: [] as { id: string; attentionId: string }[], permission: [] as { provider?: WebProvider; revoke: boolean }[], opens: [] as WebProvider[], reads: 0 };
let records: WebActivityObservation[] = [], failure = false, focusFailure = false, ackFailure = false, deny = false, hold = new URL(location.href).searchParams.has('loading'), holdAck = false;
const pending: { resolve: (value: WebActivitySnapshot) => void; value: WebActivitySnapshot }[] = [];
let pendingAck: (() => void) | undefined;
const snapshot: Snapshot = { mode: 'extension', bridgeStatus: 'disabled', connectors: [], settings: { ...DEFAULT_SETTINGS, language: 'fr', theme: 'light' }, missions: [], tasks: [], webPreparations: [], diagnostics: { acceptedEvents: 0, duplicateEvents: 0, rejectedEvents: 0 } };
const signal = () => listeners.forEach(listener => listener());
const sample = (): WebActivitySnapshot => ({ availability: 'available', observations: structuredClone(records), observedAt: Date.now() });
const seed = (ttl = 60000) => {
  grants.add('claude-web'); grants.add('chatgpt-web');
  const common = { windowId: 1, provenance: 'observed_ui' as const, observedAt: Date.now(), validUntil: monotonicEpoch() + ttl };
  records = [
    { ...common, id: 'idle', provider: 'claude-web', tabId: 9, state: 'idle' },
    { ...common, id: 'working', provider: 'chatgpt-web', tabId: 11, state: 'working' },
    { ...common, id: 'attention', provider: 'chatgpt-web', tabId: 12, state: 'attention', attention: { id: 'event-a', reason: 'response_ready', acknowledged: false } },
    { ...common, id: 'unsupported', provider: 'claude-web', tabId: 14, state: 'unknown', unknownReason: 'no_evidence' },
  ];
  signal();
};
const api: HubClient = {
  ...client, getSnapshot: async () => structuredClone(snapshot),
  subscribe: listener => { listeners.add(listener); return () => { listeners.delete(listener); }; },
  updateSettings: async patch => { Object.assign(snapshot.settings, patch); signal(); return snapshot.settings; },
  getWebDiscovery: async () => { const discovery = emptyWebDiscovery('not-granted'); for (const provider of discovery.providers) if (grants.has(provider.id)) { provider.permission = 'granted'; provider.tabs = records.filter(record => record.provider === provider.id).map(record => ({ tabId: record.tabId, windowId: record.windowId })); } discovery.permission = grants.size ? 'granted' : 'not-granted'; return discovery; },
  requestWebDiscoveryPermission: async provider => { calls.permission.push({ provider, revoke: false }); if (!deny && provider) grants.add(provider); signal(); return !deny; },
  removeWebDiscoveryPermission: async provider => { calls.permission.push({ provider, revoke: true }); if (provider) { grants.delete(provider); records = records.filter(record => record.provider !== provider); } signal(); return true; },
  openWebProvider: async provider => { calls.opens.push(provider); },
  getWebActivity: () => { calls.reads++; if (hold) return new Promise(resolve => { pending.push({ resolve, value: sample() }); }); if (failure) return Promise.reject(new Error('private transport diagnostic')); return Promise.resolve(sample()); },
  focusWebActivity: async id => { calls.focus.push(id); if (focusFailure || !records.some(record => record.id === id && record.validUntil > monotonicEpoch())) throw new Error('missing'); },
  acknowledgeWebActivity: async (id, attentionId) => {
    calls.ack.push({ id, attentionId });
    if (holdAck) await new Promise<void>(resolve => { pendingAck = resolve; });
    const record = records.find(record => record.id === id && record.validUntil > monotonicEpoch());
    if (ackFailure || !record?.attention || record.attention.id !== attentionId) throw new Error('new event');
    record.attention.acknowledged = true; signal();
  },
};
if (new URL(location.href).searchParams.has('legacy')) { delete api.getWebActivity; delete api.getWebDiscovery; delete api.requestWebDiscoveryPermission; delete api.removeWebDiscoveryPermission; }
const root = createRoot(document.getElementById('root')!);
Object.assign(window, { __activity: {
  seed, calls: () => calls, listeners: () => listeners.size, signal,
  deny: (value: boolean) => { deny = value; }, fail: (value: boolean) => { failure = value; signal(); },
  failFocus: (value: boolean) => { focusFailure = value; }, failAck: (value: boolean) => { ackFailure = value; },
  hold: (value: boolean) => { hold = value; }, pending: () => pending.length,
  resolve: (index: number) => pending[index].resolve(pending[index].value),
  holdAck: (value: boolean) => { holdAck = value; }, resolveAck: () => pendingAck?.(),
  nextAttention: () => { const record = records.find(record => record.id === 'attention'); if (record) { record.attention = { id: 'event-b', reason: 'input_required', acknowledged: false }; signal(); } },
  empty: () => { records = []; signal(); },
  unmount: () => root.unmount(), settings: (patch: Parameters<HubClient['updateSettings']>[0]) => api.updateSettings(patch),
} });
root.render(<App api={api} />);
