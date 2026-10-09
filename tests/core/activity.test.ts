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
    reduceActivity(record, 'idle_ready', 9000, 60, 24000); expect(record.observation.attention).toEqual({ id, reason: 'response_ready', acknowledged: true });
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
