import { z } from 'zod';

export const WEB_PROVIDERS = [
  { id: 'claude-web', name: 'Claude', url: 'https://claude.ai/', pattern: 'https://claude.ai/*' },
  { id: 'chatgpt-web', name: 'ChatGPT', url: 'https://chatgpt.com/', pattern: 'https://chatgpt.com/*' },
] as const;
export const WEB_ORIGINS = WEB_PROVIDERS.map(provider => provider.pattern);
export const webProviderSchema = z.enum(['claude-web', 'chatgpt-web']);
// Optional OS notifications: the services the user opted into, each at most once. Empty, the default, turns them off.
export const notifyProvidersSchema = z.array(webProviderSchema).max(WEB_PROVIDERS.length).refine(list => new Set(list).size === list.length);
export const webStatusSchema = z.enum(['prepared', 'sent_by_user', 'completed_by_user']);
export type WebProvider = z.infer<typeof webProviderSchema>;
export type WebPreparationStatus = z.infer<typeof webStatusSchema>;
export interface WebPreparation {
  id: string; revision: number; provider: WebProvider; title: string; prompt?: string; notes?: string; missionId?: string;
  status: WebPreparationStatus; createdAt: string; updatedAt: string; statusProvenance: 'user_reported';
}
export const webPreparationInputSchema = z.object({
  id: z.uuid(), provider: webProviderSchema, title: z.string().trim().min(1).max(160),
  prompt: z.string().max(10000).optional(), notes: z.string().max(16000).optional(),
  missionId: z.uuid().optional(), retainPrompt: z.boolean().optional(),
}).strict();
export const webPreparationPatchSchema = z.object({
  expectedRevision: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  title: z.string().trim().min(1).max(160).optional(), prompt: z.string().max(10000).nullable().optional(),
  notes: z.string().max(16000).nullable().optional(), missionId: z.uuid().nullable().optional(),
  status: webStatusSchema.optional(), retainPrompt: z.boolean().optional(),
}).strict();
export type WebPreparationInput = z.infer<typeof webPreparationInputSchema>;
export type WebPreparationPatch = z.infer<typeof webPreparationPatchSchema>;
export interface WebDiscovery {
  permission: 'granted' | 'not-granted' | 'unavailable';
  providers: { id: WebProvider; permission: WebDiscovery['permission']; tabs: { tabId: number; windowId: number }[] }[];
}
export function emptyWebDiscovery(permission: WebDiscovery['permission']): WebDiscovery {
  return { permission, providers: WEB_PROVIDERS.map(({ id }) => ({ id, permission, tabs: [] })) };
}
