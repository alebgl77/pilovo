import * as fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { spawn } from 'node:child_process';
import type { InventoryAgent } from '../src/shared/launch';
import type { SourceId } from '../src/shared/types';

export interface Candidate { sourceId: SourceId; executable: string; installation: 'known_path' | 'path' }
export interface DiscoveredAgent { agent: InventoryAgent; executable?: string }
export interface DiscoveryDependencies {
  home: string; localData: string; searchPath: string; platform: NodeJS.Platform;
  list(directory: string): Promise<string[]>;
  isFile(file: string): Promise<boolean>;
  version(file: string): Promise<string | null>;
  now(): number;
}
export function safeExecutablePath(value: string, platform: NodeJS.Platform): boolean { return !value.includes('\0') && (platform === 'win32' ? /^[a-zA-Z]:[\\/]/.test(value) : path.isAbsolute(value)); }
export async function probeVersion(file: string, timeoutMs = 3000, start: typeof spawn = spawn): Promise<string | null> {
  return new Promise(resolve => {
    let text = '', bytes = 0, failed = false, done = false;
    const child = start(file, ['--version'], { shell: false, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    const finish = (value: string | null) => { if (done) return; done = true; clearTimeout(timer); resolve(value); };
    const timer = setTimeout(() => { failed = true; child.kill(); finish(null); }, timeoutMs);
    child.stdout.on('data', (chunk: Buffer) => { bytes += chunk.length; if (bytes > 4096) { failed = true; child.kill(); } else text += chunk.toString('utf8'); });
    child.stderr.on('data', (chunk: Buffer) => { bytes += chunk.length; if (bytes > 4096) { failed = true; child.kill(); } });
    child.on('error', () => finish(null));
    child.on('close', code => finish(!failed && code === 0 ? text.trim() : null));
  });
}
const defaults: DiscoveryDependencies = {
  home: os.homedir(), localData: process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local'), searchPath: process.env.PATH || '', platform: process.platform,
  list: async directory => { try { return (await fs.readdir(directory, { withFileTypes: true })).filter(entry => entry.isDirectory() && !entry.isSymbolicLink()).map(entry => entry.name); } catch { return []; } },
  isFile: async file => { try { const stat = await fs.lstat(file); return stat.isFile() && !stat.isSymbolicLink(); } catch { return false; } }, version: probeVersion, now: Date.now,
};
export class AgentDiscovery {
  private cached?: { at: number; values: DiscoveredAgent[] };
  constructor(private deps: DiscoveryDependencies = defaults) {}
  async candidates(): Promise<Candidate[]> {
    const { home, localData, platform, searchPath } = this.deps;
    const suffix = platform === 'win32' ? '.exe' : '';
    const candidates: Candidate[] = [{ sourceId: 'claude-code', executable: path.join(home, '.local', 'bin', `claude${suffix}`), installation: 'known_path' }];
    for (const local of [...new Set([localData, path.join(home, 'AppData', 'Local')])]) {
      const base = path.join(local, 'OpenAI', 'Codex', 'bin');
      for (const name of (await this.deps.list(base)).filter(name => /^[a-zA-Z0-9._-]{1,100}$/.test(name)).sort().reverse().slice(0, 32)) candidates.push({ sourceId: 'codex', executable: path.join(base, name, `codex${suffix}`), installation: 'known_path' });
    }
    for (const directory of searchPath.split(platform === 'win32' ? ';' : ':').slice(0, 64)) {
      if (!safeExecutablePath(directory, platform)) continue;
      for (const sourceId of ['claude-code', 'codex'] as const) candidates.push({ sourceId, executable: path.join(directory, `${sourceId === 'claude-code' ? 'claude' : 'codex'}${suffix}`), installation: 'path' });
      // npm's cmd/PowerShell wrappers are never executed. Locate only the known native vendor binary.
      if (platform === 'win32') for (const target of ['x86_64-pc-windows-msvc', 'aarch64-pc-windows-msvc']) candidates.push({ sourceId: 'codex', executable: path.join(directory, 'node_modules', '@openai', 'codex', 'vendor', target, 'codex', 'codex.exe'), installation: 'path' });
    }
    return candidates.filter((candidate, index, all) => safeExecutablePath(candidate.executable, platform) && all.findIndex(other => other.executable === candidate.executable) === index);
  }
  async inventory(refresh = false): Promise<DiscoveredAgent[]> {
    if (!refresh && this.cached && this.deps.now() - this.cached.at < 30000) return this.cached.values;
    const candidates = await this.candidates();
    const values: DiscoveredAgent[] = [];
    for (const sourceId of ['claude-code', 'codex'] as const) {
      let found = false, resolved: DiscoveredAgent | undefined, probed = 0;
      for (const candidate of candidates.filter(candidate => candidate.sourceId === sourceId)) {
        if (!await this.deps.isFile(candidate.executable)) continue;
        found = true;
        if (++probed > 3) break;
        const output = await this.deps.version(candidate.executable);
        const match = output?.match(sourceId === 'claude-code' ? /^(\d+\.\d+\.\d+(?:[-+][a-zA-Z0-9.-]+)?) \(Claude Code\)$/ : /^codex-cli (\d+\.\d+\.\d+(?:[-+][a-zA-Z0-9.-]+)?)$/);
        if (match) { resolved = { agent: { sourceId, availability: 'available', version: match[1], installation: candidate.installation, browserMode: 'unavailable' }, executable: candidate.executable }; break; }
      }
      values.push(resolved || { agent: { sourceId, availability: found ? 'unavailable' : 'not_found', browserMode: 'unavailable' } });
    }
    this.cached = { at: this.deps.now(), values }; return values;
  }
}
