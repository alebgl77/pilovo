import { HubRepository } from '../domain/repository';
import { errorCode, HubError } from '../shared/errors';
import { rpcSchema, type RpcRequest } from '../shared/rpc';
import type { ApiResult } from '../shared/types';
import { chromeWebBrowser, WebBrowser } from '../platform/web';

const repository = new HubRepository();
const web = new WebBrowser(chromeWebBrowser);
let notifyTimer: ReturnType<typeof setTimeout> | undefined;
const notify = () => { if (notifyTimer) return; notifyTimer = setTimeout(() => { notifyTimer = undefined; void chrome.runtime.sendMessage({ channel: 'hub.changed' }).catch(() => undefined); }, 200); };
const invalidateDiscovery = () => { web.invalidate(); notify(); };
async function dispatch(request: RpcRequest): Promise<unknown> {
  switch (request.method) {
    case 'getWebDiscovery': return web.discovery();
    case 'openWebProvider': return web.open(request.provider, request.tabId);
    case 'createWebPreparation': return repository.createWebPreparation(request.input);
    case 'updateWebPreparation': return repository.updateWebPreparation(request.id, request.patch);
    case 'deleteWebPreparation': return repository.deleteWebPreparation(request.id);
    case 'getAgentDetection': return { checkedAt: new Date().toISOString(), browserPermission: false, browserAgents: [], localAgents: [], capabilities: { discovery: false, launch: false, browserActivity: false }, companionStatus: 'unavailable' };
    case 'controlAgent': case 'connectBridge': throw new HubError('bridge.unavailable');
    case 'disconnectBridge': return;
    case 'getSnapshot': return repository.snapshot();
    case 'getTaskEvents': return repository.getTaskEvents(request.key, request.limit);
    case 'createMission': return repository.createMission(request.title);
    case 'updateMission': return repository.updateMission(request.id, request.title);
    case 'assignTask': return repository.assignTask(request.key, request.missionId);
    case 'reviewTask': return repository.reviewTask(request.key, request.status, request.comment);
    case 'recordVerification': return repository.recordVerification(request.key, request.evidence);
    case 'updateSettings': return repository.updateSettings(request.patch);
    case 'deleteTask': return repository.deleteTask(request.key);
    case 'deleteMission': return repository.deleteMission(request.id, request.deleteTasks);
    case 'purgeAll': return repository.purgeAll();
    case 'exportData': return repository.exportData();
    case 'attachActiveTab': case 'focusTaskTab': case 'openTaskContext': throw new HubError('permission.denied');
  }
}
const ready = (async () => {
  await repository.updateSettings({ bridgeEnabled: false });
  await repository.setBridgeStatus('disabled');
  await repository.setConnection('claude-code', 'disconnected'); await repository.setConnection('codex', 'disconnected');
  await chrome.alarms.create('hub-maintenance', { periodInMinutes: 1 });
})();
chrome.runtime.onMessage.addListener((message: unknown, sender, respond: (response: ApiResult<unknown>) => void) => {
  if (sender.id !== chrome.runtime.id || sender.frameId && sender.frameId !== 0 || !sender.url || ![chrome.runtime.getURL('index.html'), chrome.runtime.getURL('sidepanel.html')].some(url => sender.url!.split(/[?#]/)[0] === url)) return false;
  if (!message || (message as { channel?: string }).channel !== 'hub.rpc') return false;
  const parsed = rpcSchema.safeParse((message as { request?: unknown }).request);
  if (!parsed.success) { respond({ ok: false, error: { code: 'validation.invalid', message: 'validation.invalid' } }); return false; }
  void ready.then(() => dispatch(parsed.data)).then(data => { respond({ ok: true, data }); if (!['getSnapshot', 'getTaskEvents', 'exportData', 'getAgentDetection', 'getWebDiscovery'].includes(parsed.data.method)) notify(); }).catch(error => { const code = errorCode(error); respond({ ok: false, error: { code, message: code } }); });
  return true;
});
chrome.permissions.onRemoved.addListener(invalidateDiscovery);
chrome.permissions.onAdded.addListener(invalidateDiscovery);
chrome.tabs.onCreated.addListener(invalidateDiscovery);
chrome.tabs.onRemoved.addListener(invalidateDiscovery);
chrome.tabs.onUpdated.addListener(invalidateDiscovery);
chrome.tabs.onAttached.addListener(invalidateDiscovery);
chrome.tabs.onDetached.addListener(invalidateDiscovery);
chrome.tabs.onReplaced.addListener(invalidateDiscovery);
chrome.alarms.onAlarm.addListener(alarm => { if (alarm.name === 'hub-maintenance') void ready.then(async () => { await repository.cleanup(); notify(); }).catch(() => undefined); });
chrome.runtime.onInstalled.addListener(() => { void chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }); });
chrome.action.onClicked.addListener(tab => { if (tab.windowId !== undefined) void chrome.sidePanel.open({ windowId: tab.windowId }); });
