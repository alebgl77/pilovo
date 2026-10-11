import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { WebActivity, type ActivityAccess } from '../../src/background/activity';
import { makeUnknown, newActivityRecord, reduceActivity } from '../../src/background/activity-reducer';
import { activityHintSchema, activitySampleSchema, ACTIVITY_TTL, type ActivityEvidence, type ActivityLease } from '../../src/shared/activity';

describe('conservative activity reducer', () => {
  it('requires witnessed work and two uninterrupted positive reads one second apart', () => {
    const record = newActivityRecord('chatgpt-web', 1, 2, 'session', 0, 10);
    reduceActivity(record, 'idle_ready', 0, 10, 15000); expect(record.observation.state).toBe('idle');
    reduceActivity(record, 'working', 100, 20, 15100);
    reduceActivity(record, 'idle_ready', 200, 30, 15200); expect(record.observation.state).toBe('working');
    reduceActivity(record, 'idle_ready', 1199, 40, 16199); expect(record.observation.state).toBe('working');
    reduceActivity(record, 'idle_ready', 1200, 50, 16200); expect(record.observation.state).toBe('attention');
    const id = record.observation.attention!.id; record.observation.attention!.acknowledged = true;
    reduceActivity(record, 'idle_ready', 9000, 60, 24000); expect(record.observation.attention).toEqual({ id, reason: 'response_ready', acknowledged: true, raisedAt: 1200 });
    reduceActivity(record, 'working', 10000, 70, 25000); expect(record.observation.attention).toBeUndefined();
  });
  it.each(['unknown', 'working'] as const)('%s breaks idle debounce; unknown also destroys witness', evidence => {
    const record = newActivityRecord('claude-web', 1, 2, 'session', 0, 0);
    reduceActivity(record, 'working', 0, 0, 15000); reduceActivity(record, 'idle_ready', 1000, 0, 16000);
    reduceActivity(record, evidence, 2000, 0, 17000); reduceActivity(record, 'idle_ready', 3000, 0, 18000);
    expect(record.observation.state).toBe(evidence === 'unknown' ? 'idle' : 'working'); expect(record.observation.attention).toBeUndefined();
  });
  it('explicit finite attention stays acknowledged until the evidence changes', () => {
    const record = newActivityRecord('claude-web', 1, 2, 'session', 0, 0);
    reduceActivity(record, 'input_required', 0, 0, 15000); const id = record.observation.attention!.id;
    record.observation.attention!.acknowledged = true; reduceActivity(record, 'input_required', 1000, 0, 16000);
    expect(record.observation.attention).toMatchObject({ id, acknowledged: true });
    reduceActivity(record, 'error_visible', 2000, 0, 17000); expect(record.observation.attention).toMatchObject({ reason: 'error_visible', acknowledged: false });
    makeUnknown(record, 'expired', 17000); expect(record.observation.attention).toBeUndefined(); expect(record.worked).toBe(false);
  });
  it('stamps raisedAt once per attention identity on the monotonic clock and keeps it while that attention persists', () => {
    const record = newActivityRecord('claude-web', 1, 2, 'session', 0, 0);
    reduceActivity(record, 'input_required', 500, 99_000, 15500); const first = structuredClone(record.observation.attention!);
    expect(first).toMatchObject({ reason: 'input_required', acknowledged: false, raisedAt: 500 });
    record.observation.attention!.acknowledged = true; reduceActivity(record, 'input_required', 1500, 1, 16500);
    expect(record.observation.attention).toEqual({ ...first, acknowledged: true });
    reduceActivity(record, 'error_visible', 2500, 2, 17500);
    expect(record.observation.attention).toMatchObject({ reason: 'error_visible', acknowledged: false, raisedAt: 2500 }); expect(record.observation.attention!.id).not.toBe(first.id);
    reduceActivity(record, 'working', 3000, 3, 18000); expect(record.observation.attention).toBeUndefined();
    reduceActivity(record, 'idle_ready', 3100, 4, 18100); reduceActivity(record, 'idle_ready', 4100, 5, 19100);
    expect(record.observation.attention).toMatchObject({ reason: 'response_ready', raisedAt: 4100 });
    reduceActivity(record, 'idle_ready', 9000, 6, 24000); expect(record.observation.attention!.raisedAt).toBe(4100);
  });
  it('times the displayed state with stateSince: kept across same-state samples and the ready debounce, reset on change', () => {
    const record = newActivityRecord('chatgpt-web', 1, 2, 'session', 50, 99_000);
    expect(record.observation).toMatchObject({ state: 'unknown', stateSince: 50 });
    reduceActivity(record, 'unknown', 80, 1, 15080); expect(record.observation).toMatchObject({ state: 'unknown', stateSince: 50, validUntil: 15080 });
    reduceActivity(record, 'idle_ready', 100, 1, 15100); expect(record.observation).toMatchObject({ state: 'idle', stateSince: 100 });
    reduceActivity(record, 'idle_ready', 600, 2, 15600); expect(record.observation.stateSince).toBe(100);
    reduceActivity(record, 'working', 1000, 3, 16000); expect(record.observation).toMatchObject({ state: 'working', stateSince: 1000 });
    reduceActivity(record, 'working', 4000, 4, 19000); expect(record.observation.stateSince).toBe(1000);
    // While the 1 s ready debounce runs the state stays working, so its duration must not restart.
    reduceActivity(record, 'idle_ready', 5000, 5, 20000); reduceActivity(record, 'idle_ready', 5999, 6, 20999);
    expect(record.observation).toMatchObject({ state: 'working', stateSince: 1000 });
    reduceActivity(record, 'idle_ready', 6000, 7, 21000);
    expect(record.observation).toMatchObject({ state: 'attention', stateSince: 6000, attention: { reason: 'response_ready', raisedAt: 6000 } });
    record.observation.attention!.acknowledged = true; reduceActivity(record, 'idle_ready', 9000, 8, 24000);
    expect(record.observation).toMatchObject({ stateSince: 6000, attention: { acknowledged: true, raisedAt: 6000 } });
    // A new attention identity resets both, even though the state stays attention.
    reduceActivity(record, 'input_required', 9500, 9, 24500); reduceActivity(record, 'input_required', 9900, 9, 24900);
    expect(record.observation).toMatchObject({ stateSince: 9500, attention: { reason: 'input_required', raisedAt: 9500 } });
    reduceActivity(record, 'error_visible', 10_000, 10, 25000);
    expect(record.observation).toMatchObject({ stateSince: 10_000, attention: { reason: 'error_visible', raisedAt: 10_000 } });
    reduceActivity(record, 'idle_ready', 11_000, 11, 26000); expect(record.observation).toMatchObject({ state: 'idle', stateSince: 11_000 });
    // Unknown evidence restarts the state at the sample time, not at the lease deadline it keeps as validUntil.
    reduceActivity(record, 'working', 12_000, 12, 27000); reduceActivity(record, 'unknown', 13_000, 13, 28000);
    expect(record.observation).toMatchObject({ state: 'unknown', stateSince: 13_000, validUntil: 28000 });
    reduceActivity(record, 'working', 14_000, 14, 29000); expect(record.observation).toMatchObject({ state: 'working', stateSince: 14_000 });
  });
  it('makeUnknown restarts stateSince from any other state and keeps it while already unknown', () => {
    const record = newActivityRecord('claude-web', 1, 2, 'session', 0, 0);
    reduceActivity(record, 'input_required', 500, 0, 15500); expect(record.observation.stateSince).toBe(record.observation.attention!.raisedAt);
    makeUnknown(record, 'unavailable', 2000); expect(record.observation).toMatchObject({ state: 'unknown', stateSince: 2000, validUntil: 2000, unknownReason: 'unavailable' });
    makeUnknown(record, 'expired', 3000); expect(record.observation).toMatchObject({ stateSince: 2000, unknownReason: 'expired' });
    reduceActivity(record, 'working', 4000, 0, 19000); makeUnknown(record, 'navigation', 5000);
    expect(record.observation).toMatchObject({ state: 'unknown', stateSince: 5000, unknownReason: 'navigation' }); expect(record.observation.attention).toBeUndefined();
  });
});

