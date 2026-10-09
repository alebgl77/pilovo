import { createHmac, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import { eventSchema } from '../src/shared/protocol';
import type { AgentEvent, SourceId } from '../src/shared/types';

const envelopeSchema = z.object({ version: z.literal(1), body: z.string().min(1).max(190000), signature: z.string().regex(/^[a-f0-9]{64}$/) }).strict();
export type Envelope = z.infer<typeof envelopeSchema>;
export function canonical(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  return `{${Object.entries(value).filter(([, val]) => val !== undefined).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([key, val]) => `${JSON.stringify(key)}:${canonical(val)}`).join(',')}}`;
}
export function sign(value: unknown, secret: string): Envelope {
  const body = Buffer.from(canonical(value), 'utf8').toString('base64');
  const signature = createHmac('sha256', Buffer.from(secret, 'hex')).update(`hub-envelope-v1:${body}`).digest('hex');
  return envelopeSchema.parse({ version: 1, body, signature });
}
export function verify(input: unknown, secret: string): unknown {
  const envelope = envelopeSchema.parse(input);
  const expected = createHmac('sha256', Buffer.from(secret, 'hex')).update(`hub-envelope-v1:${envelope.body}`).digest();
  if (!timingSafeEqual(expected, Buffer.from(envelope.signature, 'hex'))) throw new Error('signature_mismatch');
  const bytes = Buffer.from(envelope.body, 'base64');
  if (bytes.toString('base64') !== envelope.body) throw new Error('invalid_base64');
  const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  const parsed: unknown = JSON.parse(text);
  if (canonical(parsed) !== text) throw new Error('noncanonical_body');
  return parsed;
}
export function verifyEvent(input: unknown, secret: string, sourceId: SourceId): AgentEvent {
  const event = eventSchema.parse(verify(input, secret));
  if (event.sourceId !== sourceId) throw new Error('source_mismatch');
  // These adapters deliberately do not collect prompts, even when the hub supports opt-in prompts.
  if (event.payload.prompt !== undefined) throw new Error('prompt_collection_disabled');
  return event;
}
export const leaseSchema = z.object({ version: z.literal(1), sourceId: z.enum(['claude-code', 'codex']), sessionId: z.uuid(), pid: z.number().int().positive(), timestamp: z.iso.datetime(), expiresAt: z.iso.datetime() }).strict();
