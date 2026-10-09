import { randomUUID } from 'node:crypto';
import * as fs from 'node:fs/promises';
import path from 'node:path';

export const MAX_FILE_BYTES = 256 * 1024;
export async function ensurePrivateDirectory(directory: string): Promise<void> {
  await fs.mkdir(directory, { recursive: true, mode: 0o700 });
  const stat = await fs.lstat(directory);
  if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error('unsafe_directory');
  if (process.platform !== 'win32' && (stat.mode & 0o077)) throw new Error('insecure_directory_permissions');
}
export async function readBounded(file: string, max = MAX_FILE_BYTES): Promise<string> {
  const stat = await fs.lstat(file);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size > max) throw new Error('unsafe_or_oversized_file');
  const handle = await fs.open(file, 'r');
  try {
    const opened = await handle.stat();
    if (opened.ino !== stat.ino || opened.dev !== stat.dev || opened.size > max) throw new Error('file_changed');
    const buffer = Buffer.alloc(max + 1);
    const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0);
    if (bytesRead > max) throw new Error('oversized_file');
    return new TextDecoder('utf-8', { fatal: true }).decode(buffer.subarray(0, bytesRead));
  } finally { await handle.close(); }
}
export async function syncDirectory(directory: string): Promise<void> {
  if (process.platform === 'win32') return; // Windows does not expose directory fsync through Node.
  const handle = await fs.open(directory, 'r');
  try { await handle.sync(); } finally { await handle.close(); }
}
export async function atomicWrite(file: string, value: unknown, io: Pick<typeof fs, 'open' | 'rename' | 'rm'> = fs): Promise<void> {
  const data = JSON.stringify(value);
  if (Buffer.byteLength(data) > MAX_FILE_BYTES) throw new Error('oversized_file');
  const temporary = path.join(path.dirname(file), `.${randomUUID()}.tmp`);
  let handle: Awaited<ReturnType<typeof fs.open>> | undefined;
  try {
    handle = await io.open(temporary, 'wx', 0o600);
    await handle.writeFile(data, 'utf8'); await handle.sync();
    await handle.close(); handle = undefined;
    await io.rename(temporary, file); await syncDirectory(path.dirname(file));
  } finally {
    try { await handle?.close(); }
    finally { await io.rm(temporary, { force: true }); }
  }
}
export async function withLock<T>(directory: string, action: () => Promise<T>): Promise<T> {
  const lock = path.join(directory, '.writer-lock');
  // No expiry-based stealing: a paused writer must never overlap a replacement writer.
  try { await fs.mkdir(lock, { mode: 0o700 }); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === 'EEXIST') throw new Error('writer_busy_or_orphaned_lock'); throw error; }
  try {
    await atomicWrite(path.join(lock, 'owner.json'), { pid: process.pid, createdAt: new Date().toISOString() });
    return await action();
  } finally {
    await fs.rm(path.join(lock, 'owner.json'), { force: true });
    await fs.rmdir(lock);
  }
}
export function isMissing(error: unknown): boolean { return (error as NodeJS.ErrnoException)?.code === 'ENOENT'; }
