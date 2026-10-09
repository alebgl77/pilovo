import { createHash, randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { constants } from 'node:fs';
import { access, copyFile, mkdir, readFile, readdir, realpath, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// --check is read-only; --create freezes a new release without replacing existing files.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outputs = path.resolve(root, '..', 'outputs');
const create = process.argv.includes('--create');
if (process.argv.slice(2).some(arg => !['--create', '--check'].includes(arg)) || (create && process.argv.includes('--check'))) throw new Error('Use --check or --create.');
const required = ['dist/manifest.json', 'dist/index.html', 'dist/sidepanel.html', 'dist/background.js', 'package.json', 'package-lock.json', 'README.md', 'PRODUCT.md', 'docs/privacy.md', 'docs/RELEASE.md'];
const documents = ['Installation_Autoporteur.md', 'PRD_Complement_Autoporteur.md', 'Mega_PRD_AI_Agent_Control_Hub.md'];
for (const file of required) await access(path.join(root, file));
for (const file of documents) await access(path.join(outputs, file));
const manifest = JSON.parse(await readFile(path.join(root, 'dist/manifest.json'), 'utf8'));
const sameSet = (actual = [], expected) => Array.isArray(actual) && actual.length === expected.length && [...actual].sort().join('|') === [...expected].sort().join('|');
if (manifest.manifest_version !== 3 || manifest.version !== '0.2.0' || !manifest.background?.service_worker) throw new Error('Expected the built standalone 0.2.0 MV3 manifest.');
if (!sameSet(manifest.permissions, ['storage', 'sidePanel', 'alarms']) || !sameSet(manifest.optional_host_permissions, ['https://claude.ai/*', 'https://chatgpt.com/*'])) throw new Error('Standalone permission contract mismatch.');
if ((manifest.optional_permissions || []).length || (manifest.host_permissions || []).length || 'content_scripts' in manifest || 'externally_connectable' in manifest) throw new Error('Standalone package contains unsupported permissions or external code channels.');
const packageJson = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));
const lock = JSON.parse(await readFile(path.join(root, 'package-lock.json'), 'utf8'));
if ([packageJson.version, lock.version, lock.packages?.['']?.version].some(version => version !== manifest.version)) throw new Error('Package and manifest versions must match.');

