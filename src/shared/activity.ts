import { z } from 'zod';
import type { WebProvider } from './web';

export const ACTIVITY_TTL = 15_000;
export const ACTIVITY_HEARTBEAT = 5_000;
// Evidence renewal. Chrome throttles page timers in background tabs (the hints above) but not the worker's: while work is
// witnessed or an item to review is unseen, the worker samples that tab again before its evidence expires. Early in a run
// the delay follows the time already spent working, so a short run is noticed quickly; it never exceeds
// ACTIVITY_RENEWAL_MAX, which leaves room for two samples (2 s at most each) inside ACTIVITY_TTL.
export const ACTIVITY_RENEWAL_MIN = 1_000;
export const ACTIVITY_RENEWAL_MAX = 10_000;
export const ACTIVITY_RENEWAL_RATIO = 0.25;
/** working: milliseconds already spent working; omitted for an unseen item to review, renewed at the slowest pace. */
export const activityRenewalDelay = (working?: number) => working === undefined ? ACTIVITY_RENEWAL_MAX : Math.min(ACTIVITY_RENEWAL_MAX, Math.max(ACTIVITY_RENEWAL_MIN, Math.floor(working * ACTIVITY_RENEWAL_RATIO)));
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
// Observation quality: what the worker observed about its own evidence, counted per service. No page content, tab, time or
// identifier. announced: a response-ready attention was raised. resumed: work was observed again within
// ACTIVITY_RESUME_WINDOW of such an announcement, which may then have come too early. dropped: an announcement not yet
// seen lost its evidence, so it left the list. interrupted: evidence was lost while work was witnessed. unobserved: the tab
// was then found at rest, so that run ended unobserved and nothing was announced. They are indications, not a reliability
// measurement: a prompt sent right after an answer also counts as resumed.
export const ACTIVITY_RESUME_WINDOW = 5_000;
const qualityCount = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);
export const activityQualitySchema = z.object({ announced: qualityCount, resumed: qualityCount, dropped: qualityCount, interrupted: qualityCount, unobserved: qualityCount }).strict();
export type ActivityQuality = z.infer<typeof activityQualitySchema>;
export const ACTIVITY_QUALITY_KEYS = ['announced', 'resumed', 'dropped', 'interrupted', 'unobserved'] as const satisfies readonly (keyof ActivityQuality)[];
export const emptyActivityQuality = (): ActivityQuality => ({ announced: 0, resumed: 0, dropped: 0, interrupted: 0, unobserved: 0 });
export interface WebActivitySnapshot {
  availability: 'available' | 'unavailable'; observations: WebActivityObservation[]; observedAt: number;
  // Optional for a snapshot built without a worker (preview, fixtures): the panel then shows no counters.
  quality?: Record<WebProvider, ActivityQuality>;
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
