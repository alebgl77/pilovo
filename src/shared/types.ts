import type { BrowserActivity, ControlRequest, ControlResponse } from './launch';
import type { AgentDetection } from './discovery';
import type { WebDiscovery, WebPreparation, WebPreparationInput, WebPreparationPatch, WebProvider } from './web';
import type { ActivityShortcuts, AutoAcknowledgeSeconds, WebActivitySnapshot } from './activity';
export type SourceId = 'claude-code' | 'codex';
export type Execution = 'running' | 'waiting_input' | 'paused' | 'completed' | 'failed' | 'cancelled';
export type Connection = 'online' | 'stale' | 'disconnected';
export type EventType = 'task.started' | 'task.progress' | 'task.waiting' | 'task.completed' | 'task.failed' | 'task.cancelled';
export interface Artifact { label: string; url: string; kind: 'link' }
export interface AgentEvent {
  schemaVersion: 1; eventId: string; sourceId: SourceId; taskId: string; runId: string;
  sequence: number; timestamp: string; type: EventType;
  payload: { title?: string; missionId?: string; summary?: string; question?: string; model?: string; prompt?: string; contextUrl?: string; artifacts?: Artifact[]; progress?: { current: number; total: number; unit: string }; browserActivity?: BrowserActivity };
}
export interface Mission { id: string; title: string; createdAt: string; taskKeys: string[] }
export interface TabBinding { sessionNonce: string; tabId: number; windowId: number; url: string; attachedAt: string }
export interface VerificationCheck {
  id: string; criterion: 'sha256_matches_reference'; method: 'sha256';
  fileName: string; byteSize: number; expectedSha256: string; actualSha256: string;
  checkedAt: string; passed: boolean; provenance: 'hub_observed'; referenceProvenance: 'user_supplied';
}
export interface TaskRun {
  key: string; sourceId: SourceId; taskId: string; runId: string; missionId?: string; title: string;
  execution: Execution; connection: Connection; lastEventAt: string; receivedAt: string;
  startedAt?: string; endedAt?: string; createdAt: string; lastSequence: number; eventCount: number;
  gaps: number; uncertainty: boolean;
  verification: { status: 'unverified' | 'verified' | 'failed_review'; criterion?: string; checkedAt?: string; evidence?: string };
  review: { status: 'pending' | 'accepted' | 'rejected'; comment?: string; at?: string };
  summary?: string; question?: string; model?: string; prompt?: string; contextUrl?: string; artifacts: Artifact[];
  progress?: { current: number; total: number; unit: string }; tabBinding?: TabBinding;
  provenance: { status: 'agent_reported'; metadata: 'agent_reported'; connection: 'hub_observed' };
  associationHistory: { from?: string; to?: string; at: string }[];
  verificationChecks: VerificationCheck[];
}
// autoAcknowledgeSeconds: optional automatic seen after dwelling on the tab, 0 (off) by default; older stored settings lack it.
// notifyProviders: services with optional OS notifications, [] (off) by default; older stored settings lack it. The legacy
// notifications flag belongs to the historical native agents and stays false.
export interface Settings { language: 'fr' | 'en'; theme: 'system' | 'light' | 'dark'; retentionDays: number; retainPrompts: boolean; notifications: boolean; bridgeEnabled: boolean; autoAcknowledgeSeconds: AutoAcknowledgeSeconds; notifyProviders: WebProvider[] }
export interface Connector {
  id: SourceId; name: string; connection: Connection; maturity: 'proof-of-concept'; protocolVersion: 1;
  adapterVersion: string; testedVersion: string | null; lastVerifiedAt: string | null; lastSeenAt?: string;
  capabilities: { events: true; results: true; navigation: true; commands: false; approval: false; automaticDiscovery: boolean; launch?: boolean };
}
export type BridgeStatus = 'disabled' | 'connecting' | 'connected' | 'disconnected' | 'permission_required' | 'unavailable';
export interface Diagnostics { acceptedEvents: number; duplicateEvents: number; rejectedEvents: number; lastError?: ErrorCode; lastErrorAt?: string }
export interface Snapshot { missions: Mission[]; tasks: TaskRun[]; webPreparations?: WebPreparation[]; connectors: Connector[]; settings: Settings; bridgeStatus: BridgeStatus; diagnostics: Diagnostics; mode: 'extension' | 'preview' }
export type ErrorCode = 'validation.invalid' | 'source.mismatch' | 'source.cross_reference' | 'event.order' | 'event.deleted' | 'storage.failed' | 'storage.limit' | 'task.missing' | 'mission.missing' | 'preparation.conflict' | 'permission.denied' | 'bridge.unavailable' | 'navigation.unbound' | 'navigation.expired' | 'navigation.closed' | 'navigation.changed' | 'navigation.unsafe' | 'runtime.unavailable';
export interface ApiError { code: ErrorCode; message: string }
export type ApiResult<T> = { ok: true; data: T } | { ok: false; error: ApiError };
export interface ExportData { schemaVersion: 1 | 2; exportedAt: string; settings: Settings; missions: Mission[]; tasks: TaskRun[]; events: AgentEvent[]; webPreparations?: WebPreparation[] }
export interface HubClient {
  getWebActivity?(): Promise<WebActivitySnapshot>;
  focusWebActivity?(id: string): Promise<void>;
  acknowledgeWebActivity?(id: string, attentionId: string): Promise<void>;
  acknowledgeAllWebActivity?(attentionIds?: string[]): Promise<number>;
  labelWebActivity?(id: string, label: string | null): Promise<void>;
  getCurrentWindowId?(): Promise<number | undefined>;
  getShortcuts?(): Promise<ActivityShortcuts>;
  getWebDiscovery?(): Promise<WebDiscovery>;
  requestWebDiscoveryPermission?(provider?: WebProvider): Promise<boolean>;
  removeWebDiscoveryPermission?(provider?: WebProvider): Promise<boolean>;
  // Optional OS notifications: Chrome's optional notifications permission, read and changed from the UI only.
  hasNotificationPermission?(): Promise<boolean>;
  requestNotificationPermission?(): Promise<boolean>;
  removeNotificationPermission?(): Promise<boolean>;
  createWebPreparation?(input: WebPreparationInput): Promise<WebPreparation>;
  updateWebPreparation?(id: string, patch: WebPreparationPatch): Promise<WebPreparation>;
  deleteWebPreparation?(id: string): Promise<void>;
  openWebProvider?(provider: WebProvider, tabId?: number): Promise<void>;
  getAgentDetection?(refresh?: boolean): Promise<AgentDetection>;
  requestDiscoveryPermission?(): Promise<boolean>;
  removeDiscoveryPermission?(): Promise<boolean>;
  controlAgent?(request: ControlRequest): Promise<ControlResponse>;
  getSnapshot(): Promise<Snapshot>;
  getTaskEvents(key: string, limit?: number): Promise<AgentEvent[]>;
  createMission(title: string): Promise<Mission>;
  updateMission(id: string, title: string): Promise<Mission>;
  assignTask(key: string, missionId?: string): Promise<void>;
  reviewTask(key: string, status: 'pending' | 'accepted' | 'rejected', comment?: string): Promise<void>;
  verifyArtifactHash(key: string, file: File, expectedSha256: string): Promise<VerificationCheck>;
  updateSettings(patch: Partial<Settings>): Promise<Settings>;
  deleteTask(key: string): Promise<void>;
  deleteMission(id: string, deleteTasks?: boolean): Promise<void>;
  purgeAll(): Promise<void>;
  exportData(): Promise<ExportData>;
  attachActiveTab(key: string): Promise<void>;
  focusTaskTab(key: string): Promise<void>;
  openTaskContext(key: string): Promise<void>;
  connectBridge(): Promise<void>;
  disconnectBridge(): Promise<void>;
  requestBridgePermission(): Promise<boolean>;
  subscribe(listener: () => void): () => void;
}
