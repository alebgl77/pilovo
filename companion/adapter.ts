import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import type { SourceId } from '../src/shared/types';
import { safeHttpUrl } from '../src/shared/protocol';
import { loadAdapterConfig, type AdapterConfig } from './config';
import { AdapterLease, EventQueue } from './queue';

const taskHandle = z.uuid().describe('Opaque taskHandle returned by hub_start_task for this source.');
const summary = z.string().max(16000);
const url = z.string().max(4096).refine(value => safeHttpUrl(value) !== null, 'HTTP(S) URL without credentials required');
const artifacts = z.array(z.object({ label: z.string().min(1).max(240), url, kind: z.literal('link') }).strict()).max(32);
const progress = z.object({ current: z.number().nonnegative(), total: z.number().positive(), unit: z.string().min(1).max(48) }).strict().refine(value => value.current <= value.total);
export async function createAdapter(config: AdapterConfig): Promise<{ server: McpServer; close: () => Promise<void> }> {
  const queue = await EventQueue.create(config);
  const lease = await AdapterLease.start(queue);
  const server = new McpServer({ name: `agent-control-hub-${config.sourceId}`, version: '0.1.0' });
  const guarded = (action: () => Promise<unknown>) => action().then(result => ({ content: [{ type: 'text' as const, text: JSON.stringify(result) }] })).catch(error => {
    const safeCodes = new Set(['writer_busy_or_orphaned_lock', 'outbox_full', 'task_capacity_reached', 'task_already_ended', 'task_handle_invalid']);
    const code = safeCodes.has((error as Error).message) ? (error as Error).message : 'local_operation_failed';
    return { isError: true, content: [{ type: 'text' as const, text: JSON.stringify({ status: 'not_confirmed', code, instruction: 'Check companion setup and retry. Do not claim hub delivery. Some events may already be queued; inspect the hub before starting a replacement task.' }) }] };
  });
  server.registerTool('hub_start_task', { description: 'Start explicitly instrumented work. Returns a source-bound taskHandle and a local queue acknowledgement. Never send secrets or full prompts. This does not verify completion or hub delivery.', inputSchema: z.object({ title: z.string().min(1).max(240), missionId: z.uuid().optional(), model: z.string().max(160).optional().describe('Only a model identifier actually reported by your runtime; omit if unknown.'), contextUrl: url.optional() }).strict(), annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false } }, input => guarded(() => queue.start(input)));
  server.registerTool('hub_update_task', { description: 'Report progress for a taskHandle from this adapter. This is agent-reported status. No command is sent to another agent.', inputSchema: z.object({ taskHandle, summary: summary.optional(), progress: progress.optional() }).strict(), annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false } }, ({ taskHandle, ...payload }) => guarded(() => queue.update(taskHandle, 'task.progress', payload)));
  server.registerTool('hub_ask_question', { description: 'Display a blocking question in the hub. The user answers in the original agent; the hub does not approve or execute actions.', inputSchema: z.object({ taskHandle, question: z.string().min(1).max(4000) }).strict(), annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false } }, ({ taskHandle, ...payload }) => guarded(() => queue.update(taskHandle, 'task.waiting', payload)));
  server.registerTool('hub_complete_task', { description: 'Report completion according to this agent, with a concise result. This is not independent verification. Delivery remains queued until the hub acknowledges.', inputSchema: z.object({ taskHandle, summary, artifacts: artifacts.optional() }).strict(), annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false } }, ({ taskHandle, ...payload }) => guarded(() => queue.update(taskHandle, 'task.completed', payload)));
  server.registerTool('hub_fail_task', { description: 'Report that this task failed, with a concise non-sensitive explanation. Disconnection alone is not task failure.', inputSchema: z.object({ taskHandle, summary }).strict(), annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false } }, ({ taskHandle, ...payload }) => guarded(() => queue.update(taskHandle, 'task.failed', payload)));
  const closeLease = () => lease.close().catch(() => { process.stderr.write('hub: lease_cleanup_failed\n'); });
  server.server.onclose = () => { void closeLease(); };
  return { server, close: async () => { await closeLease(); await server.close(); } };
}
export async function runAdapter(sourceId: SourceId, args = process.argv.slice(2)): Promise<void> {
  if (args.length !== 2 || args[0] !== '--config') throw new Error('usage_config_required');
  const config = await loadAdapterConfig(args[1], sourceId);
  const adapter = await createAdapter(config);
  const shutdown = () => { void adapter.close().finally(() => { process.stdin.pause(); }); };
  process.once('SIGINT', shutdown); process.once('SIGTERM', shutdown); process.stdin.once('end', shutdown);
  await adapter.server.connect(new StdioServerTransport());
}
