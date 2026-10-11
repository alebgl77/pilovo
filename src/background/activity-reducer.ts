import type { ActivityEvidence, WebActivityObservation, WebActivityState, WebAttentionReason, WebUnknownReason } from '../shared/activity';
import type { WebProvider } from '../shared/web';

// What the worker observed in one document. Tab-level identity (session number, position, label) lives beside the
// records, in WebActivity, and is only added to snapshots: it survives record replacement and never reaches the badge.
export type ObservedActivity = Omit<WebActivityObservation, 'sessionNumber' | 'tabIndex' | 'label'>;
export interface ActivityRecord { identity: string; observation: ObservedActivity; worked: boolean; idleSince?: number }
export function newActivityRecord(provider: WebProvider, tabId: number, windowId: number, identity: string, now: number, wall: number): ActivityRecord {
  return { identity, worked: false, observation: { id: crypto.randomUUID(), provider, tabId, windowId, state: 'unknown', provenance: 'observed_ui', observedAt: wall, validUntil: now, stateSince: now, unknownReason: 'no_evidence' } };
}
// stateSince restarts only when the state changes; repeated samples of the same state keep it.
const enter = (observation: ObservedActivity, state: WebActivityState, now: number) => { if (observation.state !== state) observation.stateSince = now; observation.state = state; };
/** `now` is the monotonic time of the transition; validUntil defaults to it (immediately stale). */
export function makeUnknown(record: ActivityRecord, reason: WebUnknownReason, now: number, validUntil = now) {
  record.worked = false; delete record.idleSince;
  record.observation = { ...record.observation, state: 'unknown', validUntil, stateSince: record.observation.state === 'unknown' ? record.observation.stateSince : now, unknownReason: reason };
  delete record.observation.attention;
}
export function reduceActivity(record: ActivityRecord, evidence: ActivityEvidence, now: number, wall: number, validUntil: number): void {
  const observation = record.observation;
  observation.observedAt = wall; observation.validUntil = validUntil;
  delete observation.unknownReason;
  const attention = (reason: WebAttentionReason) => {
    // A new identity records when it was raised, and its state starts then; a persisting attention keeps both.
    if (observation.attention?.reason !== reason) { observation.attention = { id: crypto.randomUUID(), reason, acknowledged: false, raisedAt: now }; observation.stateSince = now; }
    observation.state = 'attention';
  };
  if (evidence === 'unknown') { makeUnknown(record, 'no_evidence', now, validUntil); return; }
  if (evidence === 'working') {
    record.worked = true; delete record.idleSince; delete observation.attention; enter(observation, 'working', now); return;
  }
  if (evidence === 'input_required' || evidence === 'error_visible') {
    record.worked = false; delete record.idleSince; attention(evidence); return;
  }
  if (record.worked) {
    if (record.idleSince === undefined) record.idleSince = now;
    if (now - record.idleSince >= 1_000) { attention('response_ready'); record.worked = false; delete record.idleSince; }
    // The ready debounce is still working: the state, and so stateSince, is unchanged.
    else { enter(observation, 'working', now); delete observation.attention; }
  } else if (observation.attention?.reason !== 'response_ready') { enter(observation, 'idle', now); delete observation.attention; }
}
