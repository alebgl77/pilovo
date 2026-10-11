import { z } from 'zod';
import type { WebProvider } from './web';

export const ACTIVITY_TTL = 15_000;
export const ACTIVITY_HEARTBEAT = 5_000;
export const monotonicEpoch = () => performance.timeOrigin + performance.now();
export type WebActivityState = 'unknown' | 'idle' | 'working' | 'attention';
export type WebAttentionReason = 'response_ready' | 'input_required' | 'error_visible';
export type WebUnknownReason = 'no_evidence' | 'expired' | 'navigation' | 'unavailable';
export interface WebActivityObservation {
  id: string; provider: WebProvider; tabId: number; windowId: number;
  // Tab-level identity, kept by the worker for the tab's lifetime and added to each snapshot; never page content.
  // sessionNumber: per provider, the smallest free positive integer when the tab is first observed in this worker life.
  // tabIndex: Chrome's 0-based position of the tab in its window (Tab.index), when read. label: typed by the user.
  sessionNumber: number; tabIndex?: number; label?: string;
  state: WebActivityState; provenance: 'observed_ui'; observedAt: number; validUntil: number;
  // raisedAt and stateSince use the monotonic clock of validUntil; they are not wall-clock records.
  // raisedAt orders attention. stateSince is when the current state (for attention, its identity) began within this
  // record identity; the panel derives an ephemeral elapsed duration from it, which restarts when evidence is lost.
  stateSince: number;
  attention?: { id: string; reason: WebAttentionReason; acknowledged: boolean; raisedAt: number };
  unknownReason?: WebUnknownReason;
}
// Keyboard commands are declared in the manifest; they never grant access or carry page data.
export const ACTIVITY_COMMANDS = ['focus-next-attention', 'acknowledge-all-attention'] as const;
export type ActivityCommand = typeof ACTIVITY_COMMANDS[number];
export type ActivityShortcuts = Partial<Record<ActivityCommand, string>>;
export const activityShortcutsSchema = z.array(z.object({ name: z.string().max(64).optional(), shortcut: z.string().max(64).optional() })).max(32);
// A session label is plain text typed in the panel and kept in worker memory only. Controls and the bidi embedding,
// override and isolate characters are refused so a label cannot reorder the row text displayed around it. They are
// written as escapes: raw bidi controls in source are hidden from review (check:publication refuses them).
export const ACTIVITY_LABEL_MAX = 40;
const unsafeLabel = /[\p{Cc}\u202A-\u202E\u2066-\u2069]/u;
export const activityLabelSchema = z.string().trim().min(1).max(ACTIVITY_LABEL_MAX).refine(value => !unsafeLabel.test(value));
// Optional automatic seen: seconds an attention's tab must stay the active tab of Chrome's focused window before the
// worker acknowledges that attention locally. 0, the default, turns it off. Seen is never verification or approval.
export const AUTO_ACKNOWLEDGE_SECONDS = [0, 5, 15, 30] as const;
export type AutoAcknowledgeSeconds = typeof AUTO_ACKNOWLEDGE_SECONDS[number];
export const autoAcknowledgeSchema = z.literal(AUTO_ACKNOWLEDGE_SECONDS);
export interface WebActivitySnapshot {
  availability: 'available' | 'unavailable'; observations: WebActivityObservation[]; observedAt: number;
}
// Content messages carry no state or page content. They only ask the worker to sample again.
export const activityHintSchema = z.object({
  channel: z.literal('pilovo.observe'), version: z.literal(1), activationId: z.uuid(),
  sequence: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  kind: z.enum(['boot', 'change', 'heartbeat']),
}).strict();
export const activitySampleSchema = z.object({
  version: z.literal(1), requestId: z.uuid(), activationId: z.uuid(),
  evidence: z.enum(['working', 'idle_ready', 'input_required', 'error_visible', 'unknown']),
}).strict();
export type ActivityEvidence = z.infer<typeof activitySampleSchema>['evidence'];
export interface ActivityLease { workerId: string; grantId: string; requestId: string; issuedAt: number; expiresAt: number }
