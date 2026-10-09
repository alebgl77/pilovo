import { beforeEach, describe, expect, it, vi } from 'vitest';
import { matchesWebProvider, WebBrowser, type WebBrowserAccess, type WebTab } from '../../src/platform/web';
import { WEB_ORIGINS } from '../../src/shared/web';

let access: WebBrowserAccess, browser: WebBrowser;
const tab = (patch: Partial<WebTab> = {}): WebTab => ({ id: 42, windowId: 3, url: 'https://claude.ai/chat/a', incognito: false, ...patch });
beforeEach(() => {
  access = { hasPermission: vi.fn().mockResolvedValue(true), queryTabs: vi.fn().mockResolvedValue([tab()]), getTab: vi.fn().mockResolvedValue(tab()), focusTab: vi.fn().mockResolvedValue(undefined), focusWindow: vi.fn().mockResolvedValue(undefined), createTab: vi.fn().mockResolvedValue(undefined) };
  browser = new WebBrowser(access);
});

describe('limited web discovery', () => {
  it('preserves independently granted provider discovery when the other is denied or unavailable', async () => {
    vi.mocked(access.hasPermission).mockImplementation(async provider => provider === 'claude-web');
    let result = await browser.discovery(); expect(result.permission).toBe('not-granted'); expect(result.providers[0]).toMatchObject({ permission: 'granted', tabs: [{ tabId: 42, windowId: 3 }] }); expect(result.providers[1]).toMatchObject({ permission: 'not-granted', tabs: [] });
    expect(access.queryTabs).toHaveBeenCalledWith(['https://claude.ai/*']);
    vi.mocked(access.hasPermission).mockImplementation(async provider => { if (provider === 'claude-web') return true; throw new Error('Unavailable'); });
    result = await browser.discovery(); expect(result.permission).toBe('unavailable'); expect(result.providers[0].tabs).toHaveLength(1); expect(result.providers[1].permission).toBe('unavailable');
  });
  it.each(['http://claude.ai/', 'https://claude.ai.evil.test/', 'https://sub.claude.ai/', 'https://claude.ai:444/', 'https://user:secret@claude.ai/', 'https://claude.ai./', 'javascript:alert(1)', 'https://chatgpt.com/', 'file:///claude.ai', 'not-a-url'])('rejects unsafe or mismatched URL %s', url => expect(matchesWebProvider(url, 'claude-web')).toBe(false));
  it('allows HTTPS exact provider with default port and query strings without exposing them', async () => {
    expect(matchesWebProvider('https://claude.ai:443/chat/a?secret=1', 'claude-web')).toBe(true);
    vi.mocked(access.queryTabs).mockResolvedValue([tab({ url: 'https://claude.ai/chat/a?private=1' }), tab({ id: 9, url: 'https://chatgpt.com/c/private' }), tab({ id: 10, url: 'https://unrelated.test/private' }), tab({ id: 11, incognito: true }), tab({ id: 12, pendingUrl: 'https://unrelated.test/' }), tab({ id: 13, url: undefined, pendingUrl: 'https://claude.ai/' })]);
    expect(await browser.discovery()).toEqual({ permission: 'granted', providers: [{ id: 'claude-web', permission: 'granted', tabs: [{ tabId: 42, windowId: 3 }] }, { id: 'chatgpt-web', permission: 'granted', tabs: [{ tabId: 9, windowId: 3 }] }] });
    expect(access.queryTabs).toHaveBeenCalledWith(WEB_ORIGINS);
  });
  it('denial avoids querying tabs, and unavailable APIs report unavailable', async () => {
    vi.mocked(access.hasPermission).mockResolvedValue(false); expect((await browser.discovery()).permission).toBe('not-granted'); expect(access.queryTabs).not.toHaveBeenCalled();
    vi.mocked(access.hasPermission).mockRejectedValue(new Error('Unavailable')); expect((await browser.discovery()).permission).toBe('unavailable');
  });
  it('drops results when permission is revoked during query', async () => {
    vi.mocked(access.hasPermission).mockResolvedValueOnce(true).mockResolvedValueOnce(true).mockResolvedValue(false);
    const result = await browser.discovery(); expect(result.permission).toBe('not-granted'); expect(result.providers.every(item => !item.tabs.length)).toBe(true);
  });
  it('does not leak a stale query after revoke followed by regrant', async () => {
    let release!: (tabs: WebTab[]) => void;
    vi.mocked(access.queryTabs).mockImplementation(() => new Promise(resolve => { release = resolve; }));
    const pending = browser.discovery(); await vi.waitFor(() => expect(access.queryTabs).toHaveBeenCalled()); browser.invalidate(); release([tab()]);
    expect((await pending).providers.every(item => !item.tabs.length)).toBe(true);
  });
});

