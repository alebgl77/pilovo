import { z } from 'zod';
import type { AgentEvent, SourceId } from './types';
import { browserActivitySchema } from './launch';

export const NATIVE_HOST = 'dev.agentcontrolhub.bridge';
export const PROTOCOL_VERSION = 1 as const;
export const sourceIdSchema = z.enum(['claude-code', 'codex']);
export function safeHttpUrl(value: string): string | null {
  try { const url = new URL(value); return ['https:', 'http:'].includes(url.protocol) && !url.username && !url.password && value.length <= 4096 ? url.href : null; } catch { return null; }
}
const safeUrl = z.string().max(4096).refine(value => safeHttpUrl(value) !== null, 'Safe HTTP URL required');
const identifier = z.string().min(1).max(160).regex(/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/);
export const eventSchema = z.object({
  schemaVersion: z.literal(1), eventId: z.uuid(), sourceId: sourceIdSchema, taskId: identifier, runId: identifier,
  sequence: z.number().int().min(1).max(Number.MAX_SAFE_INTEGER), timestamp: z.iso.datetime({ offset: true }),
  type: z.enum(['task.started', 'task.progress', 'task.waiting', 'task.completed', 'task.failed', 'task.cancelled']),
  payload: z.object({ browserActivity: browserActivitySchema.optional(), title: z.string().min(1).max(240).optional(), missionId: z.uuid().optional(), summary: z.string().max(16000).optional(), question: z.string().max(4000).optional(), model: z.string().max(160).optional(), prompt: z.string().max(32000).optional(), contextUrl: safeUrl.optional(), artifacts: z.array(z.object({ label: z.string().min(1).max(240), url: safeUrl, kind: z.literal('link') }).strict()).max(32).optional(), progress: z.object({ current: z.number().finite().nonnegative(), total: z.number().finite().positive(), unit: z.string().min(1).max(48) }).strict().refine(p => p.current <= p.total).optional() }).strict(),
}).strict();
export const incomingSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('agent.event'), authenticatedSourceId: sourceIdSchema, event: eventSchema }).strict(),
  z.object({ kind: z.literal('bridge.ready'), protocolVersion: z.literal(1), capabilities: z.object({ discovery: z.boolean(), launch: z.boolean(), browserActivity: z.boolean() }).strict().optional() }).strict(),
  z.object({ kind: z.literal('agent.connection'), authenticatedSourceId: sourceIdSchema, status: z.enum(['online', 'disconnected']), timestamp: z.iso.datetime({ offset: true }) }).strict(),
]);
export type NativeIncoming = z.infer<typeof incomingSchema>;
export interface EventAck { kind: 'event.ack'; sourceId: SourceId; eventId: string; status: 'accepted' | 'duplicate' | 'rejected'; reason?: string }
export function taskKey(sourceId: SourceId, taskId: string, runId: string): string { return `${sourceId}:${taskId}:${runId}`; }
export function parseEvent(input: unknown): AgentEvent { return eventSchema.parse(input); }