let access: ActivityAccess, activity: WebActivity, now: number, evidence: ActivityEvidence, documentId: string, activationId: string;
const currentTab = () => ({ id: 1, windowId: 2, url: 'https://chatgpt.com/c/PRIVATE_URL_CANARY', status: 'complete' });
const hint = (sequence = 1) => ({ channel: 'pilovo.observe', version: 1, activationId, sequence, kind: 'change' });
const sender = () => ({ id: 'extension', frameId: 0, documentId, documentLifecycle: 'active', url: currentTab().url, tab: currentTab() });
const tick = async (ms = 0) => { now += ms; await vi.advanceTimersByTimeAsync(ms); };
const row = () => activity.snapshot().observations[0];
const deferred = <T>() => { let resolve!: (value: T) => void; const promise = new Promise<T>(done => { resolve = done; }); return { promise, resolve }; };
beforeEach(() => {
  vi.useFakeTimers(); now = 1_000_000; evidence = 'working'; documentId = 'chrome-document'; activationId = crypto.randomUUID();
  access = {
    runtimeId: 'extension', now: () => now, wall: () => 1234,
    hasPermission: vi.fn(async provider => provider === 'chatgpt-web'), tabs: vi.fn(async () => [currentTab()]), tab: vi.fn(async () => currentTab()),
    register: vi.fn(async () => undefined), unregister: vi.fn(async () => undefined), install: vi.fn(async () => undefined), dispose: vi.fn(async () => undefined),
    sample: vi.fn(async (_tab, lease) => [{ frameId: 0, documentId, result: { version: 1, requestId: lease.requestId, activationId, evidence } }]),
    focus: vi.fn(async (_provider, _tabId, current) => { if (!current()) throw new Error('expired'); }), badge: vi.fn(async () => undefined), notify: vi.fn(),
  };
  activity = new WebActivity(access);
});
afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); });

