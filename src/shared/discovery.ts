import type { InventoryAgent } from './launch';

export const KNOWN_BROWSER_AGENTS = [
  { id: 'fcoeoabgfenejglbffodgkkbkcdhcgfn', name: 'Claude' },
  { id: 'hehggadaopoacecdllhhajmbjkdcmajg', name: 'ChatGPT' },
] as const;
export interface BrowserAgentInstallation {
  id: string; name: string; presence: 'installed' | 'not_found' | 'unknown';
  enabled?: boolean; version?: string; installType?: string;
}
export interface AgentDetection {
  checkedAt: string;
  browserPermission: boolean;
  browserAgents: BrowserAgentInstallation[];
  localAgents: InventoryAgent[];
  jobs?: { launchRequestId: string; taskId: string; runId: string; sourceId: 'claude-code' | 'codex' }[];
  capabilities: { discovery: boolean; launch: boolean; browserActivity: boolean };
  companionStatus: 'ready' | 'unavailable' | 'upgrade_required';
}
