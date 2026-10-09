import { createHash } from 'node:crypto';
import { access, readdir, readFile, realpath, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { fileEntries, publishDirectory, validateChromeFiles, validateManifest, walkFiles, zipBuffer } from './publication-lib.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
if (args.length !== 1 || !['--check', '--create'].includes(args[0])) throw new Error('Use exactly --check or --create.');
execFileSync(process.execPath, [path.join(root, 'scripts/check-publication.mjs')], { cwd: root, stdio: 'inherit' });
const json = async file => JSON.parse(await readFile(path.join(root, file), 'utf8'));
const metadata = await json('package.json'), lock = await json('package-lock.json'), manifest = await json('dist/manifest.json');
validateManifest(manifest, metadata, lock);
const sourceManifest = await json('public/manifest.json');
if (JSON.stringify(manifest) !== JSON.stringify(sourceManifest)) throw new Error('Built manifest is stale; rebuild first.');
for (const file of ['index.html', 'sidepanel.html', 'background.js']) await access(path.join(root, 'dist', file));
const modulesRoot = await realpath(path.join(root, 'node_modules'));
const packages = new Map();
async function resolvePackage(name, from) {
  let cursor = from;
  while (true) {
    const candidate = path.join(cursor, 'node_modules', name, 'package.json');
    try { await access(candidate); return path.dirname(candidate); } catch { /* Try hoisted dependency. */ }
    if (cursor === root) throw new Error(`Missing local dependency: ${name}`);
    const parent = path.dirname(cursor);
    if (!parent.startsWith(root + path.sep) && parent !== root) throw new Error(`Dependency escapes repository: ${name}`);
    cursor = parent;
  }
}
async function collect(name, from) {
  const directory = await realpath(await resolvePackage(name, from));
  if (!directory.startsWith(modulesRoot + path.sep)) throw new Error(`Dependency outside node_modules: ${name}`);
  if (packages.has(directory)) return;
  const pkg = JSON.parse(await readFile(path.join(directory, 'package.json'), 'utf8'));
  const licenses = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (entry.isFile() && /^(licen[cs]e|copying|notice|copyright)([._-].*)?$/i.test(entry.name)) licenses.push({ file: entry.name, text: await readFile(path.join(directory, entry.name), 'utf8') });
  }
  if (!licenses.length) throw new Error(`No installed license text: ${pkg.name}@${pkg.version}`);
  packages.set(directory, { name: pkg.name, version: pkg.version, license: pkg.license || 'See license text', licenses });
  for (const dependency of Object.keys(pkg.dependencies || {})) await collect(dependency, directory);
  for (const dependency of Object.keys(pkg.optionalDependencies || {})) {
    try { await resolvePackage(dependency, directory); } catch { continue; }
    await collect(dependency, directory);
  }
}
for (const name of Object.keys(metadata.dependencies)) await collect(name, root);
const inventory = [...packages.values()].sort((a, b) => `${a.name}@${a.version}`.localeCompare(`${b.name}@${b.version}`));
const notices = `# Third-party notices — Pilovo ${metadata.version}\n\nThis conservative inventory covers installed production dependencies, including historical native/MCP dependencies whose code may not be in the Chrome bundle. No native companion is shipped. Development tools are not redistributed as installed packages. Versions and full license text are read from installed packages.\n\n` + inventory.map(pkg => `## ${pkg.name} ${pkg.version}\n\nLicense: ${typeof pkg.license === 'string' ? pkg.license : JSON.stringify(pkg.license)}\n\n${pkg.licenses.map(item => `### ${item.file}\n\n${item.text.trim()}\n`).join('\n')}`).join('\n');
const sourceFiles = await walkFiles(root, { source: true });
if (metadata.license !== 'MIT' || lock.packages?.['']?.license !== 'MIT') throw new Error('Expected reviewed MIT license metadata.');
const projectLicense = await readFile(path.join(root, 'LICENSE'));
const chromeFiles = await walkFiles(path.join(root, 'dist'));
validateChromeFiles(chromeFiles);
console.log(JSON.stringify({ mode: args[0], version: metadata.version, sourceFiles: sourceFiles.length, chromeFiles: chromeFiles.length, productionLicenses: inventory.length }));
if (args[0] === '--check') process.exit(0);
const shared = [{ name: 'THIRD_PARTY_NOTICES.md', bytes: Buffer.from(notices) }, { name: 'DEPENDENCY_LICENSES.json', bytes: Buffer.from(JSON.stringify(inventory.map(({ name, version, license }) => ({ name, version, license })), null, 2) + '\n') }];
const artifacts = [
  { name: `Pilovo_Chrome_v${metadata.version}.zip`, entries: [...await fileEntries(path.join(root, 'dist'), chromeFiles), { name: 'LICENSE', bytes: projectLicense }, ...shared] },
  { name: `Pilovo_Source_v${metadata.version}.zip`, entries: [...await fileEntries(root, sourceFiles), ...shared] },
];
const hashes = [];
const destination = await publishDirectory(path.join(root, 'release'), metadata.version, async stage => {
  for (const artifact of artifacts) {
    const bytes = zipBuffer(artifact.entries);
    await writeFile(path.join(stage, artifact.name), bytes, { flag: 'wx' });
    hashes.push({ file: artifact.name, bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') });
  }
  await writeFile(path.join(stage, `Pilovo_SHA256_v${metadata.version}.json`), JSON.stringify({ version: metadata.version, artifacts: hashes }, null, 2) + '\n', { flag: 'wx' });
  await writeFile(path.join(stage, `Pilovo_THIRD_PARTY_NOTICES_v${metadata.version}.md`), notices, { flag: 'wx' });
});
console.log(JSON.stringify({ destination: path.relative(root, destination), created: hashes }, null, 2));
