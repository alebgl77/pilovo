import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, readdir, rm, symlink, copyFile } from 'node:fs/promises';
import { execFileSync, spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { inflateRawSync } from 'node:zlib';
import { allowedSource, crc32, publishDirectory, scanText, validateChromeFiles, validateManifest, walkFiles, zipBuffer } from './publication-lib.mjs';

const metadata = { name: 'pilovo', version: '0.4.0' };
const lock = { ...metadata, packages: { '': metadata } };
const manifest = { manifest_version: 3, version: metadata.version, background: { service_worker: 'background.js' }, permissions: ['storage', 'sidePanel', 'alarms', 'scripting'], optional_host_permissions: ['https://claude.ai/*', 'https://chatgpt.com/*'], optional_permissions: ['notifications'], content_security_policy: { extension_pages: "script-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'" } };
test('manifest accepts exact contract, including the single optional notifications permission, and rejects drift, extra capabilities and malformed versions', () => {
  validateManifest(manifest, metadata, lock);
  for (const change of [{ version: '0.2.0' }, { permissions: [...manifest.permissions, 'tabs'] }, { permissions: ['storage', 'sidePanel', 'alarms'] }, { optional_host_permissions: ['https://*/*'] }, { optional_host_permissions: [...manifest.optional_host_permissions, 'https://example.com/*'] }, { host_permissions: ['<all_urls>'] }, { optional_permissions: ['scripting'] }, { optional_permissions: ['notifications', 'tabs'] }, { optional_permissions: ['notifications', 'notifications'] }, { optional_permissions: [] }, { optional_permissions: undefined }, { optional_permissions: 'notifications' }, { permissions: [...manifest.permissions, 'notifications'] }, { content_scripts: [] }, { externally_connectable: {} }, { content_security_policy: { extension_pages: "script-src 'self' https://example.com; object-src 'none'" } }]) assert.throws(() => validateManifest({ ...manifest, ...change }, metadata, lock));
  assert.throws(() => validateManifest(manifest, { ...metadata, version: '../escape' }, lock));
  assert.throws(() => validateManifest(manifest, metadata, { ...lock, version: '0.2.0' }));
});
test('Chrome artifact includes the isolated observer and rejects unreviewed files', () => {
  const files = ['manifest.json', 'index.html', 'sidepanel.html', 'background.js', 'observer.js', 'icons/mark.svg', ...[16, 32, 48, 128].map(size => `icons/icon${size}.png`), ...['en', 'fr'].map(locale => `_locales/${locale}/messages.json`), 'assets/main-example.js', 'assets/main-example.css'];
  validateChromeFiles(files);
  assert.throws(() => validateChromeFiles(files.filter(file => file !== 'observer.js')), /Missing Chrome artifact: observer.js/);
  for (const file of ['content.js', 'observer.js.map', 'assets/private.txt', 'companion/native.cjs', 'tests/profile/Preferences', 'outputs/report.json', 'marketing/banner.png']) assert.throws(() => validateChromeFiles([...files, file]), /Unexpected Chrome archive content/);
  assert.throws(() => validateChromeFiles(files.filter(file => !file.endsWith('.css'))), /Missing Chrome UI assets/);
});
test('publication allowlist excludes profiles, generated files, credentials and ancestor paths', () => {
  for (const good of ['package-lock.json', 'src/ui/App.tsx', 'tests/core/repository.test.ts', '.github/workflows/ci.yml', 'docs/privacy.md', 'site/src/config.mjs', 'site/assets/media/media.json', '.github/workflows/pages.yml']) assert.equal(allowedSource(good), true, good);
  for (const bad of ['../README.md', '/src/code.ts', 'src/../secret', '.env', 'docs/.env.local', 'tests/ui/results/report.json', 'work/profile/file', 'node_modules/x.js', '.Codex/routing-ledger.md', 'dist/manifest.json', 'companion-dist/native.cjs', 'tests/browser-profile/Preferences', 'src/private.key', 'unknown.txt', 'site-dist/index.html', 'site/site-dist/index.html']) assert.equal(allowedSource(bad), false, bad);
});
test('secret checks redact values and recognize personal paths in public docs', () => {
  const token = 'ghp_' + 'a'.repeat(36);
  const personalPath = ['C:', 'Users', 'example', 'private'].join('/');
  const findings = scanText('README.md', token + ' ' + personalPath);
  assert.deepEqual(findings.map(item => item.kind), ['github-token', 'personal-absolute-path']);
  assert.equal(JSON.stringify(findings).includes(token), false);
  assert.deepEqual(scanText('scripts/check.mjs', personalPath).map(item => item.kind), ['personal-absolute-path']);
  assert.deepEqual(scanText('src/test.ts', 'a harmless string'), []);
});
test('source checks refuse raw bidi controls but accept them written as escapes', () => {
  for (const point of [0x202A, 0x202B, 0x202C, 0x202D, 0x202E, 0x2066, 0x2067, 0x2068, 0x2069]) assert.deepEqual(scanText('src/shared/activity.ts', `const unsafe = /[${String.fromCodePoint(point)}]/u;`).map(item => item.kind), ['hidden-bidi-control'], point.toString(16));
  assert.deepEqual(scanText('src/shared/activity.ts', ['const unsafe = /[', 'u202A-', 'u202E', 'u2066-', 'u2069]/u;'].join(String.fromCharCode(92))), []);
  assert.deepEqual(scanText('docs/README.fr.md', 'Revue contrat — Claude · « Onglet 4 »'), []);
});
test('tracked scan rejects a force-added forbidden file even though source packaging excludes it', async t => {
  const root = await mkdtemp(path.join(tmpdir(), 'briefoak-tracked-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(path.join(root, 'scripts'));
  for (const file of ['publication-lib.mjs', 'check-publication.mjs']) await copyFile(new URL(file, import.meta.url), path.join(root, 'scripts', file));
  await writeFile(path.join(root, '.gitignore'), '.env\n');
  await writeFile(path.join(root, '.env'), 'SYNTHETIC_FIXTURE=example\n');
  execFileSync('git', ['init', '--quiet'], { cwd: root });
  const empty = spawnSync(process.execPath, ['scripts/check-publication.mjs', '--tracked'], { cwd: root, encoding: 'utf8' });
  assert.equal(empty.status, 1);
  assert.match(empty.stderr, /empty-publication-inventory/);
  execFileSync('git', ['add', '-f', '.env'], { cwd: root });
  assert.deepEqual(await walkFiles(root, { source: true }), ['.gitignore', 'scripts/check-publication.mjs', 'scripts/publication-lib.mjs']);
  const result = spawnSync(process.execPath, ['scripts/check-publication.mjs', '--tracked'], { cwd: root, encoding: 'utf8' });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /outside-publication-allowlist/);
  assert.doesNotMatch(result.stderr, /SYNTHETIC_FIXTURE/);
});
test('ZIP is deterministic, UTF-8, CRC-correct, and refuses unsafe or ambiguous paths', () => {
  assert.equal(crc32(Buffer.from('123456789')), 0xcbf43926);
  const entries = [{ name: 'évidence.txt', bytes: Buffer.from('Bonjour') }, { name: 'a.txt', bytes: Buffer.alloc(0) }];
  const zip = zipBuffer(entries);
  assert.deepEqual(zip, zipBuffer([...entries].reverse()));
  let cursor = 0, count = 0;
  while (zip.readUInt32LE(cursor) === 0x04034b50) {
    assert.equal(zip.readUInt16LE(cursor + 6), 0x800);
    const length = zip.readUInt32LE(cursor + 18), nameLength = zip.readUInt16LE(cursor + 26);
    const start = cursor + 30 + nameLength, bytes = inflateRawSync(zip.subarray(start, start + length));
    assert.equal(crc32(bytes), zip.readUInt32LE(cursor + 14));
    assert.equal(bytes.length, zip.readUInt32LE(cursor + 22));
    cursor = start + length; count++;
  }
  assert.equal(count, 2); assert.equal(zip.readUInt32LE(cursor), 0x02014b50);
  assert.equal(zip.readUInt32LE(zip.length - 22), 0x06054b50);
  for (const name of ['../bad', '/absolute', 'a\\b', 'C:/bad', 'a//b', 'a/./b']) assert.throws(() => zipBuffer([{ name, bytes: Buffer.alloc(0) }]));
  assert.throws(() => zipBuffer([{ name: 'A', bytes: [] }, { name: 'a', bytes: [] }]));
});
test('source walk excludes generated results and rejects symlinks', async t => {
  const root = await mkdtemp(path.join(tmpdir(), 'briefoak-walk-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(path.join(root, 'tests/results'), { recursive: true });
  await writeFile(path.join(root, 'tests/results/private.txt'), 'private');
  await writeFile(path.join(root, 'README.md'), 'public');
  assert.deepEqual(await walkFiles(root, { source: true }), ['README.md']);
  // Directory junctions do not need administrator symlink privileges on Windows.
  await symlink(path.join(root, 'tests'), path.join(root, 'src'), process.platform === 'win32' ? 'junction' : 'dir');
  await assert.rejects(walkFiles(root, { source: true }), /Symlink/);
});
test('release is atomic, never overwritten, locked against concurrent writers, and cleans failures', async t => {
  const root = await mkdtemp(path.join(tmpdir(), 'briefoak-release-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const releases = path.join(root, 'release');
  await assert.rejects(publishDirectory(releases, '0.3.0', async stage => { await writeFile(path.join(stage, 'partial'), 'partial'); throw new Error('injected write failure'); }), /injected/);
  assert.deepEqual(await readdir(releases), []);
  let releaseWriter;
  const blocked = new Promise(resolve => { releaseWriter = resolve; });
  let entered;
  const started = new Promise(resolve => { entered = resolve; });
  const first = publishDirectory(releases, '0.3.0', async stage => { entered(); await blocked; await writeFile(path.join(stage, 'file'), 'original'); });
  await started;
  await assert.rejects(publishDirectory(releases, '0.3.0', async () => {}), { code: 'EEXIST' });
  releaseWriter(); await first;
  await assert.rejects(publishDirectory(releases, '0.3.0', async () => {}), /already exists/);
  assert.equal(await readFile(path.join(releases, 'v0.3.0/file'), 'utf8'), 'original');
  assert.deepEqual(await readdir(releases), ['v0.3.0']);
  await assert.rejects(publishDirectory(releases, '../escape', async () => {}), /Unsafe/);
});
