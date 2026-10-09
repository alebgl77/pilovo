import { describe, expect, it, vi } from 'vitest';
import { discoverBrowserAgents } from '../../src/platform/discovery';
import { KNOWN_BROWSER_AGENTS } from '../../src/shared/discovery';
import { NativeControls } from '../../src/background/control';
import { incomingSchema } from '../../src/shared/protocol';
import { rpcSchema } from '../../src/shared/rpc';

describe('optional known-agent discovery', () => {
  it('does not query installed extensions without permission', async () => {
    const get = vi.fn();
    expect(await discoverBrowserAgents({ hasPermission: async () => false, get })).toEqual({ browserPermission: false, browserAgents: [] });
    expect(get).not.toHaveBeenCalled();
  });
  it('queries only the two known IDs and preserves sideload and disabled state', async () => {
    const get = vi.fn(async (_id: string) => ({ enabled: false, version: '1.2.3', installType: 'development' as const }));
    const result = await discoverBrowserAgents({ hasPermission: async () => true, get });
    expect(get.mock.calls.map(call => call[0])).toEqual(KNOWN_BROWSER_AGENTS.map(agent => agent.id));
    expect(result.browserAgents).toHaveLength(2);
    expect(result.browserAgents[0]).toMatchObject({ presence: 'installed', enabled: false, installType: 'development' });
    expect(JSON.stringify(result)).not.toContain('active');
  });
  it('does not invent absence from an API failure', async () => {
    const result = await discoverBrowserAgents({ hasPermission: async () => true, get: async () => { throw new Error('unavailable'); } });
    expect(result.browserAgents.every(agent => agent.presence === 'unknown')).toBe(true);
  });
  it('discards findings if permission is revoked during lookup', async () => {
    const hasPermission = vi.fn().mockResolvedValueOnce(true).mockResolvedValueOnce(false);
    expect(await discoverBrowserAgents({ hasPermission, get: async () => ({ enabled: true, version: '1', installType: 'normal' }) })).toEqual({ browserPermission: false, browserAgents: [] });
  });
});

describe('native control correlation', () => {
  const request = () => ({ kind: 'inventory.request' as const, requestId: crypto.randomUUID() });
  const response = (requestId: string) => ({ kind: 'inventory.result' as const, requestId, checkedAt: new Date().toISOString(), agents: [] });
  it('accepts old handshake without claiming new capabilities', () => {
    expect(incomingSchema.parse({ kind: 'bridge.ready', protocolVersion: 1 })).not.toHaveProperty('capabilities');
    expect(incomingSchema.parse({ kind: 'bridge.ready', protocolVersion: 1, capabilities: { discovery: true, launch: true, browserActivity: true } })).toHaveProperty('capabilities.launch', true);
  });
  it('accepts responses only for the matching request ID and kind', async () => {
    const controls = new NativeControls(), input = request();
    const send = vi.fn(); const pending = controls.request(input, send);
    expect(controls.receive({ kind: 'launch.result', requestId: input.requestId, status: 'rejected', reason: 'unsupported_mode' })).toBe(false);
    expect(controls.receive(response(crypto.randomUUID()))).toBe(true);
    const matching = response(input.requestId);
    expect(controls.receive(matching)).toBe(true);
    expect(await pending).toEqual(matching);
    expect(send).toHaveBeenCalledOnce();
  });
  it('rejects outstanding requests on disconnect without retrying', async () => {
    const controls = new NativeControls(), send = vi.fn();
    const pending = controls.request(request(), send); const check = expect(pending).rejects.toMatchObject({ code: 'bridge.unavailable' });
    controls.disconnect(); await check; expect(send).toHaveBeenCalledOnce();
  });
  it('bounds timeouts and ignores late responses without starting again', async () => {
    vi.useFakeTimers();
    try {
      const controls = new NativeControls(), input = request(), send = vi.fn();
      const pending = controls.request(input, send, 50); const check = expect(pending).rejects.toMatchObject({ code: 'bridge.unavailable' });
      await vi.advanceTimersByTimeAsync(51); await check;
      expect(controls.receive(response(input.requestId))).toBe(true); expect(send).toHaveBeenCalledOnce();
    } finally { vi.useRealTimers(); }
  });
  it('rejects malformed messages and command injection fields', () => {
    expect(new NativeControls().receive({ kind: 'inventory.result', requestId: 'invalid' })).toBe(false);
    expect(rpcSchema.safeParse({ method: 'controlAgent', request: { kind: 'launch.request', requestId: crypto.randomUUID(), sourceId: 'codex', title: 'task', prompt: 'test', mode: 'standard', createdAt: new Date().toISOString(), executable: 'cmd.exe' } }).success).toBe(false);
  });
});
