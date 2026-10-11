import { HubRepository } from '../domain/repository';
import { errorCode, HubError } from '../shared/errors';
import { rpcSchema, type RpcRequest } from '../shared/rpc';
import type { ApiResult } from '../shared/types';
import { chromeWebBrowser, WebBrowser } from '../platform/web';
import { WebActivity, chromeActivityAccess } from './activity';
import { WEB_PROVIDERS } from '../shared/web';

const repository = new HubRepository();
const web = new WebBrowser(chromeWebBrowser);
let notifyTimer: ReturnType<typeof setTimeout> | undefined;
const notify = () => { if (notifyTimer) return; notifyTimer = setTimeout(() => { notifyTimer = undefined; void chrome.runtime.sendMessage({ channel: 'hub.changed' }).catch(() => undefined); }, 200); };
const activity = new WebActivity(chromeActivityAccess((provider, tabId, current) => web.open(provider, tabId, current), notify));
const invalidateDiscovery = () => { web.invalidate(); notify(); };
async function dispatch(request: RpcRequest): Promise<unknown> {
  switch (request.method) {
    case 'getWebActivity': return activity.snapshot();
    case 'focusWebActivity': return activity.focus(request.id);
    case 'acknowledgeWebActivity': return activity.acknowledge(request.id, request.attentionId);
    case 'acknowledgeAllWebActivity': return activity.acknowledgeAll(request.attentionIds);
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
  await chrome.alarms.create('pilovo-activity', { periodInMinutes: 0.5 });
  activity.start();
})();
chrome.runtime.onMessage.addListener((message: unknown, sender, respond: (response: ApiResult<unknown>) => void) => {
  if (message && (message as { channel?: string }).channel === 'pilovo.observe') { void activity.hint(message, sender).catch(() => undefined); return false; }
  if (sender.id !== chrome.runtime.id || sender.frameId && sender.frameId !== 0 || !sender.url || ![chrome.runtime.getURL('index.html'), chrome.runtime.getURL('sidepanel.html')].some(url => sender.url!.split(/[?#]/)[0] === url)) return false;
  if (!message || (message as { channel?: string }).channel !== 'hub.rpc') return false;
  const parsed = rpcSchema.safeParse((message as { request?: unknown }).request);
  if (!parsed.success) { respond({ ok: false, error: { code: 'validation.invalid', message: 'validation.invalid' } }); return false; }
  void ready.then(() => dispatch(parsed.data)).then(data => { respond({ ok: true, data }); if (!['getSnapshot', 'getTaskEvents', 'exportData', 'getAgentDetection', 'getWebDiscovery', 'getWebActivity'].includes(parsed.data.method)) notify(); }).catch(error => { const code = errorCode(error); respond({ ok: false, error: { code, message: code } }); });
  return true;
});
chrome.permissions.onRemoved.addListener(permission => { invalidateDiscovery(); for (const provider of WEB_PROVIDERS) if (permission.origins?.includes(provider.pattern)) activity.revoke(provider.id); });
chrome.permissions.onAdded.addListener(permission => { invalidateDiscovery(); for (const provider of WEB_PROVIDERS) if (permission.origins?.includes(provider.pattern)) activity.reconcile(provider.id); });
chrome.tabs.onCreated.addListener(tab => { invalidateDiscovery(); if (tab.id !== undefined) activity.updateTab(tab.id, {}, tab); });
chrome.tabs.onRemoved.addListener(tabId => { invalidateDiscovery(); activity.invalidateTab(tabId, true); });
chrome.tabs.onUpdated.addListener((tabId, change, tab) => { invalidateDiscovery(); activity.updateTab(tabId, change, tab); });
chrome.tabs.onAttached.addListener(tabId => { invalidateDiscovery(); activity.invalidateTab(tabId); void activity.refresh(); });
chrome.tabs.onDetached.addListener(tabId => { invalidateDiscovery(); activity.invalidateTab(tabId); });
chrome.tabs.onReplaced.addListener((added, removed) => { invalidateDiscovery(); activity.invalidateTab(removed, true); activity.invalidateTab(added, true); void activity.refresh(); });
chrome.alarms.onAlarm.addListener(alarm => { if (alarm.name === 'hub-maintenance') void ready.then(async () => { await repository.cleanup(); notify(); }).catch(() => undefined); });
chrome.alarms.onAlarm.addListener(alarm => { if (alarm.name === 'pilovo-activity') { activity.expire(); activity.start(); } });
// Chrome's command gesture does not survive an await: the nothing-to-review case opens the panel synchronously,
// in the command's window or else the last focused browser window, tracked ahead of time (window IDs only).
let lastFocusedWindow: number | undefined;
chrome.windows.onFocusChanged.addListener(windowId => { if (windowId >= 0) lastFocusedWindow = windowId; });
void chrome.windows.getLastFocused().then(window => { if (window.id !== undefined && window.id >= 0) lastFocusedWindow ??= window.id; }).catch(() => undefined);
const openPanel = (windowId?: number) => {
  const target = windowId !== undefined && windowId >= 0 ? windowId : lastFocusedWindow;
  if (target === undefined) return;
  try { void chrome.sidePanel.open({ windowId: target }).catch(() => undefined); } catch { /* Without a gesture or side panel support, the shortcut has no visible effect. */ }
};
chrome.commands.onCommand.addListener((command, tab) => {
  if (command === 'focus-next-attention') {
    if (!activity.pendingAttention().length) { openPanel(tab?.windowId); return; }
    // Best effort after every candidate failed; Chrome may refuse the panel once the gesture has expired.
    void ready.then(() => activity.focusNextAttention()).then(result => { if (result !== 'focused') openPanel(tab?.windowId); }).catch(() => undefined);
  } else if (command === 'acknowledge-all-attention') void ready.then(() => activity.acknowledgeAll()).catch(() => undefined);
});
chrome.runtime.onInstalled.addListener(() => { void chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }); });
chrome.action.onClicked.addListener(tab => { if (tab.windowId !== undefined) void chrome.sidePanel.open({ windowId: tab.windowId }); });
