import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ActivityLease } from '../../src/shared/activity';

const readEvidence = vi.hoisted(() => vi.fn(() => 'working'));
vi.mock('../../src/content/evidence', () => ({ readEvidence }));
let now: number, callbacks: Map<string, () => void>, observer: { callback: () => void; observe: ReturnType<typeof vi.fn>; disconnect: ReturnType<typeof vi.fn> }, send: ReturnType<typeof vi.fn>;
const lease = (patch: Partial<ActivityLease> = {}): ActivityLease => ({ workerId: 'worker', grantId: 'grant', requestId: crypto.randomUUID(), issuedAt: 1_000_000 + now, expiresAt: 1_015_000 + now, ...patch });
const controller = () => globalThis.__pilovoObserverV1!;
const sample = (value = lease()) => controller().sample(value) as { activationId: string; evidence: string } | null;
beforeEach(async () => {
  vi.resetModules(); vi.useFakeTimers(); now = 0; callbacks = new Map(); readEvidence.mockClear();
  vi.stubGlobal('performance', { timeOrigin: 1_000_000, now: () => now });
  vi.stubGlobal('location', { href: 'https://chatgpt.com/c/private', hostname: 'chatgpt.com' });
  vi.stubGlobal('addEventListener', (name: string, callback: () => void) => callbacks.set(name, callback));
  vi.stubGlobal('document', { documentElement: {}, addEventListener: (name: string, callback: () => void) => callbacks.set(name, callback) });
  vi.stubGlobal('MutationObserver', class { constructor(callback: () => void) { observer = { callback, observe: vi.fn(), disconnect: vi.fn() }; return observer; } });
  send = vi.fn().mockResolvedValue(undefined); vi.stubGlobal('chrome', { runtime: { sendMessage: send } });
  delete globalThis.__pilovoObserverV1; await import('../../src/content/observer');
});
afterEach(() => { controller().dispose(); delete globalThis.__pilovoObserverV1; vi.clearAllTimers(); vi.useRealTimers(); vi.unstubAllGlobals(); });

describe('isolated observer lease lifecycle', () => {
  it('bootstrap is inert and reinjection is idempotent', async () => {
    expect(readEvidence).not.toHaveBeenCalled(); expect(send).not.toHaveBeenCalled();
    const first = controller(); vi.resetModules(); await import('../../src/content/observer'); expect(controller()).toBe(first);
    expect(sample()?.evidence).toBe('working'); expect(readEvidence).toHaveBeenCalledOnce();
  });
  it('checks absolute expiry before sampling, mutation or heartbeat and rejects delayed issuance', async () => {
    const oldLease = lease(); sample(oldLease); now = 15000; observer.callback();
    await vi.advanceTimersByTimeAsync(15000); expect(send).not.toHaveBeenCalled(); expect(readEvidence).toHaveBeenCalledOnce(); expect(observer.disconnect).toHaveBeenCalled();
    expect(sample(oldLease)).toBeNull(); expect(readEvidence).toHaveBeenCalledOnce();
    const result = sample(); expect(result).not.toBeNull();
  });
  it('rotates activation after lease gap, worker restart, grant change and SPA route', () => {
    let id = sample()!.activationId;
    for (const patch of [{ workerId: 'new-worker' }, { workerId: 'new-worker', grantId: 'new-grant' }]) { now++; const next = sample(lease(patch))!.activationId; expect(next).not.toBe(id); id = next; }
    location.href = 'https://chatgpt.com/c/another-private-route'; now++; const next = sample()!.activationId; expect(next).not.toBe(id); id = next;
    now += 15000; expect(sample()!.activationId).not.toBe(id);
  });
  it.each([['pagehide', 'pageshow'], ['freeze', 'resume']])('%s suspends all reads; %s creates a new activation', (suspend, resume) => {
    const id = sample()!.activationId; callbacks.get(suspend)!(); expect(sample()).toBeNull();
    callbacks.get(resume)!(); expect(sample()!.activationId).not.toBe(id);
    expect(readEvidence).toHaveBeenCalledTimes(2);
  });
  it('older issuance and targeted old-grant disposal cannot replace a newer lease', () => {
    const old = lease(); sample(old); now++; sample(lease({ grantId: 'new-grant' }));
    const count = readEvidence.mock.calls.length; expect(sample(old)).toBeNull(); expect(readEvidence).toHaveBeenCalledTimes(count);
    controller().dispose('grant'); expect(sample(lease({ grantId: 'new-grant' }))).not.toBeNull();
  });
  it('coalesces mutation floods and sends strictly finite metadata without reading DOM in callbacks', async () => {
    sample(); const options = observer.observe.mock.calls[0][1]; expect(options.characterData).toBeUndefined(); expect(options.attributeFilter).not.toContain('value');
    for (let i = 0; i < 1000; i++) observer.callback();
    now = 1000; await vi.advanceTimersByTimeAsync(1000); expect(send).toHaveBeenCalledOnce(); expect(readEvidence).toHaveBeenCalledOnce();
    expect(Object.keys(send.mock.calls[0][0]).sort()).toEqual(['activationId', 'channel', 'kind', 'sequence', 'version']);
    expect(JSON.stringify(send.mock.calls)).not.toContain('private');
  });
});
