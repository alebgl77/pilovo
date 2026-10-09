// Test-only adapter. Not an entry in the production build and never persists fixtures.
import { createRoot } from 'react-dom/client';
import { App } from '../../src/ui/App';
import { client } from '../../src/platform/client';
import type { AgentEvent, HubClient, Mission, Snapshot, TaskRun } from '../../src/shared/types';
import '../../src/ui/styles.css';

function deferred<T>() { let resolve!: (value: T) => void; let reject!: (error: unknown) => void; const promise = new Promise<T>((done, fail) => { resolve = done; reject = fail; }); return { promise, resolve, reject }; }
const snapshots: ReturnType<typeof deferred<Snapshot>>[] = [];
const timelines: { key: string; deferred: ReturnType<typeof deferred<AgentEvent[]>> }[] = [];
const mutations: ReturnType<typeof deferred<Mission>>[] = [];
const listeners = new Set<() => void>();
const api: HubClient = { ...client,
  getSnapshot: () => { const request = deferred<Snapshot>(); snapshots.push(request); return request.promise; },
  getTaskEvents: key => { const request = deferred<AgentEvent[]>(); timelines.push({ key, deferred: request }); return request.promise; },
  createMission: () => { const request = deferred<Mission>(); mutations.push(request); return request.promise; },
  subscribe: listener => { listeners.add(listener); return () => { listeners.delete(listener); }; },
};
const baseTask: TaskRun = { key: 'codex:A:run', sourceId: 'codex', taskId: 'A', runId: 'run', title: 'Synthetic task A', execution: 'completed', connection: 'disconnected', lastEventAt: '2026-10-09T10:01:00Z', receivedAt: '2026-10-09T10:01:00Z', createdAt: '2026-10-09T10:00:00Z', lastSequence: 2, eventCount: 2, gaps: 0, uncertainty: false, verification: { status: 'unverified' }, review: { status: 'pending' }, artifacts: [], associationHistory: [], verificationChecks: [], provenance: { status: 'agent_reported', metadata: 'agent_reported', connection: 'hub_observed' } };
const snapshot = (title: string): Snapshot => ({ mode: 'preview', bridgeStatus: 'disabled', connectors: [], diagnostics: { acceptedEvents: 0, duplicateEvents: 0, rejectedEvents: 0 }, settings: { language: 'fr', theme: 'light', retentionDays: 30, retainPrompts: false, notifications: false, bridgeEnabled: false }, missions: [{ id: 'mission', title, createdAt: '2026-10-09T10:00:00Z', taskKeys: [] }], tasks: [baseTask, { ...baseTask, key: 'claude-code:B:run', sourceId: 'claude-code', taskId: 'B', title: 'Synthetic task B' }] });
const root = createRoot(document.getElementById('root')!);
root.render(<App api={api} />);
Object.assign(window, { __hubHarness: {
  pending: () => ({ snapshots: snapshots.length, timelines: timelines.map(timeline => timeline.key), mutations: mutations.length, listeners: listeners.size }),
  resolveSnapshot: (index: number, title: string) => snapshots[index].resolve(snapshot(title)),
  signal: () => listeners.forEach(listener => listener()),
  resolveTimeline: (index: number, text: string) => { const source = index === 0 ? 'codex' : 'claude-code'; timelines[index].deferred.resolve([{ schemaVersion: 1, eventId: crypto.randomUUID(), sourceId: source, taskId: index === 0 ? 'A' : 'B', runId: 'run', sequence: 2, timestamp: '2026-10-09T10:01:00Z', type: 'task.completed', payload: { summary: text } }]); },
  rejectMutation: (index: number) => mutations[index].reject({ code: 'storage.failed', message: 'sensitive raw diagnostics must not be displayed' }),
  unmount: () => root.unmount(),
} });