const modulesRoot = await realpath(path.join(root, 'node_modules'));
const packages = new Map();
async function resolvePackage(name, from) {
  let cursor = from;
  while (true) {
    const candidate = path.join(cursor, 'node_modules', name, 'package.json');
    try { await access(candidate); return path.dirname(candidate); } catch { /* Try a hoisted dependency. */ }
    const parent = path.dirname(cursor); if (parent === cursor) throw new Error(`Cannot locate dependency ${name}`); cursor = parent;
  }
}
async function collect(name, from) {
  const directory = await realpath(await resolvePackage(name, from));
  if (!directory.startsWith(modulesRoot + path.sep)) throw new Error(`Dependency outside local node_modules: ${name}`);
  if (packages.has(directory)) return;
  const metadata = JSON.parse(await readFile(path.join(directory, 'package.json'), 'utf8'));
  const licenses = [];
  for (const file of (await readdir(directory, { withFileTypes: true })).filter(file => file.isFile() && /^(licen[cs]e|copying|notice|copyright)([._-].*)?$/i.test(file.name))) licenses.push({ file: file.name, contents: await readFile(path.join(directory, file.name), 'utf8') });
  if (!licenses.length) throw new Error(`No installed license text for ${metadata.name}@${metadata.version}; review before packaging.`);
  packages.set(directory, { name: metadata.name, version: metadata.version, license: metadata.license || 'See bundled text', licenses });
  for (const dependency of Object.keys(metadata.dependencies || {})) await collect(dependency, directory);
  for (const dependency of Object.keys(metadata.optionalDependencies || {})) {
    try { await resolvePackage(dependency, directory); } catch { continue; }
    await collect(dependency, directory);
  }
}
for (const name of Object.keys(packageJson.dependencies)) await collect(name, root);
const inventory = [...packages.values()].sort((a, b) => `${a.name}@${a.version}`.localeCompare(`${b.name}@${b.version}`));
const notices = '# Third-party notices — standalone 0.2.0\n\nThis conservative inventory includes the installed production dependency closure, including historical MCP dependencies and code removed by bundling. No companion is included in the Chrome package. Source retains historical companion code for reference. Tooling/test dependencies are not redistributed as installed packages. Versions and full license texts come from the actual installed packages.\n\n' + inventory.map(pkg => `## ${pkg.name} ${pkg.version}\n\nLicense: ${typeof pkg.license === 'string' ? pkg.license : JSON.stringify(pkg.license)}\n\n${pkg.licenses.map(license => `### ${license.file}\n\n${license.contents.trim()}\n`).join('\n')}`).join('\n');
const artifacts = [
  { name: 'Agent_Control_Hub_Autoporteur_Chrome_v0.2.0.zip', folder: 'chrome' },
  { name: 'Agent_Control_Hub_Autoporteur_Source_v0.2.0.zip', folder: 'source' },
];
const hashName = 'Agent_Control_Hub_Autoporteur_SHA256_v0.2.0.json';
const noticeName = 'Agent_Control_Hub_Autoporteur_THIRD_PARTY_NOTICES_v0.2.0.md';
console.log(JSON.stringify({ mode: create ? 'create' : 'check', manifestVersion: manifest.version, productionPackagesWithLicenseText: inventory.length, archives: artifacts.map(item => item.name) }));
if (!create) process.exit(0);
await mkdir(outputs, { recursive: true });
for (const name of [...artifacts.map(item => item.name), hashName, noticeName]) {
  try { await access(path.join(outputs, name)); throw new Error(`Output already exists: ${name}; refusing overwrite.`); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
}
const stage = path.resolve(outputs, `.standalone-stage-${randomUUID()}`);
if (!stage.startsWith(outputs + path.sep)) throw new Error('Invalid staging boundary.');
await mkdir(stage);
const excludedDirectories = new Set(['node_modules', 'dist', 'companion-dist', 'results', '.tmp', '.git', '.codex', '.tierdecay', '.agents', 'work', 'release', 'outputs', 'test-results', 'testresults', 'playwright-report', 'profiles', 'browser-profiles', 'secrets', 'credentials']);
const excludedFile = /(^\.env(?:\.|$)|(?:config|credential|secret|token)\.local\.|\.(?:pem|key|p12|pfx)$|^(?:claude-code|codex)-config\.json$|^(?:credentials?|secrets?|tokens?)(?:\.json|\.txt|\.toml|\.ya?ml)$)/i;
async function copyTree(from, to, source = false) {
  await mkdir(to, { recursive: true });
  for (const entry of await readdir(from, { withFileTypes: true })) {
    if (entry.isSymbolicLink()) throw new Error(`Symlink excluded from release: ${entry.name}`);
    if (excludedFile.test(entry.name) || (source && (excludedDirectories.has(entry.name.toLowerCase()) || /^\.(?:release|standalone)-stage-/.test(entry.name)))) continue;
    const input = path.join(from, entry.name), output = path.join(to, entry.name);
    if (entry.isDirectory()) await copyTree(input, output, source);
    else if (entry.isFile()) await copyFile(input, output, constants.COPYFILE_EXCL);
  }
}
try {
  const chromeStage = path.join(stage, 'chrome'), sourceStage = path.join(stage, 'source');
  await copyTree(path.join(root, 'dist'), chromeStage);
  // Preserve repository-relative documentation links and build/test working directory.
  await copyTree(root, path.join(sourceStage, 'extension'), true);
  await mkdir(path.join(sourceStage, 'outputs'));
  for (const file of documents) {
    await copyFile(path.join(outputs, file), path.join(chromeStage, file), constants.COPYFILE_EXCL);
    await copyFile(path.join(outputs, file), path.join(sourceStage, 'outputs', file), constants.COPYFILE_EXCL);
  }
  await copyTree(path.join(root, 'docs'), path.join(chromeStage, 'docs'));
  for (const folder of [chromeStage, sourceStage]) {
    await writeFile(path.join(folder, 'THIRD_PARTY_NOTICES.md'), notices, { flag: 'wx' });
    await writeFile(path.join(folder, 'DEPENDENCY_LICENSES.json'), JSON.stringify(inventory.map(({ name, version, license }) => ({ name, version, license })), null, 2), { flag: 'wx' });
  }
  // Standard-library ZIP writer; all paths are arguments, never shell substitutions.
  const compressor = 'import pathlib,sys,zipfile\nroot=pathlib.Path(sys.argv[1]).resolve()\nwith zipfile.ZipFile(sys.argv[2],"x",compression=zipfile.ZIP_DEFLATED,compresslevel=9) as z:\n for p in sorted(root.rglob("*")):\n  if p.is_file(): z.write(p,p.relative_to(root).as_posix())\n';
  const hashes = [];
  for (const artifact of artifacts) {
    const destination = path.join(stage, artifact.name);
    execFileSync('python', ['-c', compressor, path.join(stage, artifact.folder), destination], { windowsHide: true, stdio: 'pipe' });
    hashes.push({ file: artifact.name, bytes: (await stat(destination)).size, sha256: createHash('sha256').update(await readFile(destination)).digest('hex') });
  }
  for (const artifact of artifacts) await copyFile(path.join(stage, artifact.name), path.join(outputs, artifact.name), constants.COPYFILE_EXCL);
  await writeFile(path.join(outputs, hashName), JSON.stringify({ version: manifest.version, builtAt: new Date().toISOString(), artifacts: hashes }, null, 2), { flag: 'wx' });
  await writeFile(path.join(outputs, noticeName), notices, { flag: 'wx' });
  console.log(JSON.stringify({ created: hashes }));
} finally {
  const resolved = path.resolve(stage);
  if (!resolved.startsWith(outputs + path.sep) || !path.basename(resolved).startsWith('.standalone-stage-')) throw new Error('Refusing unsafe staging cleanup.');
  await rm(resolved, { recursive: true, force: true });
}
