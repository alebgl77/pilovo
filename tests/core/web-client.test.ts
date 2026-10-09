import { afterEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { WEB_ORIGINS } from '../../src/shared/web';

afterEach(() => { vi.unstubAllGlobals(); vi.resetModules(); });
describe('standalone extension client capability boundary', () => {
  it('requests only optional origins synchronously from the UI call, never through worker RPC', async () => {
    vi.resetModules(); const request = vi.fn().mockResolvedValue(true), remove = vi.fn().mockResolvedValue(true), sendMessage = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal('chrome', { runtime: { id: 'extension', sendMessage }, permissions: { request, remove } });
    const { client } = await import('../../src/platform/client');
    const permission = client.requestWebDiscoveryPermission!(); expect(request).toHaveBeenCalledWith({ origins: WEB_ORIGINS }); expect(sendMessage).not.toHaveBeenCalled(); expect(await permission).toBe(true);
    expect(await client.removeWebDiscoveryPermission!()).toBe(true); expect(remove).toHaveBeenCalledWith({ origins: WEB_ORIGINS });
    expect(await client.requestBridgePermission()).toBe(false); expect(await client.requestDiscoveryPermission!()).toBe(false);
    await expect(client.connectBridge()).rejects.toMatchObject({ code: 'bridge.unavailable' }); await expect(client.attachActiveTab('legacy')).rejects.toMatchObject({ code: 'permission.denied' });
    expect(request).toHaveBeenCalledTimes(1); expect(sendMessage).not.toHaveBeenCalled();
  });
  it('packages only the declared minimal permissions with no injection or external connection hooks', () => {
    const manifest = JSON.parse(readFileSync(new URL('../../public/manifest.json', import.meta.url), 'utf8'));
    expect(manifest.permissions).toEqual(['storage', 'sidePanel', 'alarms']); expect(manifest.optional_host_permissions).toEqual(WEB_ORIGINS);
    for (const field of ['optional_permissions', 'host_permissions', 'content_scripts', 'externally_connectable', 'web_accessible_resources']) expect(manifest[field]).toBeUndefined();
    const worker = readFileSync(new URL('../../src/background/index.ts', import.meta.url), 'utf8');
    expect(worker).not.toMatch(/connectNative|nativeMessaging|chrome\.management|permissions\.request|NativeControls|fetch\(/);
  });
  it('propagates an update conflict without retrying or fetching a fresh revision', async () => {
    vi.resetModules(); const sendMessage = vi.fn().mockResolvedValue({ ok: false, error: { code: 'preparation.conflict', message: 'preparation.conflict' } });
    vi.stubGlobal('chrome', { runtime: { id: 'extension', sendMessage } }); const { client } = await import('../../src/platform/client');
    await expect(client.updateWebPreparation!(crypto.randomUUID(), { expectedRevision: 1, prompt: 'PRIVATE', retainPrompt: true })).rejects.toMatchObject({ code: 'preparation.conflict' });
    expect(sendMessage).toHaveBeenCalledOnce(); expect(sendMessage.mock.calls[0][0].request.patch.expectedRevision).toBe(1);
  });
});
