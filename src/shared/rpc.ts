import { z } from 'zod';
import { hashEvidenceSchema } from '../domain/verification';
import { controlRequestSchema } from './launch';
import { webPreparationInputSchema, webPreparationPatchSchema, webProviderSchema } from './web';
const key = z.string().min(1).max(350);
export const rpcSchema = z.discriminatedUnion('method', [
  z.object({ method: z.literal('getWebDiscovery') }).strict(),
  z.object({ method: z.literal('createWebPreparation'), input: webPreparationInputSchema }).strict(),
  z.object({ method: z.literal('updateWebPreparation'), id: z.uuid(), patch: webPreparationPatchSchema }).strict(),
  z.object({ method: z.literal('deleteWebPreparation'), id: z.uuid() }).strict(),
  z.object({ method: z.literal('openWebProvider'), provider: webProviderSchema, tabId: z.number().int().min(0).optional() }).strict(),
  z.object({ method: z.literal('getAgentDetection'), refresh: z.boolean().optional() }).strict(),
  z.object({ method: z.literal('controlAgent'), request: controlRequestSchema }).strict(),
  z.object({ method: z.literal('getSnapshot') }).strict(),
  z.object({ method: z.literal('getTaskEvents'), key, limit: z.number().int().min(1).max(250).optional() }).strict(),
  z.object({ method: z.literal('createMission'), title: z.string().min(1).max(240) }).strict(),
  z.object({ method: z.literal('updateMission'), id: z.uuid(), title: z.string().min(1).max(240) }).strict(),
  z.object({ method: z.literal('assignTask'), key, missionId: z.uuid().optional() }).strict(),
  z.object({ method: z.literal('reviewTask'), key, status: z.enum(['pending', 'accepted', 'rejected']), comment: z.string().max(4000).optional() }).strict(),
  z.object({ method: z.literal('recordVerification'), key, evidence: hashEvidenceSchema }).strict(),
  z.object({ method: z.literal('updateSettings'), patch: z.object({ language: z.enum(['fr','en']).optional(), theme: z.enum(['system','light','dark']).optional(), retentionDays: z.number().int().min(1).max(365).optional(), retainPrompts: z.boolean().optional(), notifications: z.boolean().optional(), bridgeEnabled: z.boolean().optional() }).strict() }).strict(),
  z.object({ method: z.literal('deleteTask'), key }).strict(),
  z.object({ method: z.literal('deleteMission'), id: z.uuid(), deleteTasks: z.boolean().optional() }).strict(),
  ...(['purgeAll', 'exportData', 'connectBridge', 'disconnectBridge'] as const).map(method => z.object({ method: z.literal(method) }).strict()),
  ...(['attachActiveTab', 'focusTaskTab', 'openTaskContext'] as const).map(method => z.object({ method: z.literal(method), key }).strict()),
]);
export type RpcRequest = z.infer<typeof rpcSchema>;
