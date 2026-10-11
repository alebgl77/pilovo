import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { WebActivity, type ActivityAccess, type ActivityView } from '../../src/background/activity';
import { makeUnknown, newActivityRecord, reduceActivity } from '../../src/background/activity-reducer';
import { BADGE_COLORS, BADGE_TEXT_COLOR } from '../../src/background/activity-badge';
import { activityHintSchema, activitySampleSchema, ACTIVITY_TTL, type ActivityEvidence, type ActivityLease } from '../../src/shared/activity';
import type { WebTab } from '../../src/platform/web';

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
const painted = () => vi.mocked(access.badge).mock.lastCall?.[0];
const deferred = <T>() => { let resolve!: (value: T) => void; const promise = new Promise<T>(done => { resolve = done; }); return { promise, resolve }; };
beforeEach(() => {
  vi.useFakeTimers(); now = 1_000_000; evidence = 'working'; documentId = 'chrome-document'; activationId = crypto.randomUUID();
  access = {
    runtimeId: 'extension', now: () => now, wall: () => 1234,
    hasPermission: vi.fn(async provider => provider === 'chatgpt-web'), tabs: vi.fn(async () => [currentTab()]), tab: vi.fn(async () => currentTab()),
    register: vi.fn(async () => undefined), unregister: vi.fn(async () => undefined), install: vi.fn(async () => undefined), dispose: vi.fn(async () => undefined),
    sample: vi.fn(async (_tab, lease) => [{ frameId: 0, documentId, result: { version: 1, requestId: lease.requestId, activationId, evidence } }]),
    focus: vi.fn(async (_provider, _tabId, current) => { if (!current()) throw new Error('expired'); }), badge: vi.fn(async () => undefined), notify: vi.fn(),
    viewing: vi.fn(async () => undefined),
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
    expect(row().attention!.acknowledged).toBe(true); expect(painted()).toMatchObject({ text: '', title: 'Pilovo' });
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
    expect(Object.keys(row()).sort()).toEqual(['id', 'observedAt', 'provenance', 'provider', 'sessionNumber', 'state', 'stateSince', 'tabId', 'validUntil', 'windowId']);
  });
  it('expires strictly using monotonic epoch even if wall clock moves backwards', async () => {
    activity.start(); await tick(); now += ACTIVITY_TTL; expect(row()).toMatchObject({ state: 'unknown', unknownReason: 'expired' });
    await expect(activity.focus(row().id)).rejects.toMatchObject({ code: 'navigation.expired' });
  });
  it.each([['working', '…', 'Pilovo — 1 en cours'], ['input_required', '1', 'Pilovo — 1 à vérifier (intervention demandée)']] as const)('clears a %s badge at expiry by the watchdog alone, on a fractional clock', async (value, text, title) => {
    // The real clock is fractional and setTimeout truncates its delay, so a watchdog armed on the exact remaining time can
    // run a fraction of a millisecond before validUntil. Here the clock follows the fake timers and each sample takes 0.4 ms.
    const start = Date.now(); let latency = 0.5;
    access.now = () => 1_000_000 + (Date.now() - start) + latency;
    const reply = vi.mocked(access.sample).getMockImplementation()!;
    vi.mocked(access.sample).mockImplementation(async (tabId, lease) => { latency += 0.4; return reply(tabId, lease); });
    evidence = value; activity.start(); await vi.advanceTimersByTimeAsync(0);
    expect(painted()).toMatchObject({ text, title });
    const { validUntil } = row(); expect(validUntil - access.now()).toBeCloseTo(ACTIVITY_TTL - 0.4, 6);
    // No snapshot, hint, acknowledgement or alarm: only the timers run, to just past validUntil.
    await vi.advanceTimersByTimeAsync(Math.ceil(validUntil - access.now()) + 1);
    expect(painted()).toMatchObject({ text: '', title: 'Pilovo' });
    expect((activity as unknown as { records: Map<number, { observation: { state: string; unknownReason?: string } }> }).records.get(1)!.observation).toMatchObject({ state: 'unknown', unknownReason: 'expired' });
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
    activity = new WebActivity(access); expect(activity.snapshot().observations).toEqual([]); await tick(); expect(painted()).toMatchObject({ text: '', title: 'Pilovo' });
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
  it('focus never joins a preexisting in-flight sample as proof: it waits for it, then takes its own', async () => {
    activity.start(); await tick(); const oldId = row().id;
    const slow = deferred<Awaited<ReturnType<ActivityAccess['sample']>>>(); vi.mocked(access.sample).mockReturnValueOnce(slow.promise);
    await activity.hint(hint(), sender()); await tick(1000);
    const calls = vi.mocked(access.sample).mock.calls.length;
    let settled = false; const focusing = activity.focus(oldId).finally(() => { settled = true; });
    await tick(1500); expect(settled).toBe(false); expect(access.focus).not.toHaveBeenCalled();
    slow.resolve([{ frameId: 0, documentId, result: { version: 1, requestId: vi.mocked(access.sample).mock.calls[calls - 1][1].requestId, activationId, evidence } }]);
    await tick(1000); await focusing;
    expect(access.focus).toHaveBeenCalledOnce();
    // The proof is a later sample with its own lease, never the one that was in flight.
    const proof = vi.mocked(access.sample).mock.calls.at(-1)![1];
    expect(vi.mocked(access.sample).mock.calls.length).toBeGreaterThan(calls);
    expect(proof.requestId).not.toBe(vi.mocked(access.sample).mock.calls[calls - 1][1].requestId);
  });
  it('focus fails without activating when the in-flight sample it waited for invalidates the row', async () => {
    activity.start(); await tick(); const oldId = row().id;
    const slow = deferred<Awaited<ReturnType<ActivityAccess['sample']>>>(); vi.mocked(access.sample).mockReturnValueOnce(slow.promise);
    await activity.hint(hint(), sender()); await tick(1000);
    const focusing = expect(activity.focus(oldId)).rejects.toMatchObject({ code: 'navigation.changed' });
    slow.resolve([{ frameId: 0, documentId, result: { version: 1, requestId: crypto.randomUUID(), activationId, evidence } }]);
    await tick(1000); await focusing; expect(access.focus).not.toHaveBeenCalled();
    // The invalid in-flight result downgraded the row, so the old identity can no longer authorize activation.
    await expect(activity.focus(oldId)).rejects.toMatchObject({ code: 'navigation.expired' }); expect(access.focus).not.toHaveBeenCalled();
  });
  it('routine hints arriving while focus waits for the rate bound cannot take its sample slot', async () => {
    // Real conditions: fractional monotonic time and executeScript latency. A hint's truncated delay used to arm a
    // routine sample about 1 ms before focus woke, still in flight when focus checked the slot (navigation.changed).
    const reply = vi.mocked(access.sample).getMockImplementation()!;
    vi.mocked(access.sample).mockImplementation(async (tab, lease) => { await new Promise(resolve => setTimeout(resolve, 20)); return reply(tab, lease); });
    activity.start(); await tick(100); const oldId = row().id; const before = vi.mocked(access.sample).mock.calls.length;
    const focusing = activity.focus(oldId);
    for (let i = 0; i < 4; i++) { now += 0.5; await activity.hint(hint(i + 1), sender()); await tick(200); }
    await tick(300); await focusing;
    expect(access.focus).toHaveBeenCalledOnce();
    expect(vi.mocked(access.sample).mock.calls.length).toBe(before + 1);
    // Focus's own fresh sample served the hints it held back; routine scheduling then resumes normally.
    await tick(2000); expect(vi.mocked(access.sample).mock.calls.length).toBe(before + 1);
    await activity.hint(hint(9), sender()); await tick(1100); expect(vi.mocked(access.sample).mock.calls.length).toBe(before + 2);
  });
  it('after awaiting an in-flight sample, focus still respects the per-tab rate bound before its own sample', async () => {
    activity.start(); await tick(); const oldId = row().id;
    const slow = deferred<Awaited<ReturnType<ActivityAccess['sample']>>>(); vi.mocked(access.sample).mockReturnValueOnce(slow.promise);
    await activity.hint(hint(), sender()); await tick(1000);
    const started = now, calls = vi.mocked(access.sample).mock.calls.length, inFlight = vi.mocked(access.sample).mock.calls.at(-1)![1];
    const focusing = activity.focus(oldId);
    await tick(50); slow.resolve([{ frameId: 0, documentId, result: { version: 1, requestId: inFlight.requestId, activationId, evidence } }]);
    // Let focus resume at this instant so the harness clock and timers agree when it computes its wait.
    await tick(0); await tick(100); expect(vi.mocked(access.sample).mock.calls.length).toBe(calls);
    await tick(started + 990 - now); expect(vi.mocked(access.sample).mock.calls.length).toBe(calls); expect(access.focus).not.toHaveBeenCalled();
    await tick(20); await focusing;
    expect(vi.mocked(access.sample).mock.calls.length).toBe(calls + 1); expect(access.focus).toHaveBeenCalledOnce();
  });
  it('closing the tab while focus waits rejects focus and starts no further sample', async () => {
    activity.start(); await tick(); const oldId = row().id;
    const focusing = expect(activity.focus(oldId)).rejects.toMatchObject({ code: 'navigation.changed' });
    await activity.hint(hint(), sender()); activity.invalidateTab(1, true);
    await tick(1000); await focusing;
    const calls = vi.mocked(access.sample).mock.calls.length; await tick(2000);
    expect(vi.mocked(access.sample).mock.calls.length).toBe(calls); expect(activity.snapshot().observations).toEqual([]);
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
  it('marks every current attention as seen locally, returns the count and lowers the badge to the remaining work', async () => {
    activity.start(); await tick(); await raise(1, 'input_required'); await raise(2, 'error_visible');
    expect(painted()).toMatchObject({ text: '2', background: BADGE_COLORS.error_visible });
    const before = activity.snapshot().observations; vi.mocked(access.notify).mockClear();
    expect(activity.acknowledgeAll()).toBe(2); await tick();
    // Tab 3 still works: the badge drops the count and shows work in progress.
    expect(painted()).toMatchObject({ text: '…', background: BADGE_COLORS.working, title: 'Pilovo — 1 en cours' }); expect(access.notify).toHaveBeenCalled();
    const after = activity.snapshot().observations;
    expect(after.map(observation => observation.attention && { ...observation.attention, acknowledged: false })).toEqual(before.map(observation => observation.attention));
    expect(after.filter(observation => observation.attention).every(observation => observation.attention!.acknowledged)).toBe(true);
    expect(byTab(3)).toMatchObject({ state: 'working' }); expect(access.focus).not.toHaveBeenCalled();
    expect(activity.acknowledgeAll()).toBe(0);
    await raise(3, 'input_required'); expect(byTab(3).attention!.acknowledged).toBe(false); expect(painted()).toMatchObject({ text: '1', background: BADGE_COLORS.input_required, textColor: BADGE_TEXT_COLOR });
    expect(JSON.stringify(activity.snapshot())).not.toMatch(/PRIVATE_URL|https:|documentId|activationId/);
  });
  it('limits mark all to the attention identities shown and ignores replaced, unknown or expired ones', async () => {
    activity.start(); await tick(); await raise(1, 'input_required'); await raise(2, 'input_required');
    const shown = [byTab(1).attention!.id, byTab(2).attention!.id];
    await raise(2, 'error_visible');
    expect(activity.acknowledgeAll([...shown, crypto.randomUUID()])).toBe(1); await tick();
    expect(byTab(1).attention!.acknowledged).toBe(true); expect(byTab(2).attention).toMatchObject({ reason: 'error_visible', acknowledged: false });
    expect(painted()).toMatchObject({ text: '1', background: BADGE_COLORS.error_visible });
    now += ACTIVITY_TTL; expect(activity.acknowledgeAll()).toBe(0);
    expect(activity.snapshot().observations.every(observation => observation.state === 'unknown' && !observation.attention)).toBe(true);
  });
});

describe('differentiated toolbar badge', () => {
  const evidenceFor = new Map<number, ActivityEvidence>(), documents = new Map<number, string>(), activations = new Map<number, string>();
  const tabOf = (id: number) => ({ id, windowId: 2, url: `https://chatgpt.com/c/PRIVATE_URL_CANARY_${id}`, status: 'complete' });
  const byTab = (tabId: number) => activity.snapshot().observations.find(observation => observation.tabId === tabId)!;
  const paints = () => vi.mocked(access.badge).mock.calls.length;
  const raise = async (tabId: number, value: ActivityEvidence) => { evidenceFor.set(tabId, value); activity.updateTab(tabId, {}, tabOf(tabId)); await tick(1000); };
  // Witnessed work, then two ready reads one second apart (the sample after the first is rescheduled by the debounce).
  const ready = async (tabId: number) => { await raise(tabId, 'working'); await raise(tabId, 'idle_ready'); await tick(1000); expect(byTab(tabId).attention!.reason).toBe('response_ready'); };
  const lit = (text: string, background: string, title: string) => ({ text, background, textColor: BADGE_TEXT_COLOR, title });
  const hidden = { text: '', title: 'Pilovo' };
  beforeEach(() => {
    for (const id of [1, 2, 3]) { evidenceFor.set(id, 'idle_ready'); documents.set(id, `document-${id}`); activations.set(id, crypto.randomUUID()); }
    vi.mocked(access.tabs).mockImplementation(async () => [1, 2, 3].map(tabOf));
    vi.mocked(access.tab).mockImplementation(async id => tabOf(id));
    vi.mocked(access.sample).mockImplementation(async (tabId, lease) => [{ frameId: 0, documentId: documents.get(tabId), result: { version: 1, requestId: lease.requestId, activationId: activations.get(tabId)!, evidence: evidenceFor.get(tabId)! } }]);
  });
  it('paints none, working only, response ready, input plus ready and error plus others from live observations', async () => {
    activity.start(); await tick(); expect(activity.snapshot().observations.map(observation => observation.state)).toEqual(['idle', 'idle', 'idle']);
    expect(painted()).toMatchObject(hidden); expect(paints()).toBe(1);
    await raise(1, 'working'); expect(painted()).toEqual(lit('…', BADGE_COLORS.working, 'Pilovo — 1 en cours'));
    await raise(2, 'working'); expect(painted()).toEqual(lit('…', BADGE_COLORS.working, 'Pilovo — 2 en cours'));
    await raise(2, 'idle_ready'); await tick(1000); expect(byTab(2).attention!.reason).toBe('response_ready');
    expect(painted()).toEqual(lit('1', BADGE_COLORS.response_ready, 'Pilovo — 1 à vérifier (réponse disponible) · 1 en cours'));
    await raise(3, 'input_required'); expect(painted()).toEqual(lit('2', BADGE_COLORS.input_required, 'Pilovo — 2 à vérifier, dont 1 intervention demandée · 1 en cours'));
    await raise(1, 'error_visible'); expect(painted()).toEqual(lit('3', BADGE_COLORS.error_visible, 'Pilovo — 3 à vérifier, dont 1 erreur visible'));
    // Seen attention leaves the count, and so the color, to what still needs review.
    activity.acknowledge(byTab(1).id, byTab(1).attention!.id); await tick();
    expect(painted()).toEqual(lit('2', BADGE_COLORS.input_required, 'Pilovo — 2 à vérifier, dont 1 intervention demandée'));
    activity.acknowledge(byTab(3).id, byTab(3).attention!.id); await tick(); expect(painted()).toEqual(lit('1', BADGE_COLORS.response_ready, 'Pilovo — 1 à vérifier (réponse disponible)'));
    // Acknowledged attention only: hidden, whatever its reason.
    expect(activity.acknowledgeAll()).toBe(1); await tick(); expect(painted()).toMatchObject(hidden);
    expect(activity.snapshot().observations.every(observation => observation.state === 'attention' && observation.attention!.acknowledged)).toBe(true);
    expect(JSON.stringify(vi.mocked(access.badge).mock.calls)).not.toMatch(/PRIVATE_URL|https:|chatgpt|ChatGPT|session|document-|[0-9a-f]{8}-[0-9a-f]{4}-/);
  });
  it('downgrades through the expiry watchdog, and clears after revoke, tab close or a worker restart', async () => {
    // Each sample runs at `tick()` time (the tab's 1 s rate window has passed), so the watchdog is armed on the test clock.
    const sampleNow = async (tabId: number, value: ActivityEvidence) => { evidenceFor.set(tabId, value); activity.updateTab(tabId, {}, tabOf(tabId)); await tick(); };
    activity.start(); await tick(); await tick(1000); await sampleNow(1, 'error_visible'); await sampleNow(2, 'working');
    await tick(1000); await sampleNow(2, 'working');
    expect(painted()).toEqual(lit('1', BADGE_COLORS.error_visible, 'Pilovo — 1 à vérifier (erreur visible) · 1 en cours'));
    // No renewal and no snapshot read: idle tab 3 expires (no change), then the error, leaving the work, then the work.
    const expiries = [byTab(3).validUntil, byTab(1).validUntil, byTab(2).validUntil];
    expect(expiries).toEqual([now + 13_000, now + 14_000, now + 15_000]);
    await tick(expiries[0] - now); await tick(); expect(painted()).toEqual(lit('1', BADGE_COLORS.error_visible, 'Pilovo — 1 à vérifier (erreur visible) · 1 en cours'));
    await tick(expiries[1] - now); await tick(); expect(painted()).toEqual(lit('…', BADGE_COLORS.working, 'Pilovo — 1 en cours'));
    await tick(expiries[2] - now); await tick(); expect(painted()).toMatchObject(hidden);
    expect(activity.snapshot().observations.map(observation => [observation.state, observation.unknownReason])).toEqual([['unknown', 'expired'], ['unknown', 'expired'], ['unknown', 'expired']]);
    await raise(1, 'input_required'); await raise(2, 'working'); expect(painted()).toMatchObject({ text: '1', background: BADGE_COLORS.input_required });
    activity.revoke('chatgpt-web'); await tick(); expect(painted()).toMatchObject(hidden);
    activity.reconcile('chatgpt-web'); await tick(1000); expect(painted()).toMatchObject({ text: '1', background: BADGE_COLORS.input_required, title: 'Pilovo — 1 à vérifier (intervention demandée) · 1 en cours' });
    activity.invalidateTab(1, true); await tick(); expect(painted()).toEqual(lit('…', BADGE_COLORS.working, 'Pilovo — 1 en cours'));
    activity.invalidateTab(2, true); await tick(); expect(painted()).toMatchObject(hidden);
    await raise(3, 'error_visible'); expect(painted()).toMatchObject({ text: '1', background: BADGE_COLORS.error_visible });
    // A new worker life paints hidden before any evidence, then needs fresh evidence to light it again.
    const before = paints(); activity = new WebActivity(access); await tick();
    expect(paints()).toBe(before + 1); expect(painted()).toMatchObject(hidden);
    activity.start(); await tick(); expect(painted()).toEqual(lit('2', BADGE_COLORS.error_visible, 'Pilovo — 2 à vérifier, dont 1 erreur visible · 1 en cours'));
  });
  it('makes no badge call while the painted value is unchanged and repaints after a failed call', async () => {
    activity.start(); await tick(); expect(paints()).toBe(1);
    for (let step = 0; step < 3; step++) await raise(1, 'idle_ready');
    expect(paints()).toBe(1);
    await raise(1, 'working'); expect(paints()).toBe(2);
    for (let step = 0; step < 3; step++) await raise(1, 'working');
    expect(activity.acknowledgeAll()).toBe(0); await tick(); expect(paints()).toBe(2);
    vi.mocked(access.badge).mockRejectedValueOnce(new Error('action unavailable'));
    await raise(2, 'input_required'); expect(paints()).toBe(3);
    // The same value is attempted again on the next change, then remembered.
    await raise(2, 'input_required'); expect(paints()).toBe(4); expect(vi.mocked(access.badge).mock.calls[3][0]).toEqual(vi.mocked(access.badge).mock.calls[2][0]);
    await raise(2, 'input_required'); expect(paints()).toBe(4);
  });
  it('follows the app language for the title only, without repainting when it does not change', async () => {
    activity.start(); await tick(); await raise(1, 'input_required'); await ready(2); await raise(3, 'working');
    expect(painted()).toEqual(lit('2', BADGE_COLORS.input_required, 'Pilovo — 2 à vérifier, dont 1 intervention demandée · 1 en cours'));
    const count = paints();
    activity.setLanguage('fr'); await tick(); expect(paints()).toBe(count);
    activity.setLanguage('en'); await tick(); expect(paints()).toBe(count + 1);
    expect(painted()).toEqual(lit('2', BADGE_COLORS.input_required, 'Pilovo — 2 to review, including 1 input request · 1 working'));
    activity.setLanguage('en'); await tick(); expect(paints()).toBe(count + 1);
    // Unexpected values fall back to the default language, French.
    activity.setLanguage('de'); await tick(); expect(painted()!.title).toBe('Pilovo — 2 à vérifier, dont 1 intervention demandée · 1 en cours');
    activity.setLanguage('en'); activity.acknowledgeAll(); await tick(); expect(painted()).toEqual(lit('…', BADGE_COLORS.working, 'Pilovo — 1 working'));
  });
});

describe('stable session identity: numbers, positions and labels', () => {
  const urls = new Map<number, string>(), indices = new Map<number, number | undefined>(), windows = new Map<number, number>();
  const documents = new Map<number, string>(), activations = new Map<number, string>();
  const gpt = (id: number) => `https://chatgpt.com/c/PRIVATE_URL_CANARY_${id}`, claude = (id: number) => `https://claude.ai/chat/PRIVATE_URL_CANARY_${id}`;
  const tabOf = (id: number): WebTab => ({ id, windowId: windows.get(id) ?? 2, index: indices.get(id), url: urls.get(id), status: 'complete' });
  const byTab = (tabId: number) => activity.snapshot().observations.find(observation => observation.tabId === tabId);
  const numbers = () => Object.fromEntries(activity.snapshot().observations.map(observation => [observation.tabId, observation.sessionNumber]));
  const samples = () => vi.mocked(access.sample).mock.calls.length;
  // A tab event only requests a sample; the session is assigned when that leased sample commits.
  const open = async (id: number, url: string, index?: number) => { urls.set(id, url); indices.set(id, index); documents.set(id, `document-${id}`); activations.set(id, crypto.randomUUID()); activity.updateTab(id, {}, tabOf(id)); await tick(1000); };
  const go = async (id: number, url: string) => { urls.set(id, url); activity.updateTab(id, { url }, tabOf(id)); await tick(1000); };
  const refused = (call: () => void) => { try { call(); } catch (error) { return (error as { code?: string }).code; } return undefined; };
  beforeEach(() => {
    for (const map of [urls, indices, windows, documents, activations]) map.clear();
    vi.mocked(access.hasPermission).mockResolvedValue(true);
    vi.mocked(access.tabs).mockImplementation(async provider => [...urls.keys()].filter(id => urls.get(id)!.startsWith(provider === 'claude-web' ? 'https://claude.ai/' : 'https://chatgpt.com/')).map(tabOf));
    vi.mocked(access.tab).mockImplementation(async id => { if (!urls.has(id)) throw new Error('No tab with id'); return tabOf(id); });
    vi.mocked(access.sample).mockImplementation(async (tabId, lease) => [{ frameId: 0, documentId: documents.get(tabId), result: { version: 1, requestId: lease.requestId, activationId: activations.get(tabId)!, evidence: 'working' } }]);
  });
  it('numbers each provider from 1 at first observation; another tab closing never renumbers; the smallest free number is reused', async () => {
    activity.start(); await tick();
    await open(1, gpt(1)); await open(2, gpt(2)); await open(3, gpt(3)); await open(7, claude(7));
    expect(numbers()).toEqual({ 1: 1, 2: 2, 3: 3, 7: 1 });
    activity.invalidateTab(2, true); urls.delete(2);
    expect(numbers()).toEqual({ 1: 1, 3: 3, 7: 1 });
    await open(4, gpt(4)); await open(8, claude(8));
    expect(numbers()).toEqual({ 1: 1, 3: 3, 4: 2, 7: 1, 8: 2 });
    await open(5, gpt(5)); expect(byTab(5)!.sessionNumber).toBe(4);
    // Later samples, hints and refreshes never move a number.
    for (const id of [1, 3, 4, 5]) activity.updateTab(id, {}, tabOf(id));
    await activity.refresh(); await tick(1000);
    expect(numbers()).toEqual({ 1: 1, 3: 3, 4: 2, 5: 4, 7: 1, 8: 2 });
  });
  it('keeps the number and label across SPA routes, reloads, new documents, discarding and expiry in the same tab', async () => {
    activity.start(); await tick(); await open(1, gpt(1)); await open(2, gpt(2));
    activity.label(byTab(2)!.id, 'Revue contrat');
    const ids = new Set([byTab(2)!.id]);
    // An SPA route invalidates the record at once (navigation), then a new activation gives a new observation identity.
    urls.set(2, `${gpt(2)}/route`); activity.updateTab(2, { url: urls.get(2) }, tabOf(2));
    expect(byTab(2)).toMatchObject({ state: 'unknown', unknownReason: 'navigation', sessionNumber: 2, label: 'Revue contrat' }); ids.add(byTab(2)!.id);
    activations.set(2, crypto.randomUUID()); await tick(1000);
    expect(byTab(2)).toMatchObject({ state: 'working', sessionNumber: 2, label: 'Revue contrat' }); ids.add(byTab(2)!.id);
    // A reload: loading, then a new document.
    documents.set(2, 'document-2-reloaded'); activity.updateTab(2, { status: 'loading' }, { ...tabOf(2), status: 'loading' });
    activity.updateTab(2, { status: 'complete' }, tabOf(2)); await tick(1000);
    expect(byTab(2)).toMatchObject({ state: 'working', sessionNumber: 2, label: 'Revue contrat' }); ids.add(byTab(2)!.id);
    activity.updateTab(2, { discarded: true }); expect(byTab(2)).toMatchObject({ state: 'unknown', sessionNumber: 2, label: 'Revue contrat' });
    activity.updateTab(2, { discarded: false }, tabOf(2)); await tick(1000);
    // Expired evidence: a later sample starts a new record, still the same tab.
    now += ACTIVITY_TTL; expect(byTab(2)).toMatchObject({ state: 'unknown', unknownReason: 'expired', sessionNumber: 2, label: 'Revue contrat' });
    activity.updateTab(2, {}, tabOf(2)); await tick(1000); expect(byTab(2)).toMatchObject({ state: 'working', sessionNumber: 2, label: 'Revue contrat' }); ids.add(byTab(2)!.id);
    expect(ids.size).toBeGreaterThanOrEqual(4);
    expect(byTab(1)).toMatchObject({ sessionNumber: 1 }); expect(byTab(1)!.label).toBeUndefined();
  });
  it('releases numbers when a tab leaves its provider; labels stay with the open tab until it closes, its provider is revoked or the worker restarts', async () => {
    activity.start(); await tick(); await open(1, gpt(1)); await open(2, gpt(2)); await open(7, claude(7));
    activity.label(byTab(1)!.id, 'Alpha'); activity.label(byTab(7)!.id, 'Gamma');
    // Leaving the provider ends the session: coming back later gets the smallest number free then. The label is bound to
    // the tab's lifetime, not to its number: hidden while the tab is elsewhere, shown again when it returns.
    await go(1, 'https://example.test/elsewhere');
    expect(byTab(1)).toBeUndefined(); expect(numbers()).toEqual({ 2: 2, 7: 1 });
    await open(3, gpt(3)); expect(byTab(3)!.sessionNumber).toBe(1);
    await go(1, gpt(1)); expect(byTab(1)).toMatchObject({ provider: 'chatgpt-web', sessionNumber: 3, label: 'Alpha' });
    // Switching provider in the same tab releases the old number at once and never shows the label on the other provider.
    activity.label(byTab(2)!.id, 'Beta');
    urls.set(2, claude(2)); activity.updateTab(2, { url: urls.get(2) }, tabOf(2));
    expect(byTab(2)).toBeUndefined(); await tick(1000);
    expect(byTab(2)).toMatchObject({ provider: 'claude-web', sessionNumber: 2 }); expect(byTab(2)).not.toHaveProperty('label');
    await open(4, gpt(4)); expect(byTab(4)!.sessionNumber).toBe(2);
    // Revocation clears that provider's numbers and labels only, including the label of a tab currently elsewhere.
    activity.label(byTab(3)!.id, 'Delta');
    activity.revoke('claude-web'); expect(activity.snapshot().observations.map(observation => observation.provider)).not.toContain('claude-web');
    expect(byTab(3)).toMatchObject({ sessionNumber: 1, label: 'Delta' }); expect(byTab(1)!.label).toBe('Alpha');
    activity.reconcile('claude-web'); await tick(1000);
    expect([byTab(2)!.sessionNumber, byTab(7)!.sessionNumber].sort()).toEqual([1, 2]); expect(byTab(7)).not.toHaveProperty('label');
    // Tab 2 returns to ChatGPT: the label it was given there is shown again, with a new number.
    await go(2, gpt(2)); expect(byTab(2)).toMatchObject({ provider: 'chatgpt-web', sessionNumber: 4, label: 'Beta' });
    await go(2, 'https://example.test/elsewhere'); activity.revoke('chatgpt-web'); activity.reconcile('chatgpt-web'); await tick(1000);
    await go(2, gpt(2)); expect(byTab(2)).toMatchObject({ provider: 'chatgpt-web' }); expect(byTab(2)).not.toHaveProperty('label');
    expect(activity.snapshot().observations.some(observation => 'label' in observation)).toBe(false);
    // Closing a tab while it is elsewhere drops its label too: a later tab with the same ID starts unlabeled.
    activity.label(byTab(1)!.id, 'Epsilon'); await go(1, 'https://example.test/elsewhere');
    activity.invalidateTab(1, true); await go(1, gpt(1)); expect(byTab(1)).not.toHaveProperty('label');
    activity.label(byTab(3)!.id, 'Zeta'); activity.label(byTab(7)!.id, 'Eta'); expect(byTab(3)!.label).toBe('Zeta');
    // A worker restart keeps nothing: fresh numbers in observation order, no label.
    activity = new WebActivity(access); expect(activity.snapshot().observations).toEqual([]);
    activity.start(); await tick(1000);
    expect(numbers()).toEqual({ 1: 1, 2: 2, 3: 3, 4: 4, 7: 1 });
    expect(activity.snapshot().observations.some(observation => 'label' in observation)).toBe(false);
  });
  it('carries Chrome tab positions and re-reads them on tab moves without sampling, painting or changing state', async () => {
    activity.start(); await tick(); await open(1, gpt(1), 0); await open(2, gpt(2), 4); await open(3, gpt(3));
    expect(byTab(1)!.tabIndex).toBe(0); expect(byTab(2)!.tabIndex).toBe(4); expect(byTab(3)).not.toHaveProperty('tabIndex');
    const before = samples(), paints = vi.mocked(access.badge).mock.calls.length, states = activity.snapshot().observations.map(observation => [observation.id, observation.state]);
    vi.mocked(access.notify).mockClear();
    indices.set(1, 2); indices.set(2, 1); indices.set(3, 7); windows.set(2, 5);
    await activity.reindex();
    expect(byTab(1)).toMatchObject({ tabIndex: 2, windowId: 2 }); expect(byTab(2)).toMatchObject({ tabIndex: 1, windowId: 5 }); expect(byTab(3)!.tabIndex).toBe(7);
    expect(activity.snapshot().observations.map(observation => [observation.id, observation.state])).toEqual(states);
    expect(samples()).toBe(before); expect(access.notify).toHaveBeenCalled(); expect(vi.mocked(access.badge).mock.calls.length).toBe(paints);
    // Nothing moved: no notification. Invalid positions and unreadable tabs leave the last known position.
    vi.mocked(access.notify).mockClear(); await activity.reindex(); expect(access.notify).not.toHaveBeenCalled();
    indices.set(1, -1); indices.set(2, 1.5); urls.delete(3); await activity.reindex();
    expect(byTab(1)!.tabIndex).toBe(2); expect(byTab(2)!.tabIndex).toBe(1); expect(byTab(3)!.tabIndex).toBe(7);
    // Each committed sample refreshes the position as well.
    indices.set(1, 6); activity.updateTab(1, {}, tabOf(1)); await tick(1000); expect(byTab(1)!.tabIndex).toBe(6);
    // A newer pass supersedes an older one still waiting for Chrome.
    const slow = deferred<WebTab>(); vi.mocked(access.tab).mockImplementationOnce(() => slow.promise);
    const older = activity.reindex(); indices.set(1, 9); await activity.reindex(); expect(byTab(1)!.tabIndex).toBe(9);
    slow.resolve({ ...tabOf(1), index: 3 }); await older; expect(byTab(1)!.tabIndex).toBe(9);
  });
  it('keeps a label on its own tab only, in memory, without ever painting it on the badge or its title', async () => {
    activity.start(); await tick(); await open(1, gpt(1)); await open(2, gpt(2));
    vi.mocked(access.notify).mockClear();
    activity.label(byTab(1)!.id, '  Revue PRIVATE_LABEL_CANARY  ');
    expect(byTab(1)!.label).toBe('Revue PRIVATE_LABEL_CANARY'); expect(byTab(2)).not.toHaveProperty('label'); expect(access.notify).toHaveBeenCalled();
    activity.label(byTab(2)!.id, 'x'.repeat(40)); expect(byTab(2)!.label).toBe('x'.repeat(40));
    // Badge and title are computed from state alone: raising attention paints counts and fixed words only.
    vi.mocked(access.sample).mockImplementation(async (tabId, lease) => [{ frameId: 0, documentId: documents.get(tabId), result: { version: 1, requestId: lease.requestId, activationId: activations.get(tabId)!, evidence: 'input_required' } }]);
    activity.updateTab(1, {}, tabOf(1)); await tick(1000);
    expect(painted()).toMatchObject({ text: '1', title: 'Pilovo — 1 à vérifier (intervention demandée) · 1 en cours' });
    activity.setLanguage('en'); await tick();
    expect(JSON.stringify(vi.mocked(access.badge).mock.calls)).not.toMatch(/PRIVATE_LABEL|Revue|xxxx/);
    activity.label(byTab(1)!.id, null); expect(byTab(1)).not.toHaveProperty('label'); expect(byTab(2)!.label).toBe('x'.repeat(40));
    // Refused before any change: malformed labels, then IDs that name no current observation.
    for (const invalid of ['', '   ', 'x'.repeat(41), 'a\u0007b', 'a\nb', 'a\tb', 'a\u007fb', 'a\u0085b', 'a\u202Eb', 'a\u2067b', 42, undefined]) expect(refused(() => activity.label(byTab(2)!.id, invalid as string)), JSON.stringify(invalid)).toBe('validation.invalid');
    expect(refused(() => activity.label(crypto.randomUUID(), 'Autre'))).toBe('navigation.expired'); expect(byTab(2)!.label).toBe('x'.repeat(40));
    // As for focus and seen, only a live observation can be named or cleared: not one whose evidence has expired (the
    // label it already has is still shown), not a navigation placeholder, not a replaced observation.
    now += ACTIVITY_TTL; const expired = byTab(2)!; expect(expired).toMatchObject({ state: 'unknown', unknownReason: 'expired', label: 'x'.repeat(40) });
    for (const label of ['Plus tard', null]) expect(refused(() => activity.label(expired.id, label))).toBe('navigation.expired');
    expect(byTab(2)!.label).toBe('x'.repeat(40));
    // Evidence that lapses without a snapshot in between is refused too: label() checks the deadline itself.
    activity.updateTab(2, {}, tabOf(2)); await tick(1000); const fresh = byTab(2)!; expect(fresh.state).toBe('attention');
    now += ACTIVITY_TTL; expect(refused(() => activity.label(fresh.id, 'Plus tard'))).toBe('navigation.expired');
    activity.updateTab(2, {}, tabOf(2)); await tick(1000); activity.label(byTab(2)!.id, 'Plus tard'); expect(byTab(2)!.label).toBe('Plus tard');
    const replaced = byTab(2)!;
    activity.updateTab(2, { status: 'loading' }, { ...tabOf(2), status: 'loading' });
    expect(byTab(2)).toMatchObject({ unknownReason: 'navigation', label: 'Plus tard' });
    for (const id of [replaced.id, byTab(2)!.id]) expect(refused(() => activity.label(id, 'Trop tard'))).toBe('navigation.expired');
    expect(byTab(2)!.label).toBe('Plus tard');
    // Closing the tab drops its label; a new tab that reuses the number starts unlabeled.
    activity.invalidateTab(2, true); urls.delete(2); await open(4, gpt(4));
    expect(byTab(4)).toMatchObject({ sessionNumber: 2 }); expect(byTab(4)).not.toHaveProperty('label');
    expect(JSON.stringify(activity.snapshot())).not.toMatch(/PRIVATE_URL|https:|Plus tard|PRIVATE_LABEL/);
  });
});

describe('optional automatic seen after dwelling on the tab', () => {
  const evidenceFor = new Map<number, ActivityEvidence>(), documents = new Map<number, string>(), activations = new Map<number, string>();
  const tabOf = (id: number) => ({ id, windowId: 2, url: `https://chatgpt.com/c/PRIVATE_URL_CANARY_${id}`, status: 'complete' });
  const byTab = (tabId: number) => activity.snapshot().observations.find(observation => observation.tabId === tabId);
  const seen = (tabId: number) => byTab(tabId)?.attention?.acknowledged;
  const asked = () => vi.mocked(access.viewing).mock.calls.length;
  // What Chrome answers when asked for the active tab of its focused window. Its events only make the worker ask again.
  let view: ActivityView | undefined;
  const look = async (tabId?: number, windowId = 2) => { view = tabId === undefined ? undefined : { tabId, windowId }; activity.viewChanged(); await tick(); };
  const raise = async (tabId: number, value: ActivityEvidence) => { evidenceFor.set(tabId, value); activity.updateTab(tabId, {}, tabOf(tabId)); await tick(1000); };
  // Heartbeats: samples of unchanged evidence keep the same attention identity live, and so do not restart a dwell.
  const keep = async (ms: number, tabIds = [1, 2]) => { const end = now + ms; while (now < end) { for (const id of tabIds) activity.updateTab(id, {}, tabOf(id)); await tick(Math.min(1000, end - now)); } };
  beforeEach(() => {
    view = undefined;
    for (const id of [1, 2]) { evidenceFor.set(id, 'working'); documents.set(id, `document-${id}`); activations.set(id, crypto.randomUUID()); }
    vi.mocked(access.tabs).mockImplementation(async () => [1, 2].map(tabOf));
    vi.mocked(access.tab).mockImplementation(async id => tabOf(id));
    vi.mocked(access.sample).mockImplementation(async (tabId, lease) => [{ frameId: 0, documentId: documents.get(tabId), result: { version: 1, requestId: lease.requestId, activationId: activations.get(tabId)!, evidence: evidenceFor.get(tabId)! } }]);
    vi.mocked(access.viewing).mockImplementation(async () => view && { ...view });
  });
  it('is off by default and for any unexpected value: Chrome is never asked and nothing is acknowledged', async () => {
    activity.start(); await tick(); await raise(1, 'input_required'); await look(1);
    for (const value of [10, -1, '5', 5.5, null, undefined, true, [5]]) activity.setAutoAcknowledge(value);
    await keep(60_000); await look(1);
    expect(seen(1)).toBe(false); expect(asked()).toBe(0); expect(painted()).toMatchObject({ text: '1', background: BADGE_COLORS.input_required });
  });
  it('acknowledges only the viewed attention after exactly N continuous seconds, through the seen path, and repaints the badge', async () => {
    activity.setAutoAcknowledge(5); activity.start(); await tick(); await raise(1, 'input_required'); await raise(2, 'error_visible');
    expect(painted()).toMatchObject({ text: '2', background: BADGE_COLORS.error_visible });
    const attention = byTab(1)!.attention!, other = byTab(2)!.attention!, acknowledge = vi.spyOn(activity, 'acknowledge');
    await look(1); await keep(4999); expect(seen(1)).toBe(false); expect(acknowledge).not.toHaveBeenCalled();
    vi.mocked(access.notify).mockClear(); const before = asked();
    await tick(1);
    expect(byTab(1)!.attention).toEqual({ ...attention, acknowledged: true }); expect(acknowledge).toHaveBeenCalledExactlyOnceWith(byTab(1)!.id, attention.id);
    // Chrome was asked again at the deadline. The other tab's attention is untouched and the badge lowers to it.
    expect(asked()).toBe(before + 1); expect(byTab(2)!.attention).toEqual(other);
    expect(painted()).toMatchObject({ text: '1', background: BADGE_COLORS.error_visible, title: 'Pilovo — 1 à vérifier (erreur visible)' }); expect(access.notify).toHaveBeenCalled();
    await keep(30_000); expect(acknowledge).toHaveBeenCalledOnce(); expect(seen(2)).toBe(false); expect(access.focus).not.toHaveBeenCalled();
    expect(JSON.stringify(activity.snapshot())).not.toMatch(/PRIVATE_URL|https:|documentId|activationId/);
  });
  it('starts the dwell when attention is raised on a tab already viewed', async () => {
    activity.setAutoAcknowledge(15); activity.start(); await tick(); await look(1);
    // Work while viewed: nothing to acknowledge, so no deadline is asked about.
    await keep(10_000); const before = asked();
    await raise(1, 'input_required'); const raisedAt = byTab(1)!.attention!.raisedAt; expect(raisedAt).toBe(now);
    await keep(14_999); expect(seen(1)).toBe(false); expect(asked()).toBe(before);
    await tick(1); expect(seen(1)).toBe(true); expect(now - raisedAt).toBe(15_000);
  });
  it('stops on a tab switch, a window blur, WINDOW_ID_NONE or another focused window; coming back restarts it in full', async () => {
    activity.setAutoAcknowledge(5); activity.start(); await tick(); await raise(1, 'input_required');
    await look(1); await keep(3000);
    await look(2); await keep(3000); expect(seen(1)).toBe(false);
    await look(1); await keep(4999); expect(seen(1)).toBe(false);
    // Chrome lost focus (another application): the event alone stops the dwell, without asking Chrome.
    const before = asked(); activity.viewChanged(-1); await keep(10_000); expect(seen(1)).toBe(false); expect(asked()).toBe(before);
    // Focus moves to another window, whose active tab Chrome then reports.
    view = { tabId: 7, windowId: 5 }; activity.viewChanged(5); await keep(10_000); expect(seen(1)).toBe(false); expect(asked()).toBe(before + 1);
    await look(1); await keep(3000);
    // A blur with no focused window answered later by Chrome: the tab still active but no window focused.
    view = undefined; activity.viewChanged(1); await keep(10_000); expect(seen(1)).toBe(false);
    view = { tabId: 1, windowId: 2 }; activity.viewChanged(2); await keep(4999); expect(seen(1)).toBe(false);
    await tick(1); expect(seen(1)).toBe(true);
  });
  it('keeps a dwell through tab events in other windows; one in the viewed window or on the viewed tab restarts it', async () => {
    activity.setAutoAcknowledge(5); activity.start(); await tick(); await raise(1, 'input_required');
    await look(1); await keep(1000); const before = asked();
    // Chrome activates a neighbor in a background window (a tab closed there); a tab moves between two other windows.
    activity.tabViewChanged(9, 7); await keep(1000); activity.tabViewChanged(10, 7); activity.tabViewChanged(10, 8); await keep(2000);
    // Neither stopped it nor asked Chrome again: exactly 5 s after viewing began, the deadline query alone confirms it.
    expect(asked()).toBe(before); await keep(999); expect(seen(1)).toBe(false);
    await tick(1); expect(seen(1)).toBe(true); expect(asked()).toBe(before + 1);
    // A new attention: an activation in the viewed window, or an event moving the viewed tab, stops the dwell at once.
    for (const [tabId, windowId, reason] of [[2, 2, 'error_visible'], [1, 7, 'input_required']] as const) {
      await raise(1, reason); await keep(2000);
      const asking = asked(); activity.tabViewChanged(tabId, windowId); await tick(); expect(asked()).toBe(asking + 1);
      await keep(4999); expect(seen(1)).toBe(false); await tick(1); expect(seen(1)).toBe(true);
    }
  });
  it('never acknowledges while the panel or full page has focus beside another tab, or the tab sits in another window', async () => {
    activity.setAutoAcknowledge(5); activity.start(); await tick(); await raise(1, 'input_required'); await raise(2, 'input_required');
    // The full-page Pilovo tab (not observed) is the active tab of the focused window.
    await look(99); await keep(10_000);
    // The reported window is not the observed tab's window: the tab moved and no sample or position read confirms it yet.
    await look(1, 8); await keep(10_000);
    expect([seen(1), seen(2)]).toEqual([false, false]);
  });
  it('stops on navigation; the new attention raised in the still viewed tab gets its own full dwell', async () => {
    activity.setAutoAcknowledge(5); activity.start(); await tick(); await raise(1, 'input_required');
    const first = byTab(1)!.attention!; await look(1); await keep(3000);
    activity.updateTab(1, { url: `${tabOf(1).url}/next` }, tabOf(1)); expect(byTab(1)).toMatchObject({ state: 'unknown', unknownReason: 'navigation' });
    await tick(1000); const second = byTab(1)!.attention!; expect(second).toMatchObject({ raisedAt: now, acknowledged: false }); expect(second.id).not.toBe(first.id);
    // The first deadline (2 s after navigation) passes without acknowledging anything.
    await keep(4999); expect(seen(1)).toBe(false);
    await tick(1); expect(byTab(1)!.attention).toEqual({ ...second, acknowledged: true });
  });
  it('replaces the dwell when a new attention identity is raised: the old deadline passes, the new one is N s after its raise', async () => {
    activity.setAutoAcknowledge(5); activity.start(); await tick(); await raise(1, 'input_required');
    const acknowledge = vi.spyOn(activity, 'acknowledge');
    await look(1); await keep(2000); await raise(1, 'error_visible');
    const replaced = byTab(1)!.attention!; expect(replaced.reason).toBe('error_visible');
    await keep(2000); expect(seen(1)).toBe(false); expect(acknowledge).not.toHaveBeenCalled();
    await keep(2999); expect(seen(1)).toBe(false);
    await tick(1); expect(acknowledge).toHaveBeenCalledExactlyOnceWith(byTab(1)!.id, replaced.id); expect(byTab(1)!.attention).toEqual({ ...replaced, acknowledged: true });
  });
  it.each(['closure', 'revocation', 'manual seen', 'mark all', 'expiry'] as const)('stops on %s and acknowledges nothing at the deadline', async change => {
    activity.setAutoAcknowledge(change === 'expiry' ? 30 : 5); activity.start(); await tick(); await raise(1, 'input_required');
    await look(1); await keep(3000); const before = asked();
    const acknowledge = vi.spyOn(activity, 'acknowledge');
    if (change === 'closure') activity.invalidateTab(1, true);
    else if (change === 'revocation') activity.revoke('chatgpt-web');
    else if (change === 'manual seen') activity.acknowledge(byTab(1)!.id, byTab(1)!.attention!.id);
    else if (change === 'mark all') activity.acknowledgeAll();
    // Expiry: no heartbeat renews the evidence, which lapses 15 s after the last sample, before the 30 s deadline.
    await (change === 'expiry' || change === 'closure' || change === 'revocation' ? tick(40_000) : keep(40_000));
    expect(acknowledge).toHaveBeenCalledTimes(change === 'manual seen' ? 1 : 0); expect(asked()).toBe(before);
    if (change === 'manual seen' || change === 'mark all') expect(seen(1)).toBe(true);
    else if (change === 'expiry') expect(byTab(1)).toMatchObject({ state: 'unknown', unknownReason: 'expired' });
    else expect(byTab(1)).toBeUndefined();
  });
  it('requires evidence still live at the deadline: a deadline exactly at validUntil acknowledges nothing', async () => {
    activity.setAutoAcknowledge(15); activity.start(); await tick(); await raise(1, 'input_required');
    await look(1); expect(byTab(1)!.validUntil).toBe(now + 15_000);
    await tick(15_000); expect(byTab(1)).toMatchObject({ state: 'unknown', unknownReason: 'expired' }); expect(byTab(1)!.attention).toBeUndefined();
  });
  it('re-verifies from a fresh query at the deadline: a stale cached view, a lost focus or a failed query acknowledges nothing', async () => {
    activity.setAutoAcknowledge(5); activity.start(); await tick(); await raise(1, 'input_required');
    // The user left for tab 2 but that event has not reached the worker: only the deadline query sees it.
    await look(1); view = { tabId: 2, windowId: 2 }; await keep(10_000); expect(seen(1)).toBe(false);
    // Chrome no longer has a focused window, and its blur event was missed.
    await look(1); view = undefined; await keep(10_000); expect(seen(1)).toBe(false);
    // Chrome cannot answer: nothing is acknowledged and no rejection escapes.
    await look(1); vi.mocked(access.viewing).mockRejectedValueOnce(new Error('No current window')); await keep(10_000); expect(seen(1)).toBe(false);
    // A view event while the deadline query is pending wins over its answer.
    const slow = deferred<ActivityView | undefined>(); await look(1); vi.mocked(access.viewing).mockReturnValueOnce(slow.promise);
    await keep(5000); view = { tabId: 2, windowId: 2 }; activity.viewChanged(); slow.resolve({ tabId: 1, windowId: 2 }); await keep(10_000); expect(seen(1)).toBe(false);
    // Once Chrome answers consistently, a full dwell acknowledges it.
    await look(1); await keep(5000); expect(seen(1)).toBe(true);
  });
  it('follows setting changes: 15 to 0 stops the dwell, 0 to 5 while viewing starts it from the current view', async () => {
    activity.setAutoAcknowledge(15); activity.start(); await tick(); await raise(1, 'input_required'); await look(1);
    await keep(10_000); activity.setAutoAcknowledge(0); const before = asked();
    await keep(20_000); expect(seen(1)).toBe(false); expect(asked()).toBe(before);
    // Re-enabled without any tab or window event: the worker asks Chrome what is viewed now.
    activity.setAutoAcknowledge(5); await tick(); expect(asked()).toBe(before + 1);
    await keep(4999); expect(seen(1)).toBe(false); await tick(1); expect(seen(1)).toBe(true);
    // A longer delay restarts from the change for the next attention.
    await raise(1, 'error_visible'); await keep(2000); activity.setAutoAcknowledge(30); await keep(29_999); expect(seen(1)).toBe(false);
    await tick(1); expect(seen(1)).toBe(true);
  });
});
