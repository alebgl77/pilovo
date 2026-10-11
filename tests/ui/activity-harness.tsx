// Synthetic fixture only; not a production entry and never contacts providers.
import { createRoot } from 'react-dom/client';
import { App } from '../../src/ui/App';
import { client } from '../../src/platform/client';
import { DEFAULT_SETTINGS } from '../../src/shared/defaults';
import { activityLabelSchema, monotonicEpoch, type ActivityShortcuts, type WebActivityObservation, type WebActivitySnapshot, type WebAttentionReason } from '../../src/shared/activity';
import { emptyWebDiscovery, type WebProvider } from '../../src/shared/web';
import type { HubClient, Snapshot } from '../../src/shared/types';
import '../../src/ui/styles.css';

const listeners = new Set<() => void>(), grants = new Set<WebProvider>();
const calls = { focus: [] as string[], ack: [] as { id: string; attentionId: string }[], ackAll: [] as (string[] | undefined)[], label: [] as { id: string; label: string | null }[], permission: [] as { provider?: WebProvider; revoke: boolean }[], opens: [] as WebProvider[], reads: 0 };
let records: WebActivityObservation[] = [], failure = false, shortcutFailure = false, focusFailure = false, ackFailure = false, ackAllFailure = false, deny = false, hold = new URL(location.href).searchParams.has('loading'), holdAck = false, holdAckAll = false;
let shortcuts: ActivityShortcuts = { 'focus-next-attention': 'Alt+Shift+J' };
// The window showing the panel; the 'attention' row's tab sits in another one. labelFailure mirrors a refused label RPC.
let panelWindow: number | undefined = 1, labelFailure = false;
const pending: { resolve: (value: WebActivitySnapshot) => void; value: WebActivitySnapshot }[] = [];
let pendingAck: (() => void) | undefined, pendingAckAll: (() => void) | undefined;
const snapshot: Snapshot = { mode: 'extension', bridgeStatus: 'disabled', connectors: [], settings: { ...DEFAULT_SETTINGS, language: 'fr', theme: 'light' }, missions: [], tasks: [], webPreparations: [], diagnostics: { acceptedEvents: 0, duplicateEvents: 0, rejectedEvents: 0 } };
const signal = () => listeners.forEach(listener => listener());
// Pending window timeouts and their delays, so flows can check when the panel arms its tickers and that it clears them.
const timers = new Map<number, number>(), setTimer = window.setTimeout.bind(window), clearTimer = window.clearTimeout.bind(window);
window.setTimeout = ((handler: TimerHandler, delay = 0, ...args: unknown[]) => {
  const id = setTimer((...values: unknown[]) => { timers.delete(id); if (typeof handler === 'function') handler(...values); }, delay, ...args);
  timers.set(id, delay); return id;
}) as typeof window.setTimeout;
window.clearTimeout = (id?: number) => { if (id !== undefined) timers.delete(id); clearTimer(id); };
const sample = (): WebActivitySnapshot => ({ availability: 'available', observations: structuredClone(records), observedAt: Date.now() });
const seed = (ttl = 60000) => {
  grants.add('claude-web'); grants.add('chatgpt-web');
  const now = monotonicEpoch(), common = { windowId: 1, provenance: 'observed_ui' as const, observedAt: Date.now(), validUntil: now + ttl };
  // Worker-assigned numbers per provider and Chrome tab positions (0-based); 'unsupported' has no position read yet.
  // Synthetic elapsed times on the monotonic clock: working for 4 min, response available for 2 min (stateSince = raisedAt).
  const raised = now - 130_000;
  records = [
    { ...common, id: 'idle', provider: 'claude-web', tabId: 9, sessionNumber: 1, tabIndex: 1, state: 'idle', stateSince: now - 30_000 },
    { ...common, id: 'working', provider: 'chatgpt-web', tabId: 11, sessionNumber: 1, tabIndex: 3, state: 'working', stateSince: now - 245_000 },
    { ...common, windowId: 2, id: 'attention', provider: 'chatgpt-web', tabId: 12, sessionNumber: 2, tabIndex: 0, state: 'attention', stateSince: raised, attention: { id: 'event-a', reason: 'response_ready', acknowledged: false, raisedAt: raised } },
    { ...common, id: 'unsupported', provider: 'claude-web', tabId: 14, sessionNumber: 2, state: 'unknown', stateSince: now - 10_000, unknownReason: 'no_evidence' },
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
  acknowledgeAllWebActivity: async attentionIds => {
    calls.ackAll.push(attentionIds && [...attentionIds]);
    if (holdAckAll) await new Promise<void>(resolve => { pendingAckAll = resolve; });
    if (ackAllFailure) throw new Error('storage');
    // Mirrors the worker: only live, unacknowledged attention whose identity the panel displayed.
    const current = records.filter(record => record.validUntil > monotonicEpoch() && record.attention && !record.attention.acknowledged && (!attentionIds || attentionIds.includes(record.attention.id)));
    for (const record of current) record.attention!.acknowledged = true;
    signal(); return current.length;
  },
  getShortcuts: async () => { if (shortcutFailure) throw new Error('commands unavailable'); return structuredClone(shortcuts); },
  getCurrentWindowId: async () => panelWindow,
  // Mirrors the worker: the strict label schema, a live observation (current, unexpired), tab-level memory only; null clears.
  labelWebActivity: async (id, label) => {
    calls.label.push({ id, label });
    const parsed = activityLabelSchema.nullable().safeParse(label), record = records.find(record => record.id === id && record.validUntil > monotonicEpoch());
    if (labelFailure || !parsed.success || !record) throw new Error('expired');
    if (parsed.data === null) delete record.label; else record.label = parsed.data;
    signal();
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
  nextAttention: () => { const record = records.find(record => record.id === 'attention'); if (record) { record.stateSince = monotonicEpoch(); record.attention = { id: 'event-b', reason: 'input_required', acknowledged: false, raisedAt: record.stateSince }; signal(); } },
  addAttention: () => { const base = records.find(record => record.id === 'attention'), raisedAt = monotonicEpoch() - 1000; if (base) { records.push({ ...structuredClone(base), id: 'attention-2', provider: 'claude-web', tabId: 15, sessionNumber: 3, tabIndex: 5, windowId: 1, stateSince: raisedAt, attention: { id: 'event-c', reason: 'input_required', acknowledged: false, raisedAt } }); signal(); } },
  // Tab closed: the worker drops its row and keeps every other number as it was.
  close: (id: string) => { records = records.filter(record => record.id !== id); signal(); },
  // Navigation in the same tab: a new observation identity, while number, position and label stay with the tab.
  navigate: (id: string, next: string) => { const record = records.find(record => record.id === id); if (record) { record.id = next; signal(); } },
  rename: (id: string, label: string | null) => { const record = records.find(record => record.id === id); if (record) { if (label === null) delete record.label; else record.label = label; signal(); } },
  // The row's evidence lapses (a throttled background tab): the panel shows it as expired until a fresh sample.
  expire: (id: string) => { const record = records.find(record => record.id === id); if (record) { record.validUntil = monotonicEpoch() - 1; signal(); } },
  move: (id: string, tabIndex: number, windowId?: number) => { const record = records.find(record => record.id === id); if (record) { record.tabIndex = tabIndex; if (windowId !== undefined) record.windowId = windowId; signal(); } },
  panelWindow: (value: number | undefined) => { panelWindow = value; signal(); },
  noWindow: () => { delete api.getCurrentWindowId; signal(); },
  failLabel: (value: boolean) => { labelFailure = value; },
  // The displayed state began `ago` ms before now (negative: a future start, as with clock skew). A reason raises a new attention identity.
  since: (id: string, ago: number, reason?: WebAttentionReason) => {
    const record = records.find(record => record.id === id); if (!record) return;
    record.stateSince = monotonicEpoch() - ago;
    if (reason) { record.state = 'attention'; record.attention = { id: `event-${id}-${reason}`, reason, acknowledged: false, raisedAt: record.stateSince }; } else if (record.attention) record.attention.raisedAt = record.stateSince;
    signal();
  },
  // Seen outside this panel (automatic seen after dwelling on the tab, the keyboard command or another panel): the worker's
  // state changes and the panel only learns it from the change signal.
  seenElsewhere: (ids: string[]) => { for (const record of records) if (ids.includes(record.id) && record.attention) record.attention.acknowledged = true; signal(); },
  failAckAll: (value: boolean) => { ackAllFailure = value; },
  holdAckAll: (value: boolean) => { holdAckAll = value; }, resolveAckAll: () => pendingAckAll?.(),
  shortcut: (value: string | null) => { shortcuts = value === null ? {} : { 'focus-next-attention': value }; signal(); },
  noShortcuts: () => { delete api.getShortcuts; signal(); },
  failShortcuts: (value: boolean) => { shortcutFailure = value; signal(); },
  empty: () => { records = []; signal(); },
  // Rows stay listed but none shows a duration: working and attention become idle.
  settle: () => { for (const record of records) if (record.state === 'working' || record.state === 'attention') { record.state = 'idle'; delete record.attention; } signal(); },
  timers: () => [...timers.values()],
  unmount: () => root.unmount(), settings: (patch: Parameters<HubClient['updateSettings']>[0]) => api.updateSettings(patch),
  // Saved preferences as the worker would read them (the harness has no worker: automatic seen itself is unit-tested).
  savedSettings: () => structuredClone(snapshot.settings),
} });
root.render(<App api={api} />);
