import { HubRepository } from '../domain/repository';
import { errorCode, HubError } from '../shared/errors';
import { rpcSchema, type RpcRequest } from '../shared/rpc';
import type { ApiResult, Settings } from '../shared/types';
import { chromeWebBrowser, WebBrowser } from '../platform/web';
import { WebActivity, chromeActivityAccess } from './activity';
import { WEB_PROVIDERS } from '../shared/web';

const repository = new HubRepository();
const web = new WebBrowser(chromeWebBrowser);
let notifyTimer: ReturnType<typeof setTimeout> | undefined;
const notify = () => { if (notifyTimer) return; notifyTimer = setTimeout(() => { notifyTimer = undefined; void chrome.runtime.sendMessage({ channel: 'hub.changed' }).catch(() => undefined); }, 200); };
const activity = new WebActivity(chromeActivityAccess((provider, tabId, current) => web.open(provider, tabId, current), notify));
const invalidateDiscovery = () => { web.invalidate(); notify(); };
// The toolbar title follows the app's language setting, and automatic seen its delay (off by default). A reply applies
// only if no newer call has applied yet, so an older call resolving late cannot restore its values. updateSettings can
// reject after its settings write committed (the retention cleanup that follows is a separate write), so a failed call
// re-reads the persisted settings.
let settingsCalls = 0, settingsApplied = 0;
const applySettings = (call: number, settings: Settings) => { if (call > settingsApplied) { settingsApplied = call; activity.setLanguage(settings.language); activity.setAutoAcknowledge(settings.autoAcknowledgeSeconds); } };
const updateSettings = async (patch: Partial<Settings>) => {
  const call = ++settingsCalls;
  try { const settings = await repository.updateSettings(patch); applySettings(call, settings); return settings; }
  catch (error) { await repository.snapshot().then(snapshot => applySettings(call, snapshot.settings), () => undefined); throw error; }
};
async function dispatch(request: RpcRequest): Promise<unknown> {
  switch (request.method) {
    case 'getWebActivity': return activity.snapshot();
    case 'focusWebActivity': return activity.focus(request.id);
    case 'acknowledgeWebActivity': return activity.acknowledge(request.id, request.attentionId);
    case 'acknowledgeAllWebActivity': return activity.acknowledgeAll(request.attentionIds);
    case 'labelWebActivity': return activity.label(request.id, request.label);
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
    case 'updateSettings': return updateSettings(request.patch);
    case 'deleteTask': return repository.deleteTask(request.key);
    case 'deleteMission': return repository.deleteMission(request.id, request.deleteTasks);
    case 'purgeAll': return repository.purgeAll();
    case 'exportData': return repository.exportData();
    case 'attachActiveTab': case 'focusTaskTab': case 'openTaskContext': throw new HubError('permission.denied');
  }
}
const ready = (async () => {
  await updateSettings({ bridgeEnabled: false });
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
// Opening, closing, moving, attaching or detaching a tab shifts its neighbors' positions: observed rows re-read theirs.
chrome.tabs.onCreated.addListener(tab => { invalidateDiscovery(); if (tab.id !== undefined) activity.updateTab(tab.id, {}, tab); void activity.reindex(); });
chrome.tabs.onRemoved.addListener(tabId => { invalidateDiscovery(); activity.invalidateTab(tabId, true); void activity.reindex(); });
chrome.tabs.onUpdated.addListener((tabId, change, tab) => { invalidateDiscovery(); activity.updateTab(tabId, change, tab); });
// A move within a window changes only positions, never evidence or the session, so rows keep their state.
chrome.tabs.onMoved.addListener(() => { void activity.reindex(); });
chrome.tabs.onAttached.addListener((tabId, info) => { invalidateDiscovery(); activity.invalidateTab(tabId); void activity.refresh(); void activity.reindex(); activity.tabViewChanged(tabId, info.newWindowId); });
chrome.tabs.onDetached.addListener((tabId, info) => { invalidateDiscovery(); activity.invalidateTab(tabId); void activity.reindex(); activity.tabViewChanged(tabId, info.oldWindowId); });
chrome.tabs.onReplaced.addListener((added, removed) => { invalidateDiscovery(); activity.invalidateTab(removed, true); activity.invalidateTab(added, true); void activity.refresh(); activity.viewChanged(); });
// Optional automatic seen (off by default) follows what the user looks at: the active tab of Chrome's focused window.
// These events only stop any dwell and, when the setting is on, trigger a fresh query; WINDOW_ID_NONE: Chrome lost focus.
// A tab event that touches neither the viewed tab nor its window leaves a running dwell alone.
chrome.tabs.onActivated.addListener(info => { activity.tabViewChanged(info.tabId, info.windowId); });
chrome.windows.onFocusChanged.addListener(windowId => { activity.viewChanged(windowId); });
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
