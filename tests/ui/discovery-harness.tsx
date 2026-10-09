// Test fixture only: never part of the production build.
import { createRoot } from 'react-dom/client';
import { App } from '../../src/ui/App';
import { client } from '../../src/platform/client';
import { CONNECTORS, DEFAULT_SETTINGS } from '../../src/shared/defaults';
import type { HubClient, Snapshot } from '../../src/shared/types';
import type { AgentDetection } from '../../src/shared/discovery';
import type { ControlRequest } from '../../src/shared/launch';
import '../../src/ui/styles.css';
const calls: ControlRequest[] = [], listeners = new Set<() => void>();
let permission = false;
const snapshot: Snapshot = { mode: 'extension', bridgeStatus: 'connected', connectors: CONNECTORS, settings: { ...DEFAULT_SETTINGS, language: 'fr' }, missions: [], tasks: [], diagnostics: { acceptedEvents: 0, duplicateEvents: 0, rejectedEvents: 0 } };
const detection = (): AgentDetection => ({ checkedAt: new Date().toISOString(), browserPermission: permission, browserAgents: permission ? [{ id: 'fcoeoabgfenejglbffodgkkbkcdhcgfn', name: 'Claude', presence: 'installed', enabled: true, version: '1.0.98', installType: 'normal' }, { id: 'hehggadaopoacecdllhhajmbjkdcmajg', name: 'ChatGPT', presence: 'unknown' }] : [], localAgents: [{ sourceId: 'claude-code', availability: 'available', browserMode: 'unavailable', version: '2.1.289' }, { sourceId: 'codex', availability: 'available', browserMode: 'unavailable', version: '0.160.0' }], companionStatus: 'ready', capabilities: { launch: true, discovery: true, browserActivity: true } });
const api: HubClient = { ...client, getSnapshot: async () => snapshot, getAgentDetection: async () => detection(), requestDiscoveryPermission: async () => { permission = true; return true; }, removeDiscoveryPermission: async () => { permission = false; return true; }, updateSettings: async patch => { Object.assign(snapshot.settings, patch); listeners.forEach(listener => listener()); return snapshot.settings; }, subscribe: listener => { listeners.add(listener); return () => { listeners.delete(listener); }; }, controlAgent: async request => {
  calls.push(request);
  if (request.kind === 'launch.request') { if (calls.length === 1) throw new Error('simulated transport loss'); return { kind: 'launch.result', requestId: request.requestId, status: 'accepted', taskId: crypto.randomUUID(), runId: crypto.randomUUID() }; }
  return { kind: 'cancel.result', requestId: request.requestId, status: 'cancelled' };
} };
Object.assign(window, { __hubDiscoveryTest: { calls: () => calls, permission: () => permission } });
createRoot(document.getElementById('root')!).render(<App api={api} />);
