import { HubError } from '../shared/errors';
import { safeHttpUrl } from '../shared/protocol';
import type { HubRepository } from '../domain/repository';

export interface BrowserNavigation {
  hasTabsPermission(): Promise<boolean>;
  getSessionNonce(): Promise<string>;
  activeTab(): Promise<{ id?: number; windowId: number; url?: string }>;
  getTab(id: number): Promise<{ id?: number; windowId: number; url?: string }>;
  focusTab(id: number): Promise<void>;
  focusWindow(id: number): Promise<void>;
  createTab(url: string): Promise<{ id?: number; windowId: number; url?: string }>;
}
export class TaskNavigation {
  constructor(private readonly repository: HubRepository, private readonly browser: BrowserNavigation) {}
  private async permission() { if (!await this.browser.hasTabsPermission()) throw new HubError('permission.denied'); }
  private async bind(key: string, tab: { id?: number; windowId: number; url?: string }, expectedUrl?: string) {
    const url = tab.url ? safeHttpUrl(tab.url) : null;
    if (tab.id === undefined || !url || expectedUrl && url !== expectedUrl) throw new HubError('navigation.unsafe');
    await this.repository.bindTab(key, { sessionNonce: await this.browser.getSessionNonce(), tabId: tab.id, windowId: tab.windowId, url, attachedAt: new Date().toISOString() });
  }
  async attachActiveTab(key: string) { await this.permission(); await this.repository.getTask(key); await this.bind(key, await this.browser.activeTab()); }
  async focusTaskTab(key: string) {
    await this.permission();
    const { tabBinding: binding } = await this.repository.getTask(key);
    if (!binding) throw new HubError('navigation.unbound');
    if (binding.sessionNonce !== await this.browser.getSessionNonce()) throw new HubError('navigation.expired');
    let tab: Awaited<ReturnType<BrowserNavigation['getTab']>>;
    try { tab = await this.browser.getTab(binding.tabId); } catch { throw new HubError('navigation.closed'); }
    if (tab.id !== binding.tabId || tab.windowId !== binding.windowId || !tab.url || safeHttpUrl(tab.url) !== binding.url) throw new HubError('navigation.changed');
    try { await this.browser.focusTab(binding.tabId); await this.browser.focusWindow(binding.windowId); } catch { throw new HubError('navigation.closed'); }
  }
  async openTaskContext(key: string) {
    await this.permission(); const task = await this.repository.getTask(key);
    const url = task.contextUrl ? safeHttpUrl(task.contextUrl) : null;
    if (!url) throw new HubError('navigation.unsafe');
    await this.bind(key, await this.browser.createTab(url), url);
  }
}
let noncePromise: Promise<string> | undefined;
export async function createChromeTab(url: string, timeoutMs = 10_000): Promise<chrome.tabs.Tab> {
  const created = await chrome.tabs.create({ url, active: true });
  if (created.id === undefined) throw new HubError('navigation.closed');
  const tabId = created.id;
  // Chrome may return pendingUrl with no committed URL. Bind only after observing the exact URL.
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (tab?: chrome.tabs.Tab, error?: HubError) => {
      if (settled) return; settled = true; clearTimeout(timer);
      chrome.tabs.onUpdated.removeListener(updated); chrome.tabs.onRemoved.removeListener(removed);
      if (error) reject(error); else resolve(tab!);
    };
    const inspect = (tab: chrome.tabs.Tab) => {
      if (tab.url && safeHttpUrl(tab.url) === url) finish(tab);
      else if (tab.url && tab.url !== 'about:blank' && tab.status === 'complete') finish(undefined, new HubError('navigation.changed'));
    };
    const updated = (id: number, _change: unknown, tab: chrome.tabs.Tab) => { if (id === tabId) inspect(tab); };
    const removed = (id: number) => { if (id === tabId) finish(undefined, new HubError('navigation.closed')); };
    const timer = setTimeout(() => finish(undefined, new HubError('navigation.unsafe')), timeoutMs);
    chrome.tabs.onUpdated.addListener(updated); chrome.tabs.onRemoved.addListener(removed);
    // Re-query after installing listeners, covering a commit between create() and listener attachment.
    void chrome.tabs.get(tabId).then(inspect, () => finish(undefined, new HubError('navigation.closed')));
  });
}
export const chromeNavigation: BrowserNavigation = {
  hasTabsPermission: () => chrome.permissions.contains({ permissions: ['tabs'] }),
  getSessionNonce: () => noncePromise ??= chrome.storage.session.get('browserSessionNonce').then(async data => {
    if (typeof data.browserSessionNonce === 'string') return data.browserSessionNonce;
    const nonce = crypto.randomUUID(); await chrome.storage.session.set({ browserSessionNonce: nonce }); return nonce;
  }),
  activeTab: async () => { const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true }); if (!tab) throw new HubError('navigation.closed'); return tab; },
  getTab: id => chrome.tabs.get(id),
  focusTab: async id => { await chrome.tabs.update(id, { active: true }); },
  focusWindow: async id => { await chrome.windows.update(id, { focused: true }); },
  createTab: createChromeTab,
};
