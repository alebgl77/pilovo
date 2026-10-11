import type { ActivityEvidence, WebActivityObservation, WebAttentionReason, WebUnknownReason } from '../shared/activity';
import type { WebProvider } from '../shared/web';

export interface ActivityRecord { identity: string; observation: WebActivityObservation; worked: boolean; idleSince?: number }
export function newActivityRecord(provider: WebProvider, tabId: number, windowId: number, identity: string, now: number, wall: number): ActivityRecord {
  return { identity, worked: false, observation: { id: crypto.randomUUID(), provider, tabId, windowId, state: 'unknown', provenance: 'observed_ui', observedAt: wall, validUntil: now, unknownReason: 'no_evidence' } };
}
export function makeUnknown(record: ActivityRecord, reason: WebUnknownReason, now: number) {
  record.worked = false; delete record.idleSince;
  record.observation = { ...record.observation, state: 'unknown', validUntil: now, unknownReason: reason };
  delete record.observation.attention;
}
export function reduceActivity(record: ActivityRecord, evidence: ActivityEvidence, now: number, wall: number, validUntil: number): void {
  const observation = record.observation;
  observation.observedAt = wall; observation.validUntil = validUntil;
  delete observation.unknownReason;
  const attention = (reason: WebAttentionReason) => {
    observation.state = 'attention';
    // A new identity records when it was raised; a persisting attention keeps its original order.
    if (observation.attention?.reason !== reason) observation.attention = { id: crypto.randomUUID(), reason, acknowledged: false, raisedAt: now };
  };
  if (evidence === 'unknown') { makeUnknown(record, 'no_evidence', validUntil); return; }
  if (evidence === 'working') {
    record.worked = true; delete record.idleSince; delete observation.attention; observation.state = 'working'; return;
  }
  if (evidence === 'input_required' || evidence === 'error_visible') {
    record.worked = false; delete record.idleSince; attention(evidence); return;
  }
  if (record.worked) {
    if (record.idleSince === undefined) record.idleSince = now;
    if (now - record.idleSince >= 1_000) { attention('response_ready'); record.worked = false; delete record.idleSince; }
    else { observation.state = 'working'; delete observation.attention; }
  } else if (observation.attention?.reason !== 'response_ready') { observation.state = 'idle'; delete observation.attention; }
}