describe('explicit provider opening and focus', () => {
  it('opens only fixed base URLs even without discovery permission', async () => {
    vi.mocked(access.hasPermission).mockResolvedValue(false); await browser.open('claude-web'); await browser.open('chatgpt-web');
    expect(access.createTab).toHaveBeenNthCalledWith(1, 'https://claude.ai/'); expect(access.createTab).toHaveBeenNthCalledWith(2, 'https://chatgpt.com/'); expect(access.hasPermission).not.toHaveBeenCalled();
  });
  it('re-reads an existing tab before focusing its validated current window', async () => {
    await browser.open('claude-web', 42); expect(access.getTab).toHaveBeenCalledTimes(2); expect(access.focusTab).toHaveBeenCalledWith(42); expect(access.focusWindow).toHaveBeenCalledWith(3); expect(access.createTab).not.toHaveBeenCalled();
  });
  it.each([{ id: 99 }, { url: 'https://unrelated.test/' }, { pendingUrl: 'https://unrelated.test/' }, { pendingUrl: 'http://claude.ai/' }, { incognito: true }, { windowId: -1 }, { url: undefined }])('rejects invalid tab without side effects: %j', async patch => {
    vi.mocked(access.getTab).mockResolvedValue(tab(patch)); await expect(browser.open('claude-web', 42)).rejects.toMatchObject({ code: 'navigation.changed' }); expect(access.focusTab).not.toHaveBeenCalled(); expect(access.focusWindow).not.toHaveBeenCalled(); expect(access.createTab).not.toHaveBeenCalled();
  });
  it('fails closed for tab closure and navigation during permission recheck', async () => {
    vi.mocked(access.getTab).mockRejectedValue(new Error('Closed')); await expect(browser.open('claude-web', 42)).rejects.toMatchObject({ code: 'navigation.closed' });
    vi.mocked(access.getTab).mockResolvedValueOnce(tab()).mockResolvedValueOnce(tab({ pendingUrl: 'https://evil.test/' })); await expect(browser.open('claude-web', 42)).rejects.toMatchObject({ code: 'navigation.changed' }); expect(access.focusTab).not.toHaveBeenCalled(); expect(access.createTab).not.toHaveBeenCalled();
  });
  it('handles denial and revocation before focus without focus or creating a replacement', async () => {
    vi.mocked(access.hasPermission).mockResolvedValueOnce(false); await expect(browser.open('claude-web', 42)).rejects.toMatchObject({ code: 'permission.denied' }); expect(access.getTab).not.toHaveBeenCalled();
    vi.mocked(access.hasPermission).mockResolvedValueOnce(true).mockResolvedValueOnce(false); await expect(browser.open('claude-web', 42)).rejects.toMatchObject({ code: 'permission.denied' }); expect(access.focusTab).not.toHaveBeenCalled(); expect(access.createTab).not.toHaveBeenCalled();
  });
  it('rejects revocation generation change even when a permission recheck subsequently says granted', async () => {
    vi.mocked(access.getTab).mockImplementation(async () => { browser.invalidate(); return tab(); });
    await expect(browser.open('claude-web', 42)).rejects.toMatchObject({ code: 'permission.denied' }); expect(access.focusTab).not.toHaveBeenCalled();
  });
  it('never focuses the window after permission was revoked while focusing the tab', async () => {
    vi.mocked(access.focusTab).mockImplementation(async () => { browser.invalidate(); });
    await expect(browser.open('claude-web', 42)).rejects.toMatchObject({ code: 'permission.denied' }); expect(access.focusWindow).not.toHaveBeenCalled();
  });
  it('validates provider and tab identifiers in direct calls', async () => {
    await expect(browser.open('other' as never)).rejects.toMatchObject({ code: 'validation.invalid' }); await expect(browser.open('claude-web', -1)).rejects.toMatchObject({ code: 'validation.invalid' }); expect(access.createTab).not.toHaveBeenCalled();
  });
});
