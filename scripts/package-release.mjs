import { createHash, randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFile, readdir, stat, mkdir, copyFile, writeFile, rm, access, realpath, rename } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Explicit --create is required. --check is read-only and never freezes release artifacts.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outputs = path.resolve(root, '..', 'outputs');
const create = process.argv.includes('--create');
const required = ['dist/manifest.json', 'dist/index.html', 'dist/sidepanel.html', 'companion-dist/native-host.cjs', 'companion-dist/claude-code.cjs', 'companion-dist/codex.cjs', 'scripts/install-companion.ps1', 'scripts/uninstall-companion.ps1', 'docs/integrations.md', 'docs/privacy.md', 'docs/RELEASE.md', 'package-lock.json'];
for (const file of required) await access(path.join(root, file));
const manifest = JSON.parse(await readFile(path.join(root, 'dist/manifest.json'), 'utf8'));
if (manifest.manifest_version !== 3 || !manifest.background?.service_worker) throw new Error('Invalid built MV3 manifest.');
if (['nativeMessaging', 'tabs', 'management'].some(permission => (manifest.permissions || []).includes(permission))) throw new Error('Production package must preserve optional permissions; refusing a test manifest.');
const packageJson = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));
await access(path.join(outputs, 'Installation_et_audit.md'));
await access(path.join(outputs, 'Mega_PRD_AI_Agent_Control_Hub.md'));
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
  const files = await readdir(directory, { withFileTypes: true });
  const licenses = [];
  for (const file of files.filter(file => file.isFile() && /^(licen[cs]e|copying|notice|copyright)([._-].*)?$/i.test(file.name))) {
    const contents = await readFile(path.join(directory, file.name), 'utf8');
    licenses.push({ file: file.name, contents });
  }
  if (!licenses.length) throw new Error(`No installed license text found for ${metadata.name}@${metadata.version}. Review before packaging.`);
  packages.set(directory, { name: metadata.name, version: metadata.version, license: metadata.license || 'See bundled text', licenses });
  for (const dependency of Object.keys(metadata.dependencies || {})) await collect(dependency, directory);
  for (const dependency of Object.keys(metadata.optionalDependencies || {})) {
    try { await resolvePackage(dependency, directory); } catch { continue; }
    await collect(dependency, directory);
  }
}
for (const name of Object.keys(packageJson.dependencies)) await collect(name, root);
const inventory = [...packages.values()].sort((a, b) => `${a.name}@${a.version}`.localeCompare(`${b.name}@${b.version}`));
const notices = '# Third-party notices\n\nAgent Control Hub bundles React, React DOM, Lucide, idb, Zod and the MCP SDK. This conservative inventory includes the installed production dependency closure, including dependencies whose unused code may have been removed by the bundler. Tooling and test dependencies are not distributed in the runtime packages. Versions and license text below were read from the actual installed packages.\n\n' + inventory.map(pkg => `## ${pkg.name} ${pkg.version}\n\nLicense: ${typeof pkg.license === 'string' ? pkg.license : JSON.stringify(pkg.license)}\n\n${pkg.licenses.map(license => `### ${license.file}\n\n${license.contents.trim()}\n`).join('\n')}`).join('\n');
console.log(JSON.stringify({ mode: create ? 'create' : 'check', manifestVersion: manifest.version, productionPackagesWithLicenseText: inventory.length, requiredFiles: required.length }));
if (!create) process.exit(0);
const artifacts = [
  { name: 'Agent_Control_Hub_Chrome.zip', folder: 'chrome' },
  { name: 'Agent_Control_Hub_Companion_Windows.zip', folder: 'companion' },
  { name: 'Agent_Control_Hub_Source.zip', folder: 'source' },
];
await mkdir(outputs, { recursive: true });
for (const artifact of artifacts) { try { await access(path.join(outputs, artifact.name)); throw new Error(`Output already exists: ${artifact.name}; do not overwrite a reviewed release.`); } catch (error) { if (error.code !== 'ENOENT') throw error; } }
const stage = path.resolve(outputs, `.release-stage-${randomUUID()}`);
if (!stage.startsWith(outputs + path.sep)) throw new Error('Invalid staging boundary.');
await mkdir(stage);
const excludedDirectories = new Set(['node_modules', 'dist', 'companion-dist', 'results', '.tmp', '.git', '.Codex', '.codex', 'work', 'release', '.release-stage', 'test-results', 'playwright-report', 'profiles', 'browser-profiles']);
const excludedFile = /(^\.env(?:\.|$)|(?:config|credential|secret|token)\.local\.|\.(?:pem|key|p12|pfx)$|^claude-code-config\.json$|^codex-config\.json$)/i;
async function copyTree(from, to, source = false) {
  await mkdir(to, { recursive: true });
  for (const entry of await readdir(from, { withFileTypes: true })) {
    if (entry.isSymbolicLink()) throw new Error(`Symlink excluded from release: ${entry.name}`);
    if (source && (excludedDirectories.has(entry.name) || entry.name.startsWith('.release-stage-') || excludedFile.test(entry.name))) continue;
    const input = path.join(from, entry.name), output = path.join(to, entry.name);
    if (entry.isDirectory()) await copyTree(input, output, source);
    else if (entry.isFile()) await copyFile(input, output);
  }
}
const chromeStage = path.join(stage, 'chrome'), companionStage = path.join(stage, 'companion'), sourceStage = path.join(stage, 'source');
try {
  await copyTree(path.join(root, 'dist'), chromeStage);
  for (const [from, to] of [['companion-dist', 'companion-dist'], ['docs', 'docs']]) await copyTree(path.join(root, from), path.join(companionStage, to));
  await mkdir(path.join(companionStage, 'scripts'), { recursive: true });
  for (const script of ['install-companion.ps1', 'uninstall-companion.ps1']) await copyFile(path.join(root, 'scripts', script), path.join(companionStage, 'scripts', script));
  await copyFile(path.join(root, 'package-lock.json'), path.join(companionStage, 'package-lock.json'));
  await copyTree(root, sourceStage, true);
  const installation = await readFile(path.join(outputs, 'Installation_et_audit.md'), 'utf8');
  for (const folder of [chromeStage, companionStage, sourceStage]) {
    await writeFile(path.join(folder, 'THIRD_PARTY_NOTICES.md'), notices);
    await writeFile(path.join(folder, 'DEPENDENCY_LICENSES.json'), JSON.stringify(inventory.map(({ name, version, license }) => ({ name, version, license })), null, 2));
  }
  await writeFile(path.join(companionStage, 'INSTALLATION_FR.md'), installation);
  await writeFile(path.join(sourceStage, 'INSTALLATION_FR.md'), installation);
  for (const folder of [companionStage, sourceStage]) await copyFile(path.join(outputs, 'Mega_PRD_AI_Agent_Control_Hub.md'), path.join(folder, 'Mega_PRD_AI_Agent_Control_Hub.md'));
  for (const folder of [companionStage, sourceStage]) for (const file of ['PRD_Complement_Detection_Lancement.md', 'Verification_release.json']) await copyFile(path.join(outputs, file), path.join(folder, file));
  // Python's standard ZIP writer includes dotfiles and avoids PowerShell script-policy dependencies.
  const compressor = 'import pathlib,sys,zipfile\nroot=pathlib.Path(sys.argv[1]).resolve()\nwith zipfile.ZipFile(sys.argv[2],"x",compression=zipfile.ZIP_DEFLATED,compresslevel=9) as z:\n for p in sorted(root.rglob("*")):\n  if p.is_file(): z.write(p,p.relative_to(root).as_posix())\n';
  const hashes = [];
  for (const artifact of artifacts) {
    const input = path.join(stage, artifact.folder), destination = path.join(stage, artifact.name);
    // Paths travel as arguments, not interpolated shell command text.
    execFileSync('python', ['-c', compressor, input, destination], { windowsHide: true, stdio: 'pipe' });
    const contents = await readFile(destination);
    hashes.push({ file: artifact.name, bytes: (await stat(destination)).size, sha256: createHash('sha256').update(contents).digest('hex') });
  }
  for (const artifact of artifacts) await rename(path.join(stage, artifact.name), path.join(outputs, artifact.name));
  await writeFile(path.join(outputs, 'Agent_Control_Hub_SHA256.json'), JSON.stringify({ version: packageJson.version, builtAt: new Date().toISOString(), artifacts: hashes }, null, 2));
  await writeFile(path.join(outputs, 'Agent_Control_Hub_THIRD_PARTY_NOTICES.md'), notices);
  console.log(JSON.stringify({ created: hashes }));
} finally {
  const resolved = path.resolve(stage);
  if (!resolved.startsWith(outputs + path.sep) || !path.basename(resolved).startsWith('.release-stage-')) throw new Error('Refusing unsafe staging cleanup.');
  await rm(resolved, { recursive: true, force: true });
}
