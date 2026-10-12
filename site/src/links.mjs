// Rewrites links found in the repository's Markdown so they work on the website.
import { existsSync } from 'node:fs';
import path from 'node:path';
import { BLOB, PAGES, README_ANCHORS } from './config.mjs';

const README = { 'README.md': 'en', 'docs/README.fr.md': 'fr' };
const FAQ = { 'docs/faq.md': 'en', 'docs/faq.fr.md': 'fr' };

// Relative URL from the directory of one site page to another site path ('' is the site root).
export function rel(fromDir, toPath) {
  const from = fromDir.split('/').filter(Boolean);
  const to = toPath.split('/');
  let common = 0;
  while (common < from.length && common < to.length - 1 && from[common] === to[common]) common++;
  const out = '../'.repeat(from.length - common) + to.slice(common).join('/');
  return out === '' ? './' : out.startsWith('#') ? `./${out}` : out;
}

/**
 * href: as written in the Markdown file at `sourceFile` (repository-relative, posix).
 * Returns { kind: 'site', path, hash } for website pages or { kind: 'external', href }.
 * faqIds: { en: Set, fr: Set } of FAQ page ids, used to check fragments that point into the FAQ.
 */
export function resolveLink(href, { sourceFile, repoRoot, faqIds }) {
  if (/^https?:\/\//i.test(href)) return { kind: 'external', href };
  if (/^[a-z][a-z0-9+.-]*:/i.test(href) || href.startsWith('//')) throw new Error(`Unsupported link scheme in ${sourceFile}: ${href}`);
  const hashAt = href.indexOf('#');
  const target = hashAt < 0 ? href : href.slice(0, hashAt);
  const fragment = hashAt < 0 ? '' : decodeURIComponent(href.slice(hashAt + 1));
  const file = target ? path.posix.normalize(path.posix.join(path.posix.dirname(sourceFile), decodeURIComponent(target))) : sourceFile;
  if (file.startsWith('../') || path.posix.isAbsolute(file)) throw new Error(`Link leaves the repository in ${sourceFile}: ${href}`);
  if (!existsSync(path.join(repoRoot, file))) throw new Error(`Link to a missing file in ${sourceFile}: ${href}`);
  if (FAQ[file]) {
    const lang = FAQ[file];
    if (fragment && faqIds && !faqIds[lang].has(fragment)) throw new Error(`Unknown FAQ anchor in ${sourceFile}: ${href}`);
    return { kind: 'site', path: PAGES.faq[lang], hash: fragment };
  }
  if (README[file]) {
    const lang = README[file];
    const mapped = fragment ? README_ANCHORS[lang][fragment] : undefined;
    if (mapped) return { kind: 'site', path: PAGES.landing[lang], hash: mapped };
  }
  return { kind: 'external', href: BLOB + encodeURI(file) + (fragment ? `#${fragment}` : '') };
}

export function rewriteLink(href, options) {
  const resolved = resolveLink(href, options);
  if (resolved.kind === 'external') return { href: resolved.href, external: true };
  const fromDir = options.fromDir ?? '';
  const url = resolved.path === fromDir && resolved.hash ? `#${resolved.hash}` : rel(fromDir, resolved.path) + (resolved.hash ? `#${resolved.hash}` : '');
  return { href: url, external: false, path: resolved.path, hash: resolved.hash };
}
