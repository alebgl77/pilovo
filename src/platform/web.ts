import { HubError } from '../shared/errors';
import { emptyWebDiscovery, WEB_ORIGINS, WEB_PROVIDERS, webProviderSchema, type WebDiscovery, type WebProvider } from '../shared/web';

export interface WebTab { id?: number; windowId: number; url?: string; pendingUrl?: string; incognito?: boolean }
export interface WebBrowserAccess {
  hasPermission(): Promise<boolean>;
  queryTabs(patterns: string[]): Promise<WebTab[]>;
  getTab(id: number): Promise<WebTab>;
  focusTab(id: number): Promise<void>;
  focusWindow(id: number): Promise<void>;
  createTab(url: string): Promise<void>;
}
export function matchesWebProvider(raw: string | undefined, provider: WebProvider): boolean {
  if (!raw) return false;
  try {
    const url = new URL(raw), known = WEB_PROVIDERS.find(item => item.id === provider)!;
    return url.protocol === 'https:' && url.hostname === new URL(known.url).hostname && !url.username && !url.password && !url.port;
  } catch { return false; }
}
function eligibleTab(tab: WebTab, provider: WebProvider): boolean {
  return !tab.incognito && Number.isInteger(tab.id) && tab.id! >= 0 && Number.isInteger(tab.windowId) && tab.windowId >= 0 && matchesWebProvider(tab.url, provider) && (!tab.pendingUrl || matchesWebProvider(tab.pendingUrl, provider));
}
export class WebBrowser {
  private generation = 0;
  constructor(private readonly access: WebBrowserAccess) {}
  invalidate() { this.generation++; }
  async discovery(): Promise<WebDiscovery> {
    const generation = this.generation;
    try {
      if (!await this.access.hasPermission()) return emptyWebDiscovery('not-granted');
      const tabs = await this.access.queryTabs([...WEB_ORIGINS]);
      if (!await this.access.hasPermission() || generation !== this.generation) return emptyWebDiscovery('not-granted');
      // Only IDs leave this boundary; titles, URLs and unrelated browser metadata are never exposed or persisted.
      return { permission: 'granted', providers: WEB_PROVIDERS.map(({ id }) => ({ id, tabs: tabs.filter(tab => eligibleTab(tab, id)).map(tab => ({ tabId: tab.id!, windowId: tab.windowId })) })) };
    } catch { return emptyWebDiscovery('unavailable'); }
  }
  async open(provider: WebProvider, tabId?: number): Promise<void> {
    if (!webProviderSchema.safeParse(provider).success || tabId !== undefined && (!Number.isInteger(tabId) || tabId < 0)) throw new HubError('validation.invalid');
    if (tabId === undefined) {
      try { await this.access.createTab(WEB_PROVIDERS.find(item => item.id === provider)!.url); } catch { throw new HubError('navigation.closed'); }
      return;
    }
    const generation = this.generation;
    if (!await this.access.hasPermission()) throw new HubError('permission.denied');
    let tab: WebTab;
    try { tab = await this.access.getTab(tabId); } catch { throw new HubError('navigation.closed'); }
    if (tab.id !== tabId || !eligibleTab(tab, provider)) throw new HubError('navigation.changed');
    if (!await this.access.hasPermission() || generation !== this.generation) throw new HubError('permission.denied');
    // Re-read after asynchronous permission validation to catch navigation or tab closure during it.
    try { tab = await this.access.getTab(tabId); } catch { throw new HubError('navigation.closed'); }
    if (generation !== this.generation) throw new HubError('permission.denied');
    if (tab.id !== tabId || !eligibleTab(tab, provider)) throw new HubError('navigation.changed');
    try { await this.access.focusTab(tabId); if (generation !== this.generation) throw new HubError('permission.denied'); await this.access.focusWindow(tab.windowId); }
    catch (error) { throw error instanceof HubError ? error : new HubError('navigation.closed'); }
  }
}
export const chromeWebBrowser: WebBrowserAccess = {
  hasPermission: () => chrome.permissions.contains({ origins: [...WEB_ORIGINS] }),
  queryTabs: patterns => chrome.tabs.query({ url: patterns }),
  getTab: id => chrome.tabs.get(id),
  focusTab: async id => { await chrome.tabs.update(id, { active: true }); },
  focusWindow: async id => { await chrome.windows.update(id, { focused: true }); },
  createTab: async url => { await chrome.tabs.create({ url, active: true }); },
};
