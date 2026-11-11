import { z } from 'zod';
import { ACTIVITY_QUALITY_KEYS, activityQualitySchema, emptyActivityQuality, type ActivityQuality } from '../shared/activity';
import { WEB_PROVIDERS, type WebProvider } from '../shared/web';

// Observation quality counters live in Chrome's session storage area: memory only, never written to disk, cleared when the
// browser closes or the extension is reloaded or updated. They outlive a worker restart, which worker memory does not.
// live: what the worker still held when it last wrote, per service: tabs with witnessed work and announcements not yet
// seen. Activity is discarded with each worker life, so the next life counts them as lost.
export const QUALITY_KEY = 'pilovo.activityQuality';
const liveCount = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);
const serviceSchema = z.object({ counts: activityQualitySchema, live: z.object({ working: liveCount, unseen: liveCount }).strict() }).strict();
export const storedQualitySchema = z.object({ version: z.literal(1), services: z.object({ 'claude-web': serviceSchema, 'chatgpt-web': serviceSchema }).strict() }).strict();
export type StoredQuality = z.infer<typeof storedQualitySchema>;
export type QualityByProvider = Record<WebProvider, ActivityQuality>;
export type LiveQuality = StoredQuality['services'][WebProvider]['live'];

export const emptyQuality = (): QualityByProvider => Object.fromEntries(WEB_PROVIDERS.map(provider => [provider.id, emptyActivityQuality()])) as QualityByProvider;
const add = (a: number, b: number) => Math.min(Number.MAX_SAFE_INTEGER, a + b);
export function countQuality(quality: QualityByProvider, provider: WebProvider, key: keyof ActivityQuality, by = 1) { quality[provider][key] = add(quality[provider][key], by); }
export const storedQuality = (quality: QualityByProvider, live: (provider: WebProvider) => LiveQuality): StoredQuality =>
  ({ version: 1, services: Object.fromEntries(WEB_PROVIDERS.map(provider => [provider.id, { counts: { ...quality[provider.id] }, live: live(provider.id) }])) as StoredQuality['services'] });
/** Adds what an earlier worker life of this browser session stored. Anything unexpected is ignored. */
export function restoreQuality(quality: QualityByProvider, stored: unknown) {
  const parsed = storedQualitySchema.safeParse(stored);
  if (!parsed.success) return;
  for (const { id } of WEB_PROVIDERS) {
    const { counts, live } = parsed.data.services[id];
    for (const key of ACTIVITY_QUALITY_KEYS) countQuality(quality, id, key, counts[key]);
    countQuality(quality, id, 'interrupted', live.working); countQuality(quality, id, 'dropped', live.unseen);
  }
}
