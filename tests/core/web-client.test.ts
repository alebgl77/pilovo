import { afterEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
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
  it('packages only the declared minimal permissions with grant-scoped injection and no external hooks', () => {
    const manifest = JSON.parse(readFileSync(new URL('../../public/manifest.json', import.meta.url), 'utf8'));
    expect(manifest.permissions).toEqual(['storage', 'sidePanel', 'alarms', 'scripting']); expect(manifest.optional_host_permissions).toEqual(WEB_ORIGINS);
    for (const field of ['optional_permissions', 'host_permissions', 'content_scripts', 'externally_connectable', 'web_accessible_resources']) expect(manifest[field]).toBeUndefined();
    // Commands are keyboard bindings, not permissions: one suggested key, the bulk action left for the user to assign.
    expect(Object.keys(manifest.commands)).toEqual(['_execute_action', 'focus-next-attention', 'acknowledge-all-attention']);
    expect(manifest.commands['focus-next-attention']).toEqual({ suggested_key: { default: 'Alt+Shift+J', mac: 'Alt+Shift+J' }, description: '__MSG_commandNextAttention__' });
    expect(manifest.commands['acknowledge-all-attention']).toEqual({ description: '__MSG_commandAcknowledgeAll__' });
    for (const locale of ['en', 'fr']) {
      const messages = JSON.parse(readFileSync(new URL(`../../public/_locales/${locale}/messages.json`, import.meta.url), 'utf8'));
      for (const key of ['commandNextAttention', 'commandAcknowledgeAll']) expect(messages[key].message).toMatch(/\S/);
    }
    const worker = readFileSync(new URL('../../src/background/index.ts', import.meta.url), 'utf8');
    expect(worker).not.toMatch(/connectNative|nativeMessaging|chrome\.management|permissions\.request|NativeControls|fetch\(/);
  });
  it('propagates an update conflict without retrying or fetching a fresh revision', async () => {
    vi.resetModules(); const sendMessage = vi.fn().mockResolvedValue({ ok: false, error: { code: 'preparation.conflict', message: 'preparation.conflict' } });
    vi.stubGlobal('chrome', { runtime: { id: 'extension', sendMessage } }); const { client } = await import('../../src/platform/client');
    await expect(client.updateWebPreparation!(crypto.randomUUID(), { expectedRevision: 1, prompt: 'PRIVATE', retainPrompt: true })).rejects.toMatchObject({ code: 'preparation.conflict' });
    expect(sendMessage).toHaveBeenCalledOnce(); expect(sendMessage.mock.calls[0][0].request.patch.expectedRevision).toBe(1);
  });
  it('requests and removes one provider synchronously without granting the other', async () => {
    vi.resetModules(); const request = vi.fn().mockResolvedValue(true), remove = vi.fn().mockResolvedValue(true);
    vi.stubGlobal('chrome', { runtime: { id: 'extension' }, permissions: { request, remove } });
    const { client } = await import('../../src/platform/client');
    const pending = client.requestWebDiscoveryPermission!('chatgpt-web'); expect(request).toHaveBeenCalledExactlyOnceWith({ origins: ['https://chatgpt.com/*'] }); await pending;
    await client.removeWebDiscoveryPermission!('claude-web'); expect(remove).toHaveBeenCalledExactlyOnceWith({ origins: ['https://claude.ai/*'] });
  });
  it('reads only the configured activity shortcuts locally, without RPC, and drops blank or malformed entries', async () => {
    vi.resetModules(); const sendMessage = vi.fn(), getAll = vi.fn().mockResolvedValue([{ name: '_execute_action', shortcut: 'Alt+P' }, { name: 'focus-next-attention', description: 'x', shortcut: ' Alt+Shift+J ' }, { name: 'acknowledge-all-attention', shortcut: '' }]);
    vi.stubGlobal('chrome', { runtime: { id: 'extension', sendMessage }, commands: { getAll } }); const { client } = await import('../../src/platform/client');
    expect(await client.getShortcuts!()).toEqual({ 'focus-next-attention': 'Alt+Shift+J' }); expect(sendMessage).not.toHaveBeenCalled();
    getAll.mockResolvedValue([{ name: 'focus-next-attention', shortcut: 'X'.repeat(65) }]); await expect(client.getShortcuts!()).rejects.toMatchObject({ code: 'runtime.unavailable' });
    getAll.mockRejectedValue(new Error('unavailable')); await expect(client.getShortcuts!()).rejects.toMatchObject({ code: 'runtime.unavailable' });
  });
  it('sends mark all as one RPC carrying only the displayed attention identities', async () => {
    vi.resetModules(); const sendMessage = vi.fn().mockResolvedValue({ ok: true, data: 2 });
    vi.stubGlobal('chrome', { runtime: { id: 'extension', sendMessage } }); const { client } = await import('../../src/platform/client');
    const ids = [crypto.randomUUID(), crypto.randomUUID()];
    expect(await client.acknowledgeAllWebActivity!(ids)).toBe(2); expect(sendMessage).toHaveBeenCalledExactlyOnceWith({ channel: 'hub.rpc', request: { method: 'acknowledgeAllWebActivity', attentionIds: ids } });
  });
  it('keeps mark all and shortcuts unavailable in the browser preview', async () => {
    vi.resetModules(); vi.stubGlobal('chrome', undefined); vi.stubGlobal('indexedDB', new IDBFactory()); const { client } = await import('../../src/platform/client');
    await expect(client.acknowledgeAllWebActivity!()).rejects.toMatchObject({ code: 'runtime.unavailable' }); expect(client.getShortcuts).toBeUndefined();
  });
});
