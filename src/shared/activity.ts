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
  state: WebActivityState; provenance: 'observed_ui'; observedAt: number; validUntil: number;
  // raisedAt uses the monotonic clock of validUntil; it orders attention and is not a wall-clock record.
  attention?: { id: string; reason: WebAttentionReason; acknowledged: boolean; raisedAt: number };
  unknownReason?: WebUnknownReason;
}
// Keyboard commands are declared in the manifest; they never grant access or carry page data.
export const ACTIVITY_COMMANDS = ['focus-next-attention', 'acknowledge-all-attention'] as const;
export type ActivityCommand = typeof ACTIVITY_COMMANDS[number];
export type ActivityShortcuts = Partial<Record<ActivityCommand, string>>;
export const activityShortcutsSchema = z.array(z.object({ name: z.string().max(64).optional(), shortcut: z.string().max(64).optional() })).max(32);
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
