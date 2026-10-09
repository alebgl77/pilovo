import { access, readFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { allowedSource, scanText, walkFiles } from './publication-lib.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
if (args.some(arg => !['--list', '--staged', '--tracked'].includes(arg)) || (args.includes('--staged') && args.includes('--tracked'))) throw new Error('Use --list, --staged or --tracked.');
const files = args.includes('--tracked')
  ? execFileSync('git', ['ls-files', '-z'], { cwd: root, encoding: 'utf8' }).split('\0').filter(Boolean)
  : args.includes('--staged')
  ? execFileSync('git', ['diff', '--cached', '--name-only', '--diff-filter=ACMR', '-z'], { cwd: root, encoding: 'utf8' }).split('\0').filter(Boolean)
  : await walkFiles(root, { source: true });
const problems = [];
if (!files.length) problems.push({ file: '.', kind: 'empty-publication-inventory' });
for (const file of files) {
  if (!allowedSource(file)) { problems.push({ file, kind: 'outside-publication-allowlist' }); continue; }
  // In staged mode inspect index bytes, not a possibly different working tree.
  const bytes = (args.includes('--staged') || args.includes('--tracked')) ? execFileSync('git', ['show', `:${file}`], { cwd: root, maxBuffer: 64 * 1024 * 1024 }) : await readFile(path.join(root, file));
  if (bytes.subarray(0, 8192).includes(0)) continue;
  const text = bytes.toString('utf8');
  problems.push(...scanText(file, text));
  if (/\.md$/i.test(file)) {
    for (const match of text.matchAll(/!?\[[^\]]*\]\(([^\s)]+)(?:\s+"[^"]*")?\)/g)) {
      const link = match[1].replace(/^<|>$/g, '').split('#')[0];
      if (!link || /^(?:[a-z][a-z0-9+.-]*:|\/\/)/i.test(link)) continue;
      const target = path.resolve(root, path.dirname(file), decodeURIComponent(link));
      if (!target.startsWith(root + path.sep)) { problems.push({ file, kind: 'link-outside-repository' }); continue; }
      try { await access(target); } catch { problems.push({ file, kind: `missing-local-link:${link}` }); }
    }
  }
}
if (problems.length) { console.error(JSON.stringify({ checked: files.length, problems }, null, 2)); process.exitCode = 1; }
else console.log(JSON.stringify(args.includes('--list') ? { files } : { checked: files.length, passed: true, scope: 'allowlist, common secret signatures, documentation links; not a security certification' }, null, 2));