describe('leased worker observations', () => {
  it('uses isolated positive evidence, completes, acknowledges once, and carries no page strings', async () => {
    activity.start(); await tick(); expect(row().state).toBe('working');
    evidence = 'idle_ready'; await activity.hint(hint(), sender()); await tick(1000); expect(row().state).toBe('working');
    await tick(1000); expect(row().state).toBe('attention');
    const observed = row(); activity.acknowledge(observed.id, observed.attention!.id); await tick();
    expect(row().attention!.acknowledged).toBe(true); expect(access.badge).toHaveBeenLastCalledWith('');
    await activity.hint(hint(2), sender()); await tick(1000); expect(row().attention!.id).toBe(observed.attention!.id);
    const focusing = activity.focus(observed.id); await tick(1000); await focusing; expect(access.focus).toHaveBeenCalledOnce();
    expect(JSON.stringify(activity.snapshot())).not.toMatch(/PRIVATE_URL|https:|title|prompt|responseText|documentId|activationId/);
  });
  it('carries an ephemeral stateSince that persists through same-state samples and restarts when evidence is lost', async () => {
    const started = now; activity.start(); await tick(); expect(row()).toMatchObject({ state: 'working', stateSince: started });
    for (let step = 2; step < 6; step++) { await activity.hint(hint(step), sender()); await tick(1000); }
    expect(row()).toMatchObject({ state: 'working', stateSince: started }); expect(access.sample).toHaveBeenCalledTimes(5);
    // The ready debounce keeps working and its start; the response-ready identity starts when it is raised.
    evidence = 'idle_ready'; await activity.hint(hint(6), sender()); await tick(1000); expect(row()).toMatchObject({ state: 'working', stateSince: started });
    await tick(1000); const raised = row(); expect(raised.state).toBe('attention'); expect(raised.stateSince).toBe(raised.attention!.raisedAt); expect(raised.stateSince).toBeGreaterThan(started);
    activity.acknowledge(raised.id, raised.attention!.id); await activity.hint(hint(7), sender()); await tick(1000);
    expect(row()).toMatchObject({ stateSince: raised.stateSince, attention: { acknowledged: true } });
    // Expiry, then fresh evidence: a new record, so the duration restarts instead of spanning the gap.
    now += ACTIVITY_TTL; expect(row()).toMatchObject({ state: 'unknown', unknownReason: 'expired' });
    evidence = 'working'; await activity.hint(hint(8), sender()); await tick(1000);
    const resumed = row(); expect(resumed.id).not.toBe(raised.id); expect(resumed).toMatchObject({ state: 'working', stateSince: now });
    // Navigation and a worker restart restart it too.
    await tick(5000); activity.updateTab(1, { status: 'loading' }, { ...currentTab(), status: 'loading' }); expect(row()).toMatchObject({ state: 'unknown', stateSince: now });
    activity.updateTab(1, { status: 'complete' }, currentTab()); await tick(1000); expect(row()).toMatchObject({ state: 'working', stateSince: now });
    await tick(3000); activity = new WebActivity(access); activity.start(); await tick(); expect(row()).toMatchObject({ state: 'working', stateSince: now });
    // Bounded, non-content metadata: one number on the monotonic clock.
    expect(Object.keys(row()).sort()).toEqual(['id', 'observedAt', 'provenance', 'provider', 'state', 'stateSince', 'tabId', 'validUntil', 'windowId']);
  });
  it('expires strictly using monotonic epoch even if wall clock moves backwards', async () => {
    activity.start(); await tick(); now += ACTIVITY_TTL; expect(row()).toMatchObject({ state: 'unknown', unknownReason: 'expired' });
    await expect(activity.focus(row().id)).rejects.toMatchObject({ code: 'navigation.expired' });
  });
  it('invalidates same-URL reloads, SPA routes, frozen/discarded tabs and removes closed tabs', async () => {
    activity.start(); await tick(); const oldId = row().id;
    activity.updateTab(1, { status: 'loading' }, { ...currentTab(), status: 'loading' }); expect(row().state).toBe('unknown');
    await expect(activity.focus(oldId)).rejects.toMatchObject({ code: 'navigation.expired' });
    evidence = 'idle_ready'; documentId = 'same-url-new-document'; activity.updateTab(1, { status: 'complete' }, currentTab()); await tick(1000); expect(row().state).toBe('idle');
    for (const change of [{ url: currentTab().url + '/new' }, { frozen: true }, { discarded: true }]) { activity.updateTab(1, change); expect(row().state).toBe('unknown'); }
    activity.invalidateTab(1, true); expect(activity.snapshot().observations).toEqual([]);
  });
  it('new document, BFCache activation and worker sessions cannot reuse a work witness', async () => {
    activity.start(); await tick(); const old = row().id;
    activationId = crypto.randomUUID(); evidence = 'idle_ready'; await activity.hint(hint(), sender()); await tick(1000);
    expect(row().state).toBe('idle'); expect(row().id).not.toBe(old);
    activity = new WebActivity(access); expect(activity.snapshot().observations).toEqual([]); await tick(); expect(access.badge).toHaveBeenLastCalledWith('');
    activity.start(); await tick(); expect(row().state).toBe('idle');
  });
  it('clears a revoked grant immediately and rejects a sample released after rapid regrant', async () => {
    activity.start(); await tick();
    const slow = deferred<Awaited<ReturnType<ActivityAccess['sample']>>>(); let captured!: ActivityLease;
    vi.mocked(access.sample).mockImplementationOnce(async (_id, lease) => { captured = lease; return slow.promise; });
    await activity.hint(hint(), sender()); await tick(1000);
    activity.revoke('chatgpt-web'); expect(activity.snapshot().observations).toEqual([]);
    activity.reconcile('chatgpt-web'); await tick();
    slow.resolve([{ frameId: 0, documentId, result: { version: 1, requestId: captured.requestId, activationId, evidence: 'error_visible' } }]); await tick();
    expect(activity.snapshot().observations.some(observation => observation.state === 'attention')).toBe(false);
    expect(access.dispose).toHaveBeenCalledWith(1, captured.grantId);
    expect(vi.mocked(access.unregister).mock.invocationCallOrder.at(-1)!).toBeLessThan(vi.mocked(access.register).mock.invocationCallOrder.at(-1)!);
  });
  it('bounds hints to one sample per second, one job and one coalesced pending request', async () => {
    activity.start(); await tick(); expect(access.sample).toHaveBeenCalledTimes(1);
    await Promise.all(Array.from({ length: 100 }, (_, i) => activity.hint(hint(i + 1), sender()))); await tick(999); expect(access.sample).toHaveBeenCalledTimes(1);
    await tick(1); expect(access.sample).toHaveBeenCalledTimes(2);
    await activity.hint(hint(1), sender()); await tick(1000); expect(access.sample).toHaveBeenCalledTimes(2);
  });
  it('a two-second timeout rejects late results and never extends the original absolute lease', async () => {
    activity.start(); await tick();
    const slow = deferred<Awaited<ReturnType<ActivityAccess['sample']>>>(); let captured!: ActivityLease;
    vi.mocked(access.sample).mockImplementationOnce(async (_id, lease) => { captured = lease; return slow.promise; });
    await activity.hint(hint(), sender()); await tick(1000); await tick(2000);
    expect(row().state).toBe('unknown');
    slow.resolve([{ frameId: 0, documentId, result: { version: 1, requestId: captured.requestId, activationId, evidence: 'error_visible' } }]); await tick();
    expect(row().state).toBe('unknown'); expect(captured.expiresAt - captured.issuedAt).toBe(ACTIVITY_TTL);
  });
  it.each([
    { id: 'other' }, { frameId: 1 }, { documentId: '' }, { documentLifecycle: 'cached' }, { url: 'https://chatgpt.com.evil.test/' }, { tab: { ...currentTab(), incognito: true } }, { url: 'https://user@chatgpt.com/' }, { url: 'https://chatgpt.com:444/' },
  ])('ignores unauthorized hint sender %j', async patch => {
    activity.start(); await tick(); await activity.hint(hint(), { ...sender(), ...patch }); await tick(1000); expect(access.sample).toHaveBeenCalledTimes(1);
  });
  it('rejects payload authority, extra data, malformed IDs and sample strings before commit', async () => {
    expect(activityHintSchema.safeParse({ ...hint(), evidence: 'working' }).success).toBe(false);
    expect(activityHintSchema.safeParse({ ...hint(), title: 'PRIVATE_CANARY' }).success).toBe(false);
    expect(activityHintSchema.safeParse({ ...hint(), sequence: Number.MAX_SAFE_INTEGER + 1 }).success).toBe(false);
    expect(activitySampleSchema.safeParse({ version: 1, requestId: crypto.randomUUID(), activationId, evidence: 'PRIVATE_CANARY' }).success).toBe(false);
    activity.start(); await tick();
    vi.mocked(access.sample).mockImplementation(async (_id, lease) => [{ frameId: 0, documentId, result: { version: 1, requestId: lease.requestId, activationId, evidence: 'error_visible', url: 'PRIVATE_CANARY' } }]);
    await activity.hint(hint(), sender()); await tick(1000); expect(row().state).toBe('unknown');
  });
  it('installs missing controller idempotently and requires Chrome document identity', async () => {
    vi.mocked(access.sample).mockResolvedValueOnce([{ frameId: 0, documentId, result: null }]); activity.start(); await tick(); expect(access.install).toHaveBeenCalledTimes(1); expect(row().state).toBe('working');
    vi.mocked(access.sample).mockImplementation(async (_id, lease) => [{ frameId: 0, result: { version: 1, requestId: lease.requestId, activationId, evidence } }]);
    await activity.hint(hint(), sender()); await tick(1000); expect(row().state).toBe('unknown');
  });
  it('does not register or query an independently denied provider', async () => {
    activity.start(); await tick(); expect(access.register).toHaveBeenCalledExactlyOnceWith('chatgpt-web'); expect(access.tabs).toHaveBeenCalledExactlyOnceWith('chatgpt-web');
    activity.reconcile('chatgpt-web'); await tick(); expect(access.register).toHaveBeenCalledTimes(1);
  });
  it('rechecks registration revision after a delayed permission confirmation across revoke/regrant', async () => {
    const pending = deferred<boolean>(); let checks = 0;
    vi.mocked(access.hasPermission).mockImplementation(async provider => {
      if (provider !== 'chatgpt-web') return false;
      return ++checks === 2 ? pending.promise : true;
    });
    activity.start(); await tick(); expect(checks).toBe(2); expect(access.register).not.toHaveBeenCalled();
    activity.revoke('chatgpt-web'); activity.reconcile('chatgpt-web'); pending.resolve(true); await tick();
    expect(access.register).toHaveBeenCalledExactlyOnceWith('chatgpt-web');
    expect(vi.mocked(access.unregister).mock.invocationCallOrder.at(-1)!).toBeLessThan(vi.mocked(access.register).mock.invocationCallOrder.at(-1)!);
    expect(row().state).toBe('working');
  });
  it('refuses a focus that became obsolete while its asynchronous validation was pending', async () => {
    activity.start(); await tick();
    vi.mocked(access.focus).mockImplementation(async (_provider, _tabId, current) => { activity.invalidateTab(1); expect(current()).toBe(false); throw new Error('expired'); });
    const focusing = expect(activity.focus(row().id)).rejects.toThrow('expired'); await tick(1000); await focusing;
  });
  it('fresh focus proof rejects a replaced same-URL document before any navigation event arrives', async () => {
    activity.start(); await tick(); const oldId = row().id;
    documentId = 'document-replaced-before-event';
    const focusing = expect(activity.focus(oldId)).rejects.toMatchObject({ code: 'navigation.changed' }); await tick(1000); await focusing;
    expect(access.sample).toHaveBeenCalledTimes(2); expect(access.focus).not.toHaveBeenCalled();
  });
  it('focus never joins a preexisting in-flight sample as proof', async () => {
    activity.start(); await tick(); const oldId = row().id;
    const slow = deferred<Awaited<ReturnType<ActivityAccess['sample']>>>(); vi.mocked(access.sample).mockReturnValueOnce(slow.promise);
    await activity.hint(hint(), sender()); await tick(1000);
    await expect(activity.focus(oldId)).rejects.toMatchObject({ code: 'navigation.changed' }); expect(access.focus).not.toHaveBeenCalled();
    slow.resolve([]); await tick();
  });
  it('schedules the latest provider when a tab changes origin during an old-provider sample', async () => {
    vi.mocked(access.hasPermission).mockResolvedValue(true);
    vi.mocked(access.tabs).mockImplementation(async provider => provider === 'claude-web' ? [{ ...currentTab(), url: 'https://claude.ai/chat/old' }] : []);
    vi.mocked(access.tab).mockResolvedValue({ ...currentTab(), url: 'https://claude.ai/chat/old' });
    const slow = deferred<Awaited<ReturnType<ActivityAccess['sample']>>>(); vi.mocked(access.sample).mockReturnValueOnce(slow.promise);
    activity.start(); await tick(); expect(access.sample).toHaveBeenCalledTimes(1);
    vi.mocked(access.tab).mockResolvedValue(currentTab()); activity.updateTab(1, { url: currentTab().url, status: 'complete' }, currentTab());
    slow.resolve([]); await tick(); await tick(1000);
    expect(access.sample).toHaveBeenCalledTimes(2); expect(row()).toMatchObject({ provider: 'chatgpt-web', state: 'working' });
  });
});

