import { KNOWN_BROWSER_AGENTS, type BrowserAgentInstallation } from '../shared/discovery';

export interface DiscoveryAccess {
  hasPermission(): Promise<boolean>;
  get(id: string): Promise<Pick<chrome.management.ExtensionInfo, 'enabled' | 'version' | 'installType'>>;
}
// Query only known IDs. Never enumerate unrelated installed extensions.
export async function discoverBrowserAgents(access: DiscoveryAccess): Promise<{ browserPermission: boolean; browserAgents: BrowserAgentInstallation[] }> {
  const browserPermission = await access.hasPermission();
  if (!browserPermission) return { browserPermission, browserAgents: [] };
  const browserAgents = await Promise.all(KNOWN_BROWSER_AGENTS.map(async known => {
    try {
      const info = await access.get(known.id);
      return { ...known, presence: 'installed' as const, enabled: info.enabled, version: info.version.slice(0, 160), installType: info.installType };
    } catch {
      // Chrome uses runtime errors for both absent IDs and transient failures.
      // Do not turn a failed lookup into a claim of absence.
      return { ...known, presence: 'unknown' as const };
    }
  }));
  if (!await access.hasPermission()) return { browserPermission: false, browserAgents: [] };
  return { browserPermission, browserAgents };
}
