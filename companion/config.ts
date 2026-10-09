import path from 'node:path';
import * as fs from 'node:fs/promises';
import { z } from 'zod';
import { readBounded, ensurePrivateDirectory } from './storage';
import { sourceIdSchema } from '../src/shared/protocol';
import type { SourceId } from '../src/shared/types';

export const SOURCE_IDS = ['claude-code', 'codex'] as const;
const absolutePath = z.string().min(1).refine(value => path.isAbsolute(value) && !value.includes('\0'));
const secret = z.string().regex(/^[a-f0-9]{64}$/);
export const adapterConfigSchema = z.object({ version: z.literal(1), sourceId: sourceIdSchema, dataDirectory: absolutePath, secret }).strict();
export const hostConfigSchema = z.object({ version: z.literal(1), extensionId: z.string().regex(/^[a-p]{32}$/), dataDirectory: absolutePath, secrets: z.object({ 'claude-code': secret, codex: secret }).strict() }).strict();
export type AdapterConfig = z.infer<typeof adapterConfigSchema>;
export type HostConfig = z.infer<typeof hostConfigSchema>;
export async function loadAdapterConfig(file: string, sourceId: SourceId): Promise<AdapterConfig> {
  const config = adapterConfigSchema.parse(await privateJson(file));
  if (config.sourceId !== sourceId) throw new Error('source_profile_mismatch');
  return config;
}
export async function loadHostConfig(file: string): Promise<HostConfig> { return hostConfigSchema.parse(await privateJson(file)); }
async function privateJson(file: string): Promise<unknown> {
  if (!path.isAbsolute(file)) throw new Error('absolute_config_required');
  const stat = await fs.lstat(file);
  if (process.platform !== 'win32' && (stat.mode & 0o077)) throw new Error('insecure_config_permissions');
  return JSON.parse(await readBounded(file, 8192));
}
export async function initializeDirectories(root: string, source: SourceId): Promise<{ root: string; queue: string; states: string; leases: string }> {
  await ensurePrivateDirectory(root);
  const sourceRoot = path.join(root, source);
  await ensurePrivateDirectory(sourceRoot);
  const result = { root: sourceRoot, queue: path.join(sourceRoot, 'outbox'), states: path.join(sourceRoot, 'states'), leases: path.join(sourceRoot, 'leases') };
  for (const directory of [result.queue, result.states, result.leases]) await ensurePrivateDirectory(directory);
  return result;
}
export function validateOrigin(origin: string | undefined, extensionId: string): void {
  if (origin !== `chrome-extension://${extensionId}/` && origin !== `chrome-extension://${extensionId}`) throw new Error('origin_not_allowed');
}
