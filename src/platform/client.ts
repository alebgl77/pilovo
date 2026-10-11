import { HubRepository } from '../domain/repository';
import { HubError } from '../shared/errors';
import type { ApiResult, HubClient } from '../shared/types';
import type { RpcRequest } from '../shared/rpc';
import { hashFile } from '../domain/verification';
import { emptyWebDiscovery, WEB_ORIGINS, WEB_PROVIDERS, type WebProvider } from '../shared/web';
import { ACTIVITY_COMMANDS, activityShortcutsSchema, type ActivityCommand, type ActivityShortcuts } from '../shared/activity';

const isExtension = typeof chrome !== 'undefined' && Boolean(chrome.runtime?.id);
async function rpc<T>(request: RpcRequest): Promise<T> {
  let response: ApiResult<T>;
  try { response = await chrome.runtime.sendMessage({ channel: 'hub.rpc', request }); }
  catch { throw new HubError('runtime.unavailable'); }
  if (!response || typeof response.ok !== 'boolean') throw new HubError('runtime.unavailable');
  if (!response.ok) throw new HubError(response.error.code);
  return response.data;
}
function extensionClient(): HubClient {
  const origins = (provider?: WebProvider) => provider ? [WEB_PROVIDERS.find(item => item.id === provider)!.pattern] : [...WEB_ORIGINS];
  const nativeUnavailable = async (): Promise<never> => { throw new HubError('bridge.unavailable'); };
  const navigationUnavailable = async (): Promise<never> => { throw new HubError('permission.denied'); };
  return {
    getWebActivity: () => rpc({ method: 'getWebActivity' }),
    focusWebActivity: id => rpc({ method: 'focusWebActivity', id }),
    acknowledgeWebActivity: (id, attentionId) => rpc({ method: 'acknowledgeWebActivity', id, attentionId }),
    acknowledgeAllWebActivity: attentionIds => rpc({ method: 'acknowledgeAllWebActivity', attentionIds }),
    labelWebActivity: (id, label) => rpc({ method: 'labelWebActivity', id, label }),
    // The window showing this panel or page, so a row can say its tab is elsewhere. Local Chrome state: no RPC or permission.
    getCurrentWindowId: async () => {
      let current: { id?: number } | undefined;
      try { current = await chrome.windows.getCurrent(); } catch { throw new HubError('runtime.unavailable'); }
      return Number.isSafeInteger(current?.id) && current!.id! >= 0 ? current!.id : undefined;
    },
    // Local Chrome command state, read without RPC or permission. An unassigned shortcut is blank and stays hidden.
    getShortcuts: async () => {
      let commands: unknown;
      try { commands = await chrome.commands.getAll(); } catch { throw new HubError('runtime.unavailable'); }
      const parsed = activityShortcutsSchema.safeParse(commands);
      if (!parsed.success) throw new HubError('runtime.unavailable');
      const shortcuts: ActivityShortcuts = {};
      for (const command of parsed.data) { const shortcut = command.shortcut?.trim(); if (shortcut && ACTIVITY_COMMANDS.includes(command.name as ActivityCommand)) shortcuts[command.name as ActivityCommand] = shortcut; }
      return shortcuts;
    },
    getWebDiscovery: () => rpc({ method: 'getWebDiscovery' }),
    // Keep request() directly in the UI's click call stack; the worker never requests permissions.
    requestWebDiscoveryPermission: provider => chrome.permissions.request({ origins: origins(provider) }),
    removeWebDiscoveryPermission: provider => chrome.permissions.remove({ origins: origins(provider) }),
    createWebPreparation: input => rpc({ method: 'createWebPreparation', input }),
    updateWebPreparation: (id, patch) => rpc({ method: 'updateWebPreparation', id, patch }),
    deleteWebPreparation: id => rpc({ method: 'deleteWebPreparation', id }),
    openWebProvider: (provider, tabId) => rpc({ method: 'openWebProvider', provider, tabId }),
    getAgentDetection: refresh => rpc({ method: 'getAgentDetection', refresh }),
    controlAgent: nativeUnavailable,
    requestDiscoveryPermission: async () => false,
    removeDiscoveryPermission: async () => true,
    getSnapshot: () => rpc({ method: 'getSnapshot' }),
    getTaskEvents: (key, limit) => rpc({ method: 'getTaskEvents', key, limit }),
    createMission: title => rpc({ method: 'createMission', title }),
    updateMission: (id, title) => rpc({ method: 'updateMission', id, title }),
    assignTask: (key, missionId) => rpc({ method: 'assignTask', key, missionId }),
    reviewTask: (key, status, comment) => rpc({ method: 'reviewTask', key, status, comment }),
    verifyArtifactHash: async (key, file, expectedSha256) => rpc({ method: 'recordVerification', key, evidence: await hashFile(file, expectedSha256) }),
    updateSettings: patch => rpc({ method: 'updateSettings', patch }),
    deleteTask: key => rpc({ method: 'deleteTask', key }),
    deleteMission: (id, deleteTasks) => rpc({ method: 'deleteMission', id, deleteTasks }),
    purgeAll: () => rpc({ method: 'purgeAll' }), exportData: () => rpc({ method: 'exportData' }),
    attachActiveTab: navigationUnavailable,
    focusTaskTab: navigationUnavailable,
    openTaskContext: navigationUnavailable,
    connectBridge: nativeUnavailable, disconnectBridge: async () => undefined,
    requestBridgePermission: async () => false,
    subscribe: listener => { const handler = (message: unknown) => { if ((message as { channel?: string } | null)?.channel === 'hub.changed') listener(); }; chrome.runtime.onMessage.addListener(handler); return () => chrome.runtime.onMessage.removeListener(handler); },
  };
}
function previewClient(): HubClient {
  const repo = new HubRepository('agent-control-hub-preview-v1');
  const listeners = new Set<() => void>();
  const broadcast = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('agent-control-hub-preview') : undefined;
  if (broadcast) broadcast.onmessage = () => listeners.forEach(listener => listener());
  const change = async <T>(promise: Promise<T>) => { const value = await promise; listeners.forEach(listener => listener()); broadcast?.postMessage('changed'); return value; };
  const unavailable = async (): Promise<never> => { throw new HubError('runtime.unavailable'); };
  void repo.cleanup().catch(() => undefined);
  return {
    getWebActivity: async () => ({ availability: 'unavailable', observations: [], observedAt: Date.now() }),
    focusWebActivity: unavailable, acknowledgeWebActivity: unavailable, acknowledgeAllWebActivity: unavailable, labelWebActivity: unavailable,
    getWebDiscovery: async () => emptyWebDiscovery('unavailable'),
    requestWebDiscoveryPermission: async () => false, removeWebDiscoveryPermission: async () => true,
    createWebPreparation: input => change(repo.createWebPreparation(input)),
    updateWebPreparation: (id, patch) => change(repo.updateWebPreparation(id, patch)),
    deleteWebPreparation: id => change(repo.deleteWebPreparation(id)),
    openWebProvider: unavailable,
    getAgentDetection: async () => ({ checkedAt: new Date().toISOString(), browserPermission: false, browserAgents: [], localAgents: [], capabilities: { discovery: false, launch: false, browserActivity: false }, companionStatus: 'unavailable' }),
    controlAgent: unavailable, requestDiscoveryPermission: unavailable, removeDiscoveryPermission: unavailable,
    getSnapshot: () => repo.snapshot('preview'), getTaskEvents: (key, limit) => repo.getTaskEvents(key, limit),
    createMission: title => change(repo.createMission(title)), updateMission: (id, title) => change(repo.updateMission(id, title)),
    assignTask: (key, missionId) => change(repo.assignTask(key, missionId)), reviewTask: (key, status, comment) => change(repo.reviewTask(key, status, comment)),
    verifyArtifactHash: async (key, file, expectedSha256) => change(repo.recordVerification(key, await hashFile(file, expectedSha256))),
    updateSettings: patch => change(repo.updateSettings(patch)), deleteTask: key => change(repo.deleteTask(key)), deleteMission: (id, deleteTasks) => change(repo.deleteMission(id, deleteTasks)),
    purgeAll: () => change(repo.purgeAll()), exportData: () => repo.exportData(), attachActiveTab: unavailable, focusTaskTab: unavailable, openTaskContext: unavailable, connectBridge: unavailable, disconnectBridge: unavailable, requestBridgePermission: unavailable,
    subscribe: listener => { listeners.add(listener); return () => { listeners.delete(listener); }; },
  };
}
export const client: HubClient = isExtension ? extensionClient() : previewClient();
export const hubClient = client;
export { HubError } from '../shared/errors';
export type * from '../shared/types';
