import { z } from 'zod';

const source = z.enum(['claude-code', 'codex']);
const safeUrl = z.string().max(4096).refine(value => {
  try { const url = new URL(value); return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password; } catch { return false; }
});
export const chromeToolSchema = z.enum(['mcp__claude_in_chrome__tabs_context_mcp', 'mcp__claude_in_chrome__read_page', 'mcp__claude_in_chrome__get_page_text', 'mcp__claude_in_chrome__find', 'mcp__claude_in_chrome__navigate', 'mcp__claude_in_chrome__tabs_create_mcp']);
export const browserActivitySchema = z.object({ tool: chromeToolSchema, status: z.enum(['requested', 'succeeded', 'failed']) }).strict();
export type BrowserActivity = z.infer<typeof browserActivitySchema>;
export const inventoryRequestSchema = z.object({ kind: z.literal('inventory.request'), requestId: z.uuid(), refresh: z.boolean().optional() }).strict();
export const launchRequestSchema = z.object({ kind: z.literal('launch.request'), requestId: z.uuid(), createdAt: z.iso.datetime(), sourceId: source, title: z.string().trim().min(1).max(160), prompt: z.string().min(1).max(10000), contextUrl: safeUrl.optional(), mode: z.enum(['standard', 'claude-chrome']), retainResult: z.boolean().default(false) }).strict();
export const cancelRequestSchema = z.object({ kind: z.literal('launch.cancel'), requestId: z.uuid(), launchRequestId: z.uuid() }).strict();
export const controlRequestSchema = z.discriminatedUnion('kind', [inventoryRequestSchema, launchRequestSchema, cancelRequestSchema]);
export const launchReasonSchema = z.enum(['invalid_request', 'expired_request', 'unsupported_mode', 'cli_not_found', 'cli_unavailable', 'browser_setup_required', 'capacity_reached', 'storage_failed', 'request_conflict', 'interrupted', 'spawn_failed', 'not_owned', 'already_finished', 'cleanup_failed', 'host_closed']);
export const inventoryAgentSchema = z.object({ sourceId: source, availability: z.enum(['available', 'not_found', 'unavailable']), version: z.string().min(1).max(160).optional(), installation: z.enum(['known_path', 'path']).optional(), browserMode: z.enum(['supported', 'unavailable']) }).strict();
export const ownedJobSchema = z.object({ launchRequestId: z.uuid(), taskId: z.uuid(), runId: z.uuid(), sourceId: source }).strict();
export const inventoryResultSchema = z.object({ kind: z.literal('inventory.result'), requestId: z.uuid(), checkedAt: z.iso.datetime(), agents: z.array(inventoryAgentSchema).max(2), jobs: z.array(ownedJobSchema).max(2).optional() }).strict();
export const launchResultSchema = z.object({ kind: z.literal('launch.result'), requestId: z.uuid(), status: z.enum(['accepted', 'rejected']), taskId: z.uuid().optional(), runId: z.uuid().optional(), reason: launchReasonSchema.optional() }).strict();
export const cancelResultSchema = z.object({ kind: z.literal('cancel.result'), requestId: z.uuid(), status: z.enum(['cancelled', 'rejected']), reason: launchReasonSchema.optional() }).strict();
export const controlResponseSchema = z.discriminatedUnion('kind', [inventoryResultSchema, launchResultSchema, cancelResultSchema]);
export type LaunchRequest = z.infer<typeof launchRequestSchema>;
export type ControlRequest = z.infer<typeof controlRequestSchema>;
export type ControlResponse = z.infer<typeof controlResponseSchema>;
export type InventoryAgent = z.infer<typeof inventoryAgentSchema>;
export type LaunchResult = z.infer<typeof launchResultSchema>;
export type LaunchReason = z.infer<typeof launchReasonSchema>;