describe('next attention and mark all as seen', () => {
  const evidenceFor = new Map<number, ActivityEvidence>(), documents = new Map<number, string>(), activations = new Map<number, string>();
  const tabOf = (id: number) => ({ id, windowId: 2, url: `https://chatgpt.com/c/PRIVATE_URL_CANARY_${id}`, status: 'complete' });
  const byTab = (tabId: number) => activity.snapshot().observations.find(observation => observation.tabId === tabId)!;
  const focused = () => vi.mocked(access.focus).mock.calls.map(call => call[1]);
  // Tab events only request a sample; evidence is still pulled through the leased sample path.
  const raise = async (tabId: number, value: ActivityEvidence) => { evidenceFor.set(tabId, value); activity.updateTab(tabId, {}, tabOf(tabId)); await tick(1000); };
  beforeEach(() => {
    for (const id of [1, 2, 3]) { evidenceFor.set(id, 'working'); documents.set(id, `document-${id}`); activations.set(id, crypto.randomUUID()); }
    vi.mocked(access.tabs).mockImplementation(async () => [1, 2, 3].map(tabOf));
    vi.mocked(access.tab).mockImplementation(async id => tabOf(id));
    vi.mocked(access.sample).mockImplementation(async (tabId, lease) => [{ frameId: 0, documentId: documents.get(tabId), result: { version: 1, requestId: lease.requestId, activationId: activations.get(tabId)!, evidence: evidenceFor.get(tabId)! } }]);
  });
  it('focuses the earliest raised unacknowledged attention, ties on the lower tab ID, through the ordinary revalidated focus', async () => {
    // Reverse discovery order: records are kept higher tab first, so only the tab ID tie-break can choose tab 1 over tab 2.
    vi.mocked(access.tabs).mockImplementation(async () => [3, 2, 1].map(tabOf));
    activity.start(); await tick(); expect(activity.snapshot().observations.map(observation => observation.tabId)).toEqual([3, 2, 1]);
    await raise(3, 'input_required');
    evidenceFor.set(2, 'error_visible'); evidenceFor.set(1, 'error_visible'); activity.updateTab(2, {}, tabOf(2)); activity.updateTab(1, {}, tabOf(1)); await tick(1000);
    expect(byTab(1).attention!.raisedAt).toBe(byTab(2).attention!.raisedAt); expect(byTab(3).attention!.raisedAt).toBeLessThan(byTab(1).attention!.raisedAt);
    const samples = vi.mocked(access.sample).mock.calls.length, raised = byTab(3).attention!;
    const first = activity.focusNextAttention(); await tick(1000); expect(await first).toBe('focused');
    expect(focused()).toEqual([3]); expect(vi.mocked(access.sample).mock.calls.length).toBe(samples + 1);
    expect(byTab(3).attention).toEqual(raised);
    activity.acknowledge(byTab(3).id, raised.id);
    const second = activity.focusNextAttention(); await tick(1000); expect(await second).toBe('focused');
    expect(focused()).toEqual([3, 1]); expect(byTab(1).attention!.acknowledged).toBe(false);
  });
  it('skips expired attention and never focuses it', async () => {
    activity.start(); await tick();
    await raise(1, 'input_required'); await tick(10_000); await raise(2, 'error_visible'); await tick(4_500);
    expect(byTab(1)).toMatchObject({ state: 'unknown', unknownReason: 'expired' }); expect(byTab(2).state).toBe('attention');
    const attempts = vi.spyOn(activity, 'focus');
    const next = activity.focusNextAttention(); await tick(1000); expect(await next).toBe('focused');
    expect(attempts).toHaveBeenCalledExactlyOnceWith(byTab(2).id, byTab(2).attention!.id); expect(focused()).toEqual([2]);
  });
  it('falls back to the next candidate when revalidation or activation fails, bounded by the initial candidates', async () => {
    activity.start(); await tick(); await raise(2, 'input_required'); await raise(1, 'error_visible');
    documents.set(2, 'document-replaced-before-event');
    const next = activity.focusNextAttention(); for (let step = 0; step < 3; step++) await tick(1000);
    expect(await next).toBe('focused'); expect(focused()).toEqual([1]);
    vi.mocked(access.focus).mockRejectedValue(new Error('closed'));
    const failing = activity.focusNextAttention(); for (let step = 0; step < 4; step++) await tick(1000);
    expect(await failing).toBe('failed');
    expect(focused().slice(1).sort()).toEqual([1, 2]); expect(access.focus).toHaveBeenCalledTimes(3);
  });
  it('reports no candidate without sampling or focusing when nothing needs attention', async () => {
    activity.start(); await tick();
    const samples = vi.mocked(access.sample).mock.calls.length;
    expect(await activity.focusNextAttention()).toBe('none');
    await raise(1, 'input_required'); activity.acknowledge(byTab(1).id, byTab(1).attention!.id);
    expect(await activity.focusNextAttention()).toBe('none');
    expect(access.focus).not.toHaveBeenCalled(); expect(vi.mocked(access.sample).mock.calls.length).toBe(samples + 1);
  });
  it('keeps the earliest candidate when a routine sample timer is already armed for its tab', async () => {
    let slow = false;
    vi.mocked(access.sample).mockImplementation(async (tabId, lease) => {
      if (slow) await new Promise(resolve => setTimeout(resolve, 40));
      return [{ frameId: 0, documentId: documents.get(tabId), result: { version: 1, requestId: lease.requestId, activationId: activations.get(tabId)!, evidence: evidenceFor.get(tabId)! } }];
    });
    activity.start(); await tick(); await raise(2, 'input_required'); await raise(1, 'input_required');
    // A routine sample of tab 2 just ran; a hint 300 ms later arms the per-tab timer for the same deadline focus waits for.
    activity.updateTab(2, {}, tabOf(2)); await tick(); await tick(300); slow = true; activity.updateTab(2, {}, tabOf(2));
    const next = activity.focusNextAttention(); await tick(1000); expect(await next).toBe('focused'); expect(focused()).toEqual([2]);
    activity.acknowledge(byTab(1).id, byTab(1).attention!.id); await tick(300); activity.updateTab(2, {}, tabOf(2));
    const sole = activity.focusNextAttention(); await tick(1000); expect(await sole).toBe('focused'); expect(focused()).toEqual([2, 2]);
    // The routine request the timer carried is served by focus's own fresh sample, not dropped.
    activity.updateTab(2, {}, tabOf(2)); const samples = vi.mocked(access.sample).mock.calls.length; await tick(1000);
    expect(vi.mocked(access.sample).mock.calls.length).toBe(samples + 1);
  });
  it('a focus attempt that fails after its rate wait still serves the routine sample it displaced', async () => {
    activity.start(); await tick(); await raise(1, 'input_required');
    activity.updateTab(1, {}, tabOf(1)); await tick(); await tick(300); activity.updateTab(1, {}, tabOf(1));
    const samples = vi.mocked(access.sample).mock.calls.length;
    const next = activity.focusNextAttention(); activity.acknowledge(byTab(1).id, byTab(1).attention!.id);
    await tick(1000); expect(await next).toBe('failed'); expect(access.focus).not.toHaveBeenCalled();
    expect(vi.mocked(access.sample).mock.calls.length).toBe(samples + 1);
  });
  it('moves on when the fresh focus sample shows the candidate no longer needs review', async () => {
    activity.start(); await tick(); await raise(1, 'input_required'); await raise(2, 'input_required');
    evidenceFor.set(1, 'working');
    const next = activity.focusNextAttention(); for (let step = 0; step < 2; step++) await tick(1000);
    expect(await next).toBe('focused'); expect(focused()).toEqual([2]);
    expect(byTab(1)).toMatchObject({ state: 'working' }); expect(byTab(1).attention).toBeUndefined();
    // The panel's Open session keeps its ordinary meaning: it focuses a current session whatever its state.
    const open = activity.focus(byTab(1).id); await tick(1000); await open; expect(focused()).toEqual([2, 1]);
  });
  it('joins repeated presses to the running attempt instead of racing onto a later candidate', async () => {
    activity.start(); await tick(); await raise(2, 'input_required'); await raise(1, 'input_required');
    const first = activity.focusNextAttention(), second = activity.focusNextAttention();
    expect(second).toBe(first); await tick(1000); expect(await first).toBe('focused'); expect(focused()).toEqual([2]);
  });
  it('marks every current attention as seen locally, returns the count and clears the badge', async () => {
    activity.start(); await tick(); await raise(1, 'input_required'); await raise(2, 'error_visible');
    expect(access.badge).toHaveBeenLastCalledWith('2');
    const before = activity.snapshot().observations; vi.mocked(access.notify).mockClear();
    expect(activity.acknowledgeAll()).toBe(2); await tick();
    expect(access.badge).toHaveBeenLastCalledWith(''); expect(access.notify).toHaveBeenCalled();
    const after = activity.snapshot().observations;
    expect(after.map(observation => observation.attention && { ...observation.attention, acknowledged: false })).toEqual(before.map(observation => observation.attention));
    expect(after.filter(observation => observation.attention).every(observation => observation.attention!.acknowledged)).toBe(true);
    expect(byTab(3)).toMatchObject({ state: 'working' }); expect(access.focus).not.toHaveBeenCalled();
    expect(activity.acknowledgeAll()).toBe(0);
    await raise(3, 'input_required'); expect(byTab(3).attention!.acknowledged).toBe(false); expect(access.badge).toHaveBeenLastCalledWith('1');
    expect(JSON.stringify(activity.snapshot())).not.toMatch(/PRIVATE_URL|https:|documentId|activationId/);
  });
  it('limits mark all to the attention identities shown and ignores replaced, unknown or expired ones', async () => {
    activity.start(); await tick(); await raise(1, 'input_required'); await raise(2, 'input_required');
    const shown = [byTab(1).attention!.id, byTab(2).attention!.id];
    await raise(2, 'error_visible');
    expect(activity.acknowledgeAll([...shown, crypto.randomUUID()])).toBe(1); await tick();
    expect(byTab(1).attention!.acknowledged).toBe(true); expect(byTab(2).attention).toMatchObject({ reason: 'error_visible', acknowledged: false });
    expect(access.badge).toHaveBeenLastCalledWith('1');
    now += ACTIVITY_TTL; expect(activity.acknowledgeAll()).toBe(0);
    expect(activity.snapshot().observations.every(observation => observation.state === 'unknown' && !observation.attention)).toBe(true);
  });
});
