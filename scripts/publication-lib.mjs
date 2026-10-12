import { lstat, readdir, readFile, mkdir, writeFile, rename, rm, realpath, open } from 'node:fs/promises';
import { deflateRawSync } from 'node:zlib';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

export const rootFiles = new Set(['README.md', 'PRODUCT.md', 'DESIGN.md', 'CONTRIBUTING.md', 'SECURITY.md', 'SUPPORT.md', 'CHANGELOG.md', 'CITATION.cff', 'CLAUDE.md', 'LICENSE', '.gitignore', 'package.json', 'package-lock.json', 'index.html', 'sidepanel.html', 'tsconfig.json', 'vite.config.ts', 'vitest.config.ts']);
export const rootDirectories = new Set(['src', 'public', 'scripts', 'tests', 'docs', 'companion', '.github', 'site']);
const excludedDirectories = new Set(['node_modules', 'dist', 'site-dist', 'companion-dist', 'results', '.tmp', '.local', '.cache', '.git', '.codex', '.tierdecay', '.agents', 'work', 'release', 'outputs', 'test-results', 'testresults', 'playwright-report', 'blob-report', 'coverage', 'profiles', 'browser-profiles', 'secrets', 'credentials']);
const sensitiveName = /(^\.env(?:\.|$)|\.(?:pem|key|p12|pfx|log)$|\.local\.json$|^(?:credentials?|secrets?|tokens?)(?:\.json|\.txt|\.toml|\.ya?ml)$|^(?:claude-code|codex)-config\.json$)/i;
export function excluded(relative) {
  const parts = relative.replaceAll('\\', '/').split('/');
  return parts.some(part => excludedDirectories.has(part.toLowerCase()) || /(?:^|-)profile$/i.test(part) || sensitiveName.test(part));
}
export function allowedSource(relative) {
  const normalized = relative.replaceAll('\\', '/');
  const parts = normalized.split('/');
  if (parts.some(part => !part || part === '.' || part === '..') || path.isAbsolute(relative) || excluded(normalized)) return false;
  return parts.length === 1 ? rootFiles.has(normalized) : rootDirectories.has(parts[0]);
}
export async function walkFiles(root, { source = false } = {}) {
  const files = [];
  async function walk(relative) {
    const directory = path.join(root, relative);
    if ((await lstat(directory)).isSymbolicLink()) throw new Error(`Symlink refused: ${relative || '.'}`);
    for (const item of await readdir(directory, { withFileTypes: true })) {
      const name = relative ? `${relative}/${item.name}` : item.name;
      if (excluded(name)) continue;
      if (source && !relative && !rootFiles.has(item.name) && !rootDirectories.has(item.name)) continue;
      if (item.isSymbolicLink()) throw new Error(`Symlink refused: ${name}`);
      if (item.isDirectory()) await walk(name);
      else if (item.isFile() && (!source || allowedSource(name))) files.push(name);
      else if (!item.isFile()) throw new Error(`Unsupported file type: ${name}`);
    }
  }
  await walk('');
  return files.sort();
}
const sameSet = (actual = [], expected) => Array.isArray(actual) && actual.length === expected.length && [...actual].sort().join('|') === [...expected].sort().join('|');
export function validateManifest(manifest, metadata, lock) {
  if (!/^\d+\.\d+\.\d+$/.test(metadata.version) || metadata.name !== 'pilovo') throw new Error('Expected Pilovo numeric release version.');
  if (manifest.manifest_version !== 3 || manifest.version !== metadata.version || manifest.background?.service_worker !== 'background.js') throw new Error('Built MV3 manifest/version mismatch.');
  if (lock.version !== metadata.version || lock.packages?.['']?.version !== metadata.version || lock.name !== metadata.name || lock.packages?.['']?.name !== metadata.name) throw new Error('Lock metadata mismatch.');
  // The only optional API permission is notifications, requested from a user action for opt-in OS notifications.
  if (!sameSet(manifest.permissions, ['storage', 'sidePanel', 'alarms', 'scripting']) || !sameSet(manifest.optional_host_permissions, ['https://claude.ai/*', 'https://chatgpt.com/*']) || !sameSet(manifest.optional_permissions, ['notifications'])) throw new Error('Permission contract mismatch.');
  if ((manifest.host_permissions || []).length || ['content_scripts', 'externally_connectable'].some(key => key in manifest)) throw new Error('Unsupported permission/code channel.');
  if (manifest.content_security_policy?.extension_pages !== "script-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'") throw new Error('Extension code must stay local.');
}
export function validateChromeFiles(files) {
  const required = ['manifest.json', 'index.html', 'sidepanel.html', 'background.js', 'observer.js', 'icons/mark.svg', ...[16, 32, 48, 128].map(size => `icons/icon${size}.png`), ...['en', 'fr'].map(locale => `_locales/${locale}/messages.json`)];
  for (const file of required) if (!files.includes(file)) throw new Error(`Missing Chrome artifact: ${file}`);
  if (!files.some(file => /^assets\/[\w-]+\.js$/.test(file)) || !files.some(file => /^assets\/[\w-]+\.css$/.test(file))) throw new Error('Missing Chrome UI assets.');
  if (files.some(file => !required.includes(file) && !/^assets\/[\w-]+\.(?:js|css)$/.test(file))) throw new Error('Unexpected Chrome archive content.');
}
export function scanText(relative, text) {
  const findings = [];
  // Report only categories and paths, never matched values.
  const signatures = [
    ['private-key', /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/],
    ['github-token', /\b(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{40,})\b/],
    ['provider-key', /\bsk-(?:proj-|ant-)?[A-Za-z0-9_-]{32,}\b/],
    ['aws-access-key', /\bAKIA[A-Z0-9]{16}\b/],
  ];
  for (const [kind, signature] of signatures) if (signature.test(text)) findings.push({ file: relative, kind });
  if (/(?:[A-Z]:[\\/]Users[\\/][^\s/\\]+|\/Users\/[^\s/]+|\/home\/[^\s/]+)/i.test(text)) findings.push({ file: relative, kind: 'personal-absolute-path' });
  // Raw bidi embedding, override and isolate characters can reorder how code reads in review ("Trojan Source"); write escapes.
  if (/[\u202A-\u202E\u2066-\u2069]/u.test(text)) findings.push({ file: relative, kind: 'hidden-bidi-control' });
  return findings;
}
export function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return (crc ^ 0xffffffff) >>> 0;
}
export function zipBuffer(entries) {
  // Deterministic ZIP32, UTF-8 filenames, fixed 1980-01-01 timestamp; no external tools.
  const local = [], central = [], seen = new Set();
  let offset = 0;
  if (entries.length > 65535) throw new Error('ZIP32 entry limit exceeded.');
  for (const entry of [...entries].sort((a, b) => a.name < b.name ? -1 : a.name > b.name ? 1 : 0)) {
    if (!entry.name || entry.name.includes('\\') || entry.name.startsWith('/') || entry.name.includes(':') || entry.name.split('/').some(part => !part || part === '.' || part === '..') || seen.has(entry.name.toLowerCase())) throw new Error('Unsafe or duplicate ZIP path.');
    seen.add(entry.name.toLowerCase());
    const name = Buffer.from(entry.name), bytes = Buffer.from(entry.bytes);
    if (name.length > 65535 || bytes.length > 64 * 1024 * 1024) throw new Error('Release entry is too large.');
    const compressed = deflateRawSync(bytes, { level: 9 }), checksum = crc32(bytes);
    const header = Buffer.alloc(30);
    header.writeUInt32LE(0x04034b50, 0); header.writeUInt16LE(20, 4); header.writeUInt16LE(0x800, 6); header.writeUInt16LE(8, 8); header.writeUInt16LE(33, 12);
    header.writeUInt32LE(checksum, 14); header.writeUInt32LE(compressed.length, 18); header.writeUInt32LE(bytes.length, 22); header.writeUInt16LE(name.length, 26);
    local.push(header, name, compressed);
    const directory = Buffer.alloc(46);
    directory.writeUInt32LE(0x02014b50, 0); directory.writeUInt16LE(20, 4); directory.writeUInt16LE(20, 6); directory.writeUInt16LE(0x800, 8); directory.writeUInt16LE(8, 10); directory.writeUInt16LE(33, 14);
    directory.writeUInt32LE(checksum, 16); directory.writeUInt32LE(compressed.length, 20); directory.writeUInt32LE(bytes.length, 24); directory.writeUInt16LE(name.length, 28); directory.writeUInt32LE(offset, 42);
    central.push(directory, name);
    offset += header.length + name.length + compressed.length;
    if (offset > 512 * 1024 * 1024) throw new Error('Release ZIP size limit exceeded.');
  }
  const directoryBytes = Buffer.concat(central), end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(entries.length, 8); end.writeUInt16LE(entries.length, 10); end.writeUInt32LE(directoryBytes.length, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...local, directoryBytes, end]);
}
export async function publishDirectory(releases, version, writeArtifacts) {
  if (!/^\d+\.\d+\.\d+$/.test(version)) throw new Error('Unsafe release version.');
  await mkdir(releases, { recursive: true });
  if ((await lstat(releases)).isSymbolicLink()) throw new Error('Release directory cannot be a symlink.');
  const parent = await realpath(releases), destination = path.join(parent, `v${version}`);
  const lockPath = path.join(parent, `.v${version}.lock`);
  const lock = await open(lockPath, 'wx');
  const stage = path.join(parent, `.briefoak-stage-${randomUUID()}`);
  try {
    try { await lstat(destination); throw new Error('Release already exists; refusing overwrite.'); } catch (error) { if (error.code !== 'ENOENT') throw error; }
    await mkdir(stage);
    await writeArtifacts(stage);
    await rename(stage, destination);
    return destination;
  } finally {
    // stage is a direct, generated child of the resolved release directory.
    if (path.dirname(stage) !== parent || !path.basename(stage).startsWith('.briefoak-stage-')) throw new Error('Unsafe cleanup boundary.');
    await rm(stage, { recursive: true, force: true });
    await lock.close();
    await rm(lockPath, { force: true });
  }
}
export async function fileEntries(root, files) {
  return Promise.all(files.map(async name => ({ name, bytes: await readFile(path.join(root, name)) })));
}
