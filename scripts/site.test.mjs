// Builds the website into temporary folders and checks its contract: SEO and GEO metadata, privacy
// (no third-party request), copy rules, generated FAQ counts, labels, links and budgets.
import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { BLOB, RELEASE, REPO, REVIEWED } from '../site/src/config.mjs';
import { assertSupported, headingSlugs, inline, parse, slug } from '../site/src/markdown.mjs';
import { rewriteLink } from '../site/src/links.mjs';
import { typo } from '../site/src/typography.mjs';
import { AI_AGENTS } from '../site/src/files.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SITE = 'https://alebgl77.github.io/pilovo/';
const ALT_SITE = 'https://pilovo.example/';
const PAGES = { '': 'en', 'fr/': 'fr', 'faq/': 'en', 'fr/faq/': 'fr' };
const DASH = /[‒-―]/u;
const VOID = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'source', 'track', 'wbr']);
// A refused --out inside the tracked site/ folder; removed after the run in case the guard ever regresses.
const REFUSED_IN_SITE = path.join(root, 'site', '.site-test-refused-out');
let tmp, out, out2, out3;

function build(dir, siteUrl) {
  const result = spawnSync(process.execPath, ['scripts/build-site.mjs', '--out', dir], { cwd: root, encoding: 'utf8', env: { ...process.env, SITE_URL: siteUrl } });
  assert.equal(result.status, 0, result.stderr);
  return result;
}

before(() => {
  tmp = mkdtempSync(path.join(tmpdir(), 'pilovo-site-'));
  out = path.join(tmp, 'a');
  out2 = path.join(tmp, 'b');
  out3 = path.join(tmp, 'c');
  build(out, SITE);
  build(out2, SITE);
  build(out3, ALT_SITE);
});
after(() => {
  if (tmp) rmSync(tmp, { recursive: true, force: true });
  rmSync(REFUSED_IN_SITE, { recursive: true, force: true });
});

// ---------- helpers ----------
const read = (dir, file) => readFileSync(path.join(dir, file), 'utf8');
function walk(dir, base = dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const full = path.join(dir, entry.name);
    return entry.isDirectory() ? walk(full, base) : [path.relative(base, full).split(path.sep).join('/')];
  }).sort();
}
function decode(text) {
  return text.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos|nbsp);/gi, (m, e) => {
    const k = e.toLowerCase();
    if (k === 'amp') return '&'; if (k === 'lt') return '<'; if (k === 'gt') return '>'; if (k === 'quot') return '"'; if (k === 'apos') return "'"; if (k === 'nbsp') return ' ';
    return String.fromCodePoint(k.startsWith('#x') ? parseInt(k.slice(2), 16) : parseInt(k.slice(1), 10));
  });
}
// Minimal HTML tree for the generator's own markup (double-quoted attributes, explicit end tags).
function parseHtml(htmlText) {
  const rootNode = { tag: '#root', attrs: {}, children: [], parent: null };
  let current = rootNode;
  const re = /<!--[\s\S]*?-->|<!doctype[^>]*>|<(script|style)(\s[^>]*)?>([\s\S]*?)<\/\1>|<\/([a-zA-Z0-9-]+)\s*>|<([a-zA-Z][a-zA-Z0-9-]*)((?:\s+[^\s=>]+(?:="[^"]*")?)*)\s*\/?>|([^<]+)/gi;
  for (const m of htmlText.matchAll(re)) {
    if (m[1]) current.children.push({ tag: m[1].toLowerCase(), attrs: attrsOf(m[2] || ''), children: [{ text: m[3] }], parent: current });
    else if (m[4]) {
      const tag = m[4].toLowerCase();
      let node = current;
      while (node && node.tag !== tag) node = node.parent;
      if (!node) throw new Error(`Unmatched </${tag}>`);
      current = node.parent;
    } else if (m[5]) {
      const node = { tag: m[5].toLowerCase(), attrs: attrsOf(m[6] || ''), children: [], parent: current };
      current.children.push(node);
      if (!VOID.has(node.tag)) current = node;
    } else if (m[7] !== undefined) current.children.push({ text: m[7], parent: current });
  }
  return rootNode;
}
function attrsOf(source) {
  const attrs = {};
  for (const m of source.matchAll(/([^\s=>]+)(?:="([^"]*)")?/g)) attrs[m[1].toLowerCase()] = m[2] === undefined ? '' : decode(m[2]);
  return attrs;
}
function* nodes(node) {
  for (const child of node.children || []) { if (child.tag) { yield child; yield* nodes(child); } }
}
const all = (node, pred) => [...nodes(node)].filter(pred);
const one = (node, pred) => [...nodes(node)].find(pred);
const hasClass = (node, cls) => (node.attrs?.class || '').split(/\s+/).includes(cls);
function textOf(node, { skipCode = false } = {}) {
  if (node.text !== undefined) return decode(node.text);
  if (['script', 'style'].includes(node.tag)) return '';
  if (skipCode && ['code', 'kbd'].includes(node.tag)) return '';
  return (node.children || []).map(child => textOf(child, { skipCode })).join('');
}
const norm = text => text.replace(/[\s ]+/g, ' ').trim();
function textNodes(node, out = [], skipCode = true) {
  for (const child of node.children || []) {
    if (child.text !== undefined) { if (!['script', 'style'].includes(node.tag)) out.push(decode(child.text)); }
    else if (!(skipCode && ['code', 'kbd', 'script', 'style'].includes(child.tag))) textNodes(child, out, skipCode);
  }
  return out;
}
function pages(dir) {
  const list = Object.entries(PAGES).map(([dirPath, lang]) => ({ file: `${dirPath}index.html`, url: dirPath, lang, indexed: true }));
  list.push({ file: '404.html', url: '404.html', lang: 'en', indexed: false });
  return list.map(page => {
    const html = read(dir, page.file);
    return { ...page, html, doc: parseHtml(html) };
  });
}
function jsonLd(page) {
  return all(page.doc, n => n.tag === 'script' && n.attrs.type === 'application/ld+json').map(n => JSON.parse(n.children[0].text));
}
const graphTypes = page => jsonLd(page).flatMap(g => g['@graph']).map(n => n['@type']);
function deepKeys(value, keys = []) {
  if (Array.isArray(value)) value.forEach(v => deepKeys(v, keys));
  else if (value && typeof value === 'object') for (const [k, v] of Object.entries(value)) { keys.push(k); deepKeys(v, keys); }
  return keys;
}
function deepStrings(value, strings = []) {
  if (typeof value === 'string') strings.push(value);
  else if (Array.isArray(value)) value.forEach(v => deepStrings(v, strings));
  else if (value && typeof value === 'object') Object.values(value).forEach(v => deepStrings(v, strings));
  return strings;
}
function fileFor(dir, url, site = SITE) {
  const u = new URL(url);
  const base = new URL(site);
  if (u.origin !== base.origin || !u.pathname.startsWith(base.pathname)) return null;
  let file = decodeURIComponent(u.pathname.slice(base.pathname.length));
  if (file === '' || file.endsWith('/')) file += 'index.html';
  return path.join(dir, file);
}
function imageSize(file) {
  const b = readFileSync(file);
  if (file.endsWith('.svg')) {
    const vb = /viewBox="\s*[-\d.]+\s+[-\d.]+\s+([\d.]+)\s+([\d.]+)"/.exec(b.toString('utf8'));
    return { width: Number(vb[1]), height: Number(vb[2]) };
  }
  if (b.toString('ascii', 1, 4) === 'PNG') return { width: b.readUInt32BE(16), height: b.readUInt32BE(20) };
  assert.equal(b.toString('ascii', 0, 4), 'RIFF'); assert.equal(b.toString('ascii', 8, 12), 'WEBP');
  const chunk = b.toString('ascii', 12, 16);
  if (chunk === 'VP8 ') return { width: b.readUInt16LE(26) & 0x3fff, height: b.readUInt16LE(28) & 0x3fff };
  if (chunk === 'VP8L') {
    const [b0, b1, b2, b3] = b.subarray(21, 25);
    return { width: 1 + (b0 | ((b1 & 0x3f) << 8)), height: 1 + ((b1 >> 6) | (b2 << 2) | ((b3 & 0xf) << 10)) };
  }
  if (chunk === 'VP8X') return { width: 1 + b.readUIntLE(24, 3), height: 1 + b.readUIntLE(27, 3) };
  throw new Error(`Unknown image format: ${file}`);
}
const media = JSON.parse(readFileSync(path.join(root, 'site/assets/media/media.json'), 'utf8'));

// ---------- 1. inventory ----------
test('1. inventory: pages, machine files, hashed assets, fonts, brand and media', () => {
  const files = walk(out);
  for (const file of ['index.html', 'fr/index.html', 'faq/index.html', 'fr/faq/index.html', '404.html', 'sitemap.xml', 'robots.txt', 'llms.txt', 'third-party-notices.txt', '.nojekyll',
    'assets/fonts/montserrat-latin-wght-normal.woff2', 'assets/fonts/montserrat-latin-ext-wght-normal.woff2',
    'assets/brand/pilovo-logo.svg', 'assets/brand/pilovo-logo-light.svg', 'assets/brand/favicon.svg', 'assets/brand/favicon-32.png', 'assets/brand/apple-touch-icon.png', 'assets/brand/pilovo-social-preview.png']) {
    assert.ok(files.includes(file), `missing ${file}`);
  }
  assert.equal(files.filter(f => /^assets\/site\.[0-9a-f]{8}\.css$/.test(f)).length, 1);
  assert.equal(files.filter(f => /^assets\/site\.[0-9a-f]{8}\.js$/.test(f)).length, 1);
  assert.equal(files.filter(f => f.startsWith('assets/fonts/')).length, 2);
  assert.ok(!files.includes('assets/media/media.json'));
  for (const asset of media.assets) for (const file of asset.files) assert.ok(existsSync(path.join(out, 'assets', file.path)), file.path);
});

// ---------- 2. page basics ----------
test('2. every page: lang, one h1, title and description lengths, unique ids, no skipped heading level', () => {
  for (const page of pages(out)) {
    const htmlNode = one(page.doc, n => n.tag === 'html');
    assert.equal(htmlNode.attrs.lang, page.lang, page.file);
    assert.equal(all(page.doc, n => n.tag === 'h1').length, 1, `${page.file} h1`);
    const title = norm(textOf(one(page.doc, n => n.tag === 'title')));
    assert.ok(title.length >= 1 && title.length <= 60, `${page.file} title ${title.length}: ${title}`);
    const description = one(page.doc, n => n.tag === 'meta' && n.attrs.name === 'description').attrs.content;
    assert.ok(description.length >= 140 && description.length <= 160, `${page.file} description ${description.length}`);
    const ids = all(page.doc, n => n.attrs.id !== undefined).map(n => n.attrs.id);
    assert.equal(new Set(ids).size, ids.length, `${page.file} duplicate ids`);
    let previous = 0;
    for (const heading of all(page.doc, n => /^h[1-6]$/.test(n.tag))) {
      const level = Number(heading.tag[1]);
      assert.ok(level <= previous + 1, `${page.file}: ${heading.tag} after h${previous}`);
      previous = level;
    }
  }
});

// ---------- 3. canonical, hreflang, social ----------
test('3. indexed pages: canonical, reciprocal hreflang with x-default, Open Graph and Twitter card', () => {
  const list = pages(out).filter(p => p.indexed);
  const alternates = new Map();
  for (const page of list) {
    const canonical = one(page.doc, n => n.tag === 'link' && n.attrs.rel === 'canonical').attrs.href;
    assert.equal(canonical, SITE + page.url);
    const links = all(page.doc, n => n.tag === 'link' && n.attrs.rel === 'alternate' && n.attrs.hreflang);
    const map = Object.fromEntries(links.map(n => [n.attrs.hreflang, n.attrs.href]));
    assert.deepEqual(Object.keys(map).sort(), ['en', 'fr', 'x-default']);
    for (const href of Object.values(map)) assert.ok(href.startsWith(SITE));
    assert.equal(map[page.lang], canonical);
    alternates.set(canonical, map);
    const meta = prop => one(page.doc, n => n.tag === 'meta' && (n.attrs.property === prop || n.attrs.name === prop))?.attrs.content;
    assert.equal(meta('og:url'), canonical);
    assert.ok(meta('og:image').startsWith(SITE));
    assert.ok(existsSync(fileFor(out, meta('og:image'))));
    assert.equal(meta('twitter:card'), 'summary_large_image');
    assert.ok(meta('og:image:alt') && meta('twitter:image:alt'));
  }
  for (const [canonical, map] of alternates) for (const href of Object.values(map)) assert.deepEqual(alternates.get(href), map, `reciprocal ${canonical} -> ${href}`);
});

// ---------- 4. JSON-LD ----------
test('4. structured data parses and carries the expected types and facts, never ratings or reviews', () => {
  for (const page of pages(out).filter(p => p.indexed)) {
    const graphs = jsonLd(page);
    assert.equal(graphs.length, 1);
    const types = graphTypes(page);
    const nodesByType = Object.fromEntries(graphs[0]['@graph'].map(n => [n['@type'], n]));
    for (const type of ['Organization', 'WebSite', 'SoftwareApplication']) assert.ok(types.includes(type), `${page.file} ${type}`);
    const app = nodesByType.SoftwareApplication;
    assert.equal(app.applicationCategory, 'BrowserApplication');
    assert.match(app.operatingSystem, /Chrome 120/);
    assert.equal(app.softwareVersion, RELEASE.version);
    assert.equal(app.offers.price, '0');
    assert.ok(['USD', 'EUR'].includes(app.offers.priceCurrency));
    assert.equal(app.isAccessibleForFree, true);
    assert.equal(app.license, `${BLOB}LICENSE`);
    assert.equal(app.downloadUrl, RELEASE.tagUrl);
    assert.ok(app.sameAs.includes(REPO));
    assert.ok(app.inLanguage);
    // One shared node, with its texts in both languages: a French page states the French values too.
    const languages = value => (Array.isArray(value) ? value : [value]).map(v => v?.['@language']).filter(Boolean);
    assert.deepEqual([...new Set(languages(app.description))].sort(), ['en', 'fr'], `${page.file} description languages`);
    assert.deepEqual([...new Set(languages(app.featureList))].sort(), ['en', 'fr'], `${page.file} featureList languages`);
    assert.ok(app.installUrl.includes(`${BLOB}docs/installation.fr.md`) && app.installUrl.includes(`${BLOB}docs/installation.md`), `${page.file} installUrl`);
    assert.deepEqual(app.screenshot.map(shot => shot.inLanguage).sort(), ['en', 'fr'], `${page.file} screenshots`);
    if (page.url.includes('faq')) {
      assert.ok(types.includes('FAQPage'));
      assert.equal(nodesByType.BreadcrumbList.itemListElement.length, 2);
    } else {
      assert.ok(types.includes('WebPage'));
      assert.equal(nodesByType.SoftwareSourceCode.codeRepository, REPO);
    }
    const keys = deepKeys(graphs);
    assert.ok(!keys.includes('aggregateRating') && !keys.includes('review') && !keys.includes('reviews'));
  }
});

// ---------- 5. third-party ----------
test('5. no resource from another origin, no inline script or style, CSP on indexed pages', () => {
  const css = read(out, walk(out).find(f => /\.css$/.test(f)));
  for (const m of css.matchAll(/url\(([^)]+)\)/g)) {
    const target = new URL(m[1].replace(/['"]/g, ''), `${SITE}assets/`);
    assert.ok(target.href.startsWith(SITE), `css url ${m[1]}`);
  }
  for (const page of pages(out)) {
    const base = SITE + page.url;
    const refs = [];
    for (const n of nodes(page.doc)) {
      if (n.attrs.src !== undefined) refs.push(n.attrs.src);
      if (n.attrs.poster) refs.push(n.attrs.poster);
      if (n.attrs.srcset) refs.push(...n.attrs.srcset.split(',').map(s => s.trim().split(/\s+/)[0]));
      if (n.tag === 'link' && /(?:^|\s)(stylesheet|preload|icon|apple-touch-icon|manifest|modulepreload)(?:\s|$)/.test(n.attrs.rel)) refs.push(n.attrs.href);
      assert.notEqual(n.tag, 'iframe', page.file);
      if (n.tag === 'script' && n.attrs.type !== 'application/ld+json') assert.ok(n.attrs.src && !(n.children || []).some(c => c.text?.trim()), `${page.file} inline script`);
      assert.equal(n.attrs.style, undefined, `${page.file} style attribute`);
      for (const name of Object.keys(n.attrs)) assert.ok(!/^on/.test(name), `${page.file} ${name}`);
    }
    for (const ref of refs) {
      const target = new URL(ref, base);
      assert.ok(target.href.startsWith(SITE), `${page.file}: ${ref}`);
      assert.ok(existsSync(fileFor(out, target.origin + target.pathname)), `${page.file}: missing ${ref}`);
    }
    if (page.indexed) {
      const csp = one(page.doc, n => n.tag === 'meta' && n.attrs['http-equiv'] === 'Content-Security-Policy');
      assert.match(csp.attrs.content, /default-src 'none'/);
    }
  }
});

// ---------- 6. dashes ----------
test('6. no figure, en or em dash in visible text, alt, labels, meta, JSON-LD, llms.txt or robots.txt', () => {
  for (const page of pages(out)) {
    assert.ok(!DASH.test(textOf(page.doc)), `${page.file} text`);
    for (const n of nodes(page.doc)) {
      for (const [name, value] of Object.entries(n.attrs)) {
        if (['alt', 'title', 'aria-label', 'content'].includes(name) || name.startsWith('data-label')) assert.ok(!DASH.test(value), `${page.file} ${name}=${value}`);
      }
    }
    for (const s of deepStrings(jsonLd(page))) assert.ok(!DASH.test(s), `${page.file} JSON-LD ${s}`);
  }
  for (const file of ['llms.txt', 'robots.txt', 'sitemap.xml']) assert.ok(!DASH.test(read(out, file)), file);
});

// ---------- 7. links ----------
test('7. internal links and anchors resolve; GitHub links point to existing files and headings', () => {
  const list = pages(out);
  const idsOf = new Map(list.map(p => [path.join(out, p.file), new Set(all(p.doc, n => n.attrs.id !== undefined).map(n => n.attrs.id))]));
  const slugCache = new Map();
  for (const page of list) {
    for (const a of all(page.doc, n => n.tag === 'a')) {
      const href = a.attrs.href;
      assert.ok(href, `${page.file} empty href`);
      const target = new URL(href, SITE + page.url);
      if (target.href.startsWith(SITE)) {
        const file = fileFor(out, target.origin + target.pathname);
        assert.ok(existsSync(file), `${page.file}: ${href}`);
        const hash = decodeURIComponent(target.hash.slice(1));
        if (hash) assert.ok(idsOf.get(file)?.has(hash), `${page.file}: ${href} -> #${hash}`);
      } else if (href.startsWith(BLOB)) {
        const [filePart, hash] = href.slice(BLOB.length).split('#');
        const repoFile = decodeURI(filePart);
        assert.ok(existsSync(path.join(root, repoFile)), `${page.file}: ${href}`);
        if (hash) {
          if (!slugCache.has(repoFile)) slugCache.set(repoFile, new Set(headingSlugs(readFileSync(path.join(root, repoFile), 'utf8'))));
          assert.ok(slugCache.get(repoFile).has(decodeURIComponent(hash)), `${page.file}: ${href}`);
        }
      } else assert.match(target.href, /^https:\/\/(github\.com|raw\.githubusercontent\.com)\//, `${page.file}: unexpected outbound ${href}`);
    }
  }
  for (const [dir, site] of [[out, SITE], [out3, ALT_SITE]]) {
    const doc = parseHtml(read(dir, '404.html'));
    const basePath = new URL(site).pathname;
    for (const n of nodes(doc)) {
      for (const name of ['href', 'src', 'srcset']) {
        const value = n.attrs[name];
        if (!value || /^https?:/.test(value)) continue;
        if (value.startsWith('#')) continue;
        assert.ok(value.startsWith(basePath), `404 ${name}=${value}`);
        assert.ok(existsSync(fileFor(dir, new URL(value, site).href.split('#')[0], site)), `404 ${value}`);
      }
    }
  }
});

// ---------- 8. sitemap, robots, llms ----------
test('8. sitemap lists the four pages with alternates; robots and llms.txt', () => {
  const sitemap = read(out, 'sitemap.xml');
  const locs = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map(m => m[1]);
  assert.deepEqual([...locs].sort(), Object.keys(PAGES).map(p => SITE + p).sort());
  assert.ok(!sitemap.includes('404'));
  for (const block of sitemap.split('<url>').slice(1)) {
    assert.match(block, new RegExp(`<lastmod>${REVIEWED}</lastmod>`));
    for (const lang of ['en', 'fr', 'x-default']) assert.match(block, new RegExp(`hreflang="${lang}"`));
  }
  const robots = read(out, 'robots.txt');
  assert.match(robots, /^Allow: \/$/m);
  assert.ok(!/Disallow/i.test(robots));
  for (const agent of AI_AGENTS) assert.match(robots, new RegExp(`^User-agent: ${agent}$`, 'm'));
  assert.match(robots, new RegExp(`^Sitemap: ${SITE}sitemap.xml$`, 'm'));
  const llms = read(out, 'llms.txt');
  assert.ok(llms.startsWith('# Pilovo\n'));
  assert.match(llms, /^> Pilovo is /m);
  for (const p of Object.keys(PAGES)) assert.ok(llms.includes(`](${SITE}${p})`), p);
  // Documentation links are plain Markdown sources that exist in the repository, in both languages.
  const raw = [...llms.matchAll(/\]\((https:\/\/raw\.githubusercontent\.com\/alebgl77\/pilovo\/main\/([^)]+))\)/g)].map(m => m[2]);
  for (const file of ['README.md', 'docs/faq.md', 'docs/installation.md', 'docs/README.fr.md', 'docs/faq.fr.md', 'docs/installation.fr.md']) assert.ok(raw.includes(file), `llms.txt links ${file}`);
  for (const file of raw) assert.ok(existsSync(path.join(root, file)), `llms.txt: missing ${file}`);
  assert.ok(llms.indexOf('docs/faq.md') < llms.indexOf('## Optional'), 'the FAQ source is listed under Documentation, not Optional');
  // llmstxt.org grammar (regression: a plain sentence inside an H2 section broke the reference parser):
  // after the first H2, every non-blank line is an H2 or a "- [title](url)" item with optional ": notes".
  const sections = llms.slice(llms.search(/^## /m)).split('\n').filter(line => line.trim());
  assert.ok(sections.length > 0, 'llms.txt has H2 sections');
  for (const line of sections) assert.match(line, /^(## .+|- \[[^\]]+\]\([^)\s]+\)(: .+)?)$/, `llms.txt line outside the file-list grammar: ${line}`);
});

// ---------- 9. FAQ counts ----------
test('9. FAQ pages render every ### question of docs/faq*.md; the landing FAQ reuses the nine README questions', () => {
  const list = pages(out);
  for (const [url, file] of [['faq/', 'docs/faq.md'], ['fr/faq/', 'docs/faq.fr.md']]) {
    const page = list.find(p => p.url === url);
    const expected = (readFileSync(path.join(root, file), 'utf8').match(/^### /gm) || []).length;
    const headings = all(page.doc, n => n.tag === 'article' && hasClass(n, 'qa')).map(article => one(article, n => n.tag === 'h3'));
    assert.equal(headings.length, expected, file);
    const faqNode = jsonLd(page)[0]['@graph'].find(n => n['@type'] === 'FAQPage');
    assert.equal(faqNode.mainEntity.length, expected);
    assert.deepEqual(faqNode.mainEntity.map(q => norm(q.name)), headings.map(h => norm(textOf(h))));
    for (const q of faqNode.mainEntity) assert.ok(q.acceptedAnswer.text.length > 20);
    // Each question deep-links to its own answer on the page.
    assert.deepEqual(faqNode.mainEntity.map(q => q.url), headings.map(h => `${SITE}${url}#${h.attrs.id}`));
  }
  for (const [url, file] of [['', 'docs/faq.md'], ['fr/', 'docs/faq.fr.md']]) {
    const page = list.find(p => p.url === url);
    const items = all(page.doc, n => n.tag === 'details' && hasClass(n, 'qa'));
    assert.equal(items.length, 9);
    const questions = new Set(readFileSync(path.join(root, file), 'utf8').split('\n').filter(l => l.startsWith('### ')).map(l => norm(l.slice(4).replace(/"/g, ''))));
    for (const item of items) {
      const text = norm(textOf(one(item, n => n.tag === 'h3')).replace(/[“”«»"]/g, '').replace(/ /g, ' '));
      const normalized = [...questions].map(q => norm(q.replace(/[«»]/g, '')));
      assert.ok(normalized.includes(text), `${url} question not in ${file}: ${text}`);
    }
  }
});

// ---------- 10. entity definition ----------
test('10. the first paragraph of #what-is-pilovo defines Pilovo as a Chrome extension', () => {
  for (const page of pages(out).filter(p => p.url === '' || p.url === 'fr/')) {
    const section = one(page.doc, n => n.attrs.id === 'what-is-pilovo');
    const first = norm(textOf(one(section, n => n.tag === 'p')));
    assert.match(first, /Pilovo/);
    assert.match(first, page.lang === 'en' ? /Chrome extension/ : /extension Chrome/);
  }
});

// ---------- 11. images and video ----------
test('11. images carry alt and intrinsic size matching the file; lazy below the fold; video attributes', () => {
  for (const page of pages(out)) {
    const base = SITE + page.url;
    for (const img of all(page.doc, n => n.tag === 'img')) {
      assert.ok(img.attrs.alt && img.attrs.alt.trim(), `${page.file} alt ${img.attrs.src}`);
      const width = Number(img.attrs.width), height = Number(img.attrs.height);
      assert.ok(Number.isInteger(width) && Number.isInteger(height) && width > 0 && height > 0, `${page.file} size ${img.attrs.src}`);
      const real = imageSize(fileFor(out, new URL(img.attrs.src, base).href));
      assert.ok(Math.abs(width / height - real.width / real.height) / (real.width / real.height) < 0.01, `${page.file} ratio ${img.attrs.src}`);
      for (const candidate of (img.attrs.srcset || '').split(',').map(s => s.trim().split(/\s+/)[0]).filter(Boolean)) {
        assert.ok(existsSync(fileFor(out, new URL(candidate, base).href)), candidate);
      }
      const content = !img.attrs.src.includes('assets/brand/');
      const exempt = img.attrs.src.includes('illus-overview') || img.attrs.src.includes('tour-poster');
      if (content && !exempt) assert.equal(img.attrs.loading, 'lazy', `${page.file} ${img.attrs.src}`);
    }
    for (const video of all(page.doc, n => n.tag === 'video')) {
      for (const name of ['width', 'height', 'poster', 'muted', 'playsinline']) assert.ok(video.attrs[name] !== undefined, `video ${name}`);
      assert.equal(video.attrs.autoplay, undefined);
    }
  }
});

// ---------- 12. labels ----------
test('12. unreleased label, synthetic-data captions, Preview tag and illustration alts', () => {
  const unreleasedIds = new Set(media.assets.filter(a => a.kind === 'capture' && a.released === false).flatMap(a => a.files.map(f => `assets/${f.path}`)));
  for (const page of pages(out).filter(p => p.indexed)) {
    const fr = page.lang === 'fr';
    const label = fr ? 'Non publié : depuis les sources' : 'Unreleased: build from source';
    if (!page.url.includes('faq')) {
      const section = one(page.doc, n => n.tag === 'section' && n.attrs.id === 'unreleased' && n.attrs['data-unreleased'] !== undefined);
      assert.ok(section && norm(textOf(section).replace(/ /g, ' ')).includes(label));
      const cell = one(page.doc, n => hasClass(n, 'cell--7'));
      assert.ok(norm(textOf(one(cell, n => hasClass(n, 'tag')))) === label);
      const tag = one(one(page.doc, n => hasClass(n, 'hero__copy')), n => hasClass(n, 'tag'));
      assert.equal(norm(textOf(tag)), fr ? 'Préversion 0.4.0' : '0.4.0 Preview');
    }
    for (const figure of all(page.doc, n => n.tag === 'figure')) {
      const caption = norm(textOf(one(figure, n => n.tag === 'figcaption') || { children: [] }).replace(/ /g, ' '));
      const src = one(figure, n => n.tag === 'img')?.attrs.src || '';
      const isUnreleased = figure.attrs['data-unreleased-capture'] !== undefined || one(figure, n => n.tag === 'video') || [...unreleasedIds].some(id => src.endsWith(id.split('/').pop()));
      if (isUnreleased) assert.match(caption, fr ? /non publi/i : /unreleased/i, `${page.file}: ${caption}`);
      if (figure.attrs['data-capture'] !== undefined) assert.match(caption, fr ? /données fictives/ : /synthetic data/, `${page.file}: ${caption}`);
    }
    for (const img of all(page.doc, n => n.tag === 'img' && n.attrs.src.includes('illus-'))) {
      assert.match(img.attrs.alt, fr ? /^Illustration : / : /^Illustration: /);
      assert.match(img.attrs.alt, fr ? /pas une capture du produit\.$/ : /Not a product screenshot\.$/);
    }
  }
});

// ---------- 13. hero discipline ----------
test('13. hero: four text elements, subtext of 20 words or fewer; tags above headings are rationed', () => {
  for (const page of pages(out).filter(p => p.url === '' || p.url === 'fr/')) {
    const copy = one(page.doc, n => hasClass(n, 'hero__copy'));
    const children = copy.children.filter(c => c.tag);
    assert.equal(children.length, 4);
    assert.deepEqual(children.map(c => c.tag), ['p', 'h1', 'p', 'div']);
    assert.ok(norm(textOf(children[2])).split(' ').length <= 20);
    const sections = all(one(page.doc, n => n.tag === 'main'), n => n.tag === 'section' && n.parent.tag === 'main');
    const tags = all(page.doc, n => hasClass(n, 'tag') && n.tag === 'p').filter(tag => {
      const siblings = tag.parent.children.filter(c => c.tag);
      return /^h[12]$/.test(siblings[siblings.indexOf(tag) + 1]?.tag || '');
    });
    assert.equal(sections.length, 10);
    assert.ok(tags.length <= Math.ceil(sections.length / 3), `${tags.length} tags`);
  }
});

// ---------- 14. one label per intent ----------
test('14. one visible label per destination across buttons, CTAs and footer links', () => {
  for (const page of pages(out)) {
    const labels = new Map();
    const footer = one(page.doc, n => n.tag === 'footer');
    const links = [...all(page.doc, n => n.tag === 'a' && (hasClass(n, 'btn') || hasClass(n, 'cta'))), ...all(footer, n => n.tag === 'a')];
    for (const a of links) {
      const href = new URL(a.attrs.href, SITE + page.url).href;
      if (!labels.has(href)) labels.set(href, new Set());
      labels.get(href).add(norm(textOf(a)));
    }
    for (const [href, set] of labels) assert.equal(set.size, 1, `${page.file}: ${href} -> ${[...set].join(' | ')}`);
  }
});

// ---------- 15. affiliation and review date ----------
test('15. every page states the absence of affiliation and its review date', () => {
  for (const page of pages(out)) {
    const text = norm(textOf(page.doc));
    assert.ok(text.includes('not affiliated') || text.includes('sans lien avec'), page.file);
    assert.ok(one(page.doc, n => n.tag === 'time' && n.attrs.datetime === REVIEWED), page.file);
  }
});

// ---------- 16. authorship ----------
test('16. no generator tag and no AI or tool credit in any output file', () => {
  for (const file of walk(out).filter(f => /\.(html|txt|xml|css|js)$/.test(f))) {
    const text = read(out, file);
    assert.ok(!/<meta\s+name="generator"/i.test(text), file);
    for (const word of ['Anthropic', 'Co-Authored-By', 'Generated with', 'Built with', 'Made with']) assert.ok(!text.includes(word), `${file}: ${word}`);
  }
});

// ---------- 17. French typography ----------
test('17. French text nodes use no-break spaces before : ; ? ! » and after «, and no straight double quote', () => {
  for (const page of pages(out).filter(p => p.lang === 'fr')) {
    for (const text of textNodes(one(page.doc, n => n.tag === 'body'))) {
      assert.ok(!/ [:;?!»]/.test(text), `${page.file}: ${JSON.stringify(text)}`);
      assert.ok(!/« /.test(text), `${page.file}: ${JSON.stringify(text)}`);
      assert.ok(!text.includes('"'), `${page.file}: ${JSON.stringify(text)}`);
    }
    for (const img of all(page.doc, n => n.tag === 'img')) assert.ok(!/ [:;?!»]/.test(img.attrs.alt), img.attrs.alt);
  }
});

// ---------- 18. CSS guard ----------
test('18. CSS: flat fills, one 6px radius, no import, fonts as the only url()', () => {
  for (const css of [readFileSync(path.join(root, 'site/static/site.css'), 'utf8'), read(out, walk(out).find(f => /\.css$/.test(f)))]) {
    const code = css.replace(/\/\*[\s\S]*?\*\//g, '');
    for (const banned of [/gradient\(/, /backdrop-filter/, /(?<![-\w])filter\s*:/, /blur\(/, /@import/]) assert.ok(!banned.test(code), String(banned));
    for (const m of code.matchAll(/box-shadow\s*:\s*([^;}]+)/g)) assert.equal(m[1].trim(), 'none');
    for (const m of code.matchAll(/border-radius\s*:\s*([^;}]+)/g)) assert.ok(['0', '6px'].includes(m[1].trim()), m[1]);
    for (const m of code.matchAll(/url\(([^)]+)\)/g)) assert.match(m[1], /^fonts\/montserrat-latin(?:-ext)?-wght-normal\.woff2$/);
  }
});

// ---------- 19. wording ----------
test('19. no hype or social-proof wording in visible text', () => {
  for (const page of pages(out)) {
    const text = textOf(page.doc).toLowerCase();
    for (const word of [/\bseamless/, /\belevate/, /\bunleash/, /\btestimonial/, /\brating/, /users love/, /chrome web store approved/]) assert.ok(!word.test(text), `${page.file}: ${word}`);
  }
});

// ---------- 20. permissions ----------
test('20. every permission of the README table appears in #permissions; README links the release', () => {
  const readme = readFileSync(path.join(root, 'README.md'), 'utf8');
  const table = readme.split('## What Pilovo can see')[1].split('\n## ')[0];
  const codes = [...new Set([...table.matchAll(/^\|[^|]*?`([^`]+)`/gm)].map(m => m[1]).concat([...table.matchAll(/`(https:\/\/[^`]+)`/g)].map(m => m[1])))];
  assert.ok(codes.length >= 7);
  for (const page of pages(out).filter(p => p.url === '' || p.url === 'fr/')) {
    const section = one(page.doc, n => n.attrs.id === 'permissions');
    const inCode = new Set(all(section, n => n.tag === 'code').map(n => textOf(n)));
    for (const code of codes) assert.ok(inCode.has(code), `${page.file}: ${code}`);
  }
  assert.ok(readme.includes(`releases/tag/v${RELEASE.version}`));
});

// ---------- 21. units ----------
test('21. units: Markdown subset, link rewriting, typography and GitHub slugs', () => {
  assert.throws(() => assertSupported(parse('Text\n\n- a list item\n'), 'unit'), /list/);
  assert.throws(() => assertSupported(parse('```sh\nnpm ci\n```\n'), 'unit'), /fenced/);
  assert.throws(() => inline('An ![image](x.png) here', { lang: 'en' }), /Image/);
  const opts = { repoRoot: root, fromDir: '' };
  assert.equal(rewriteLink('#what-the-states-mean', { ...opts, sourceFile: 'README.md' }).href, '#states');
  assert.equal(rewriteLink('#ce-que-pilovo-peut-voir', { ...opts, sourceFile: 'docs/README.fr.md', fromDir: 'fr/' }).href, '#privacy');
  assert.equal(rewriteLink('../README.md#what-pilovo-can-see', { ...opts, sourceFile: 'docs/faq.md', fromDir: 'faq/' }).href, '../#privacy');
  assert.equal(rewriteLink('../README.md#build-from-source', { ...opts, sourceFile: 'docs/faq.md', fromDir: 'faq/' }).href, `${BLOB}README.md#build-from-source`);
  assert.equal(rewriteLink('../README.md#what-the-states-mean', { ...opts, sourceFile: 'docs/faq.md', fromDir: 'faq/' }).href, '../#states');
  assert.equal(rewriteLink('installation.fr.md#compiler-depuis-les-sources', { ...opts, sourceFile: 'docs/faq.fr.md', fromDir: 'fr/faq/' }).href, `${BLOB}docs/installation.fr.md#compiler-depuis-les-sources`);
  assert.equal(rewriteLink('docs/faq.md#troubleshooting', { ...opts, sourceFile: 'README.md' }).href, 'faq/#troubleshooting');
  assert.equal(rewriteLink('https://example.org/a?b#c', { ...opts, sourceFile: 'README.md' }).href, 'https://example.org/a?b#c');
  assert.throws(() => rewriteLink('missing-file.md', { ...opts, sourceFile: 'README.md' }), /missing/);
  const html = inline('Voir `a : b` sur https://x.example/c?d ici ?', { lang: 'fr' }).value;
  assert.ok(html.includes('<code>a : b</code>'));
  assert.ok(html.includes('https://x.example/c?d'));
  assert.ok(html.endsWith('ici ?'));
  assert.equal(typo('fr', '« Vu » automatique : 15 s'), '« Vu » automatique : 15 s');
  assert.equal(typo('en', 'Does "Response available" mean'), 'Does “Response available” mean');
  assert.equal(slug('Numéros, positions et noms des sessions'), 'numéros-positions-et-noms-des-sessions');
  assert.equal(slug('Why does Pilovo show "Observation interrupted"?'), 'why-does-pilovo-show-observation-interrupted');
  assert.equal(slug('Pourquoi Pilovo affiche-t-il « Observation interrompue » ?'), 'pourquoi-pilovo-affiche-t-il--observation-interrompue--');
  const seen = new Set();
  assert.deepEqual([slug('A b', seen), slug('A b', seen), slug('A b', seen)], ['a-b', 'a-b-1', 'a-b-2']);
});

// ---------- 22. determinism, base URL, sources ----------
test('22. deterministic output, SITE_URL respected, unsafe --out refused, build sources stay clear of outputs/', () => {
  const hash = (dir, file) => createHash('sha256').update(readFileSync(path.join(dir, file))).digest('hex');
  const files = walk(out);
  assert.deepEqual(walk(out2), files);
  for (const file of files) assert.equal(hash(out2, file), hash(out, file), file);
  const alt = parseHtml(read(out3, 'index.html'));
  assert.equal(one(alt, n => n.tag === 'link' && n.attrs.rel === 'canonical').attrs.href, ALT_SITE);
  assert.match(read(out3, 'sitemap.xml'), /<loc>https:\/\/pilovo\.example\/<\/loc>/);
  assert.ok(one(alt, n => n.tag === 'meta' && n.attrs.property === 'og:image').attrs.content.startsWith(ALT_SITE));
  const notFound = read(out3, '404.html');
  assert.match(notFound, /href="\/faq\/"/);
  assert.match(notFound, /href="\/fr\/"/);
  for (const bad of [root, path.join(root, 'docs'), REFUSED_IN_SITE, path.dirname(root)]) {
    const result = spawnSync(process.execPath, ['scripts/build-site.mjs', '--out', bad], { cwd: root, encoding: 'utf8' });
    assert.notEqual(result.status, 0, bad);
  }
  assert.ok(!existsSync(REFUSED_IN_SITE), 'a refused --out left files inside site/');
  const foreign = path.join(tmp, 'foreign');
  mkdirSync(foreign);
  writeFileSync(path.join(foreign, 'keep.txt'), 'not a site build');
  assert.notEqual(spawnSync(process.execPath, ['scripts/build-site.mjs', '--out', foreign], { cwd: root }).status, 0);
  assert.ok(existsSync(path.join(foreign, 'keep.txt')));
  const badUrlOut = path.join(tmp, 'bad-url');
  assert.notEqual(spawnSync(process.execPath, ['scripts/build-site.mjs', '--out', badUrlOut], { cwd: root, env: { ...process.env, SITE_URL: 'http://example.org/' } }).status, 0);
  assert.ok(!existsSync(badUrlOut), 'a refused SITE_URL wrote output');
  const sources = ['scripts/build-site.mjs', ...walk(path.join(root, 'site/src')).map(f => `site/src/${f}`), ...walk(path.join(root, 'site/static')).map(f => `site/static/${f}`)];
  for (const file of sources) assert.ok(!readFileSync(path.join(root, file), 'utf8').includes('outputs/'), file);
  for (const file of files.filter(f => /\.(html|txt|xml|css|js)$/.test(f))) assert.ok(!read(out, file).includes('outputs/'), file);
});

// ---------- 23. budgets ----------
test('23. size budgets', () => {
  let total = 0;
  for (const file of walk(out)) {
    const size = statSync(path.join(out, file)).size;
    total += size;
    if (/index\.html$/.test(file)) assert.ok(size < 120 * 1024, `${file} ${size}`);
    if (file.endsWith('.css')) assert.ok(size < 25 * 1024, `${file} ${size}`);
    if (file.endsWith('.js')) assert.ok(size < 4 * 1024, `${file} ${size}`);
    if (file.endsWith('.webp')) assert.ok(size < 300 * 1024, `${file} ${size}`);
    if (/\.(mp4|webm)$/.test(file)) assert.ok(size < 3 * 1024 * 1024, `${file} ${size}`);
  }
  assert.ok(total < 10 * 1024 * 1024, `total ${total}`);
});

// ---------- 24. markup regressions ----------
test('24. figure order, FAQ self-links, shared structured data, inline separators, typography and the tour script', () => {
  const list = pages(out);
  const software = new Set();
  for (const page of list) {
    // A figcaption is the first or the last element of its figure (HTML content model).
    for (const figure of all(page.doc, n => n.tag === 'figure')) {
      const kids = figure.children.filter(c => c.tag);
      const index = kids.findIndex(c => c.tag === 'figcaption');
      if (index >= 0) assert.ok(index === 0 || index === kids.length - 1, `${page.file}: figcaption in the middle of a figure`);
    }
    // Adjacent inline siblings carry whitespace, so text extraction never runs words together.
    assert.ok(!/<\/a><a\b/.test(page.html), `${page.file}: adjacent links without whitespace`);
    assert.ok(!/<\/span><span class="legend__state"/.test(page.html), `${page.file}: legend label and state run together`);
    assert.ok(!/<\/span><button/.test(page.html), `${page.file}: caption and toggle run together`);
    // A middle dot and a session number never start a line.
    for (const text of textNodes(one(page.doc, n => n.tag === 'body'))) {
      assert.ok(!/ \u00B7 /.test(text), `${page.file}: breakable space before a middle dot: ${JSON.stringify(text)}`);
      assert.ok(!/session \d/.test(text), `${page.file}: breakable space in a session number: ${JSON.stringify(text)}`);
    }
    if (page.indexed) {
      const graph = jsonLd(page)[0]['@graph'];
      software.add(JSON.stringify(graph.find(n => n['@type'] === 'SoftwareApplication')));
      const own = graph.find(n => n['@type'] === 'WebPage' || n['@type'] === 'FAQPage');
      assert.equal(own.name, textOf(one(page.doc, n => n.tag === 'title')), `${page.file}: page node name equals the title, same typography`);
      assert.ok(own.description && own.description === one(page.doc, n => n.tag === 'meta' && n.attrs.name === 'description').attrs.content, `${page.file}: page node description`);
    }
  }
  assert.equal(software.size, 1, 'one identical SoftwareApplication node on every page');
  for (const url of ['faq/', 'fr/faq/']) {
    const page = list.find(p => p.url === url);
    for (const article of all(page.doc, n => n.tag === 'article' && hasClass(n, 'qa'))) {
      const h3 = one(article, n => n.tag === 'h3');
      assert.equal(all(h3, n => n.tag === 'a').length, 0, `${url}: link inside a question heading`);
      const anchor = one(article, n => n.tag === 'a' && hasClass(n, 'qa__anchor'));
      assert.ok(anchor && anchor.attrs.href === `#${h3.attrs.id}`, `${url}: self-link for ${h3.attrs.id}`);
      assert.ok(norm(anchor.attrs['aria-label']).endsWith(norm(textOf(h3))), `${url}: self-link names its question`);
    }
  }
  // French verb-subject inversions in headings never break at their hyphen.
  const fr = list.find(p => p.url === 'fr/faq/');
  const loose = [];
  const visit = node => {
    for (const child of node.children || []) {
      if (child.text !== undefined) { if (/[\p{L}]+(?:-t)?-(?:il|elle|on)(?![\p{L}])/u.test(decode(child.text))) loose.push(decode(child.text)); }
      else if (!hasClass(child, 'nowrap')) visit(child);
    }
  };
  for (const h of all(fr.doc, n => /^h[1-3]$/.test(n.tag))) visit(h);
  assert.deepEqual(loose, []);
  // The hero states the category, and the tour waits for motion consent and a dwell before fetching.
  for (const page of list.filter(p => p.url === '' || p.url === 'fr/')) {
    assert.match(norm(textOf(one(page.doc, n => hasClass(n, 'hero__sub')))), page.lang === 'en' ? /Chrome extension/ : /extension Chrome/);
    const video = one(page.doc, n => n.tag === 'video');
    assert.equal(video.attrs.preload, 'none');
    // Every section after the hero is named by its own h2, consistently (the hero is named by the h1).
    for (const section of all(one(page.doc, n => n.tag === 'main'), n => n.tag === 'section' && n.parent.tag === 'main' && !hasClass(n, 'hero'))) {
      const h2 = one(section, n => n.tag === 'h2');
      assert.ok(h2 && section.attrs['aria-labelledby'] === h2.attrs.id, `${page.file}: #${section.attrs.id} is not named by its heading`);
    }
  }
  const js = readFileSync(path.join(root, 'site/static/site.js'), 'utf8');
  assert.match(js, /e\.name !== 'AbortError'/, 'a pause before the first frame is not a playback failure');
  assert.match(js, /addEventListener\('error', fail\)/, 'a source the browser cannot decode restores native controls');
  assert.ok(!/preload = 'auto';\s*toggle/.test(js) && /function play\(\) \{[\s\S]*?video\.preload = 'auto'/.test(js), 'the tour is fetched only when it is played');
});

// ---------- 25. tour toggle and sources (regression: the French toggle resized the caption on play/pause) ----------
test('25. tour: one toggle footprint in every state, reserved before JS, two decodable sources, one text alternative', () => {
  const css = readFileSync(path.join(root, 'site/static/site.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
  assert.match(css, /\.tour__toggle:not\(\[data-ready\]\)\s*\{\s*visibility:\s*hidden;/, 'space reserved before site.js runs');
  assert.match(css, /\.tour__labels\s*\{\s*display:\s*inline-grid;/, 'labels share one grid');
  assert.match(css, /\.tour__label\s*\{\s*grid-area:\s*1 \/ 1;/, 'labels stacked in one cell');
  assert.match(css, /\[data-state="playing"\] \.tour__label--play[^{]*\[data-state="paused"\] \.tour__label--pause\s*\{\s*visibility:\s*hidden;/, 'inactive label hidden, not removed');
  assert.ok(!/\.tour__toggle\[hidden\]/.test(css), 'no display:none toggle state');
  const js = readFileSync(path.join(root, 'site/static/site.js'), 'utf8');
  assert.ok(!/toggle\.hidden|textContent/.test(js), 'site.js neither hides the toggle nor swaps its text');
  assert.match(js, /setAttribute\('data-ready', ''\)/);
  assert.match(js, /sources\[sources\.length - 1\]\.addEventListener\('error', fail\)/, 'only the last source failing gives up');
  assert.match(js, /d\.activeElement === toggle\) video\.focus\(\)/, 'focus moves to the player before the toggle goes away');
  // Regression: under reduced motion the browser's control bar covered the caption burned into the poster.
  // The site's toggle is the only control in every motion mode; native controls return only after fail().
  assert.ok(!/controls\(still\)/.test(js) && /controls\(false\);\s*toggle\.setAttribute\('data-ready'/.test(js), 'the toggle replaces native controls in every motion mode');
  assert.ok(!/prefers-reduced-motion:\s*reduce\)\s*\{\s*\.tour__toggle/.test(css), 'the toggle stays visible under reduced motion');
  // Regression: the video's focus ring was clipped by the frame's overflow; the frame draws it instead.
  assert.match(css, /\.frame--video:has\(video:focus-visible\)\s*\{\s*outline:\s*2px solid var\(--c-accent\);/, 'visible focus ring around a focusable video');
  for (const page of pages(out).filter(p => p.url === '' || p.url === 'fr/')) {
    const fr = page.lang === 'fr';
    const toggle = one(page.doc, n => n.tag === 'button' && n.attrs['data-tour-toggle'] !== undefined);
    assert.equal(toggle.attrs.hidden, undefined, `${page.file}: the toggle keeps its space`);
    const label = cls => norm(textOf(one(toggle, n => hasClass(n, cls))));
    assert.equal(label('tour__label--play'), fr ? 'Lire la visite' : 'Play the tour');
    assert.equal(label('tour__label--pause'), fr ? 'Mettre en pause' : 'Pause the tour');
    // Plain-text extractors read the two labels as separate words.
    assert.match(textOf(toggle), fr ? /Lire la visite\s+Mettre en pause/ : /Play the tour\s+Pause the tour/);
    // The poster is current-source UI: wherever structured data quotes it, its caption says so.
    const webPage = jsonLd(page)[0]['@graph'].find(n => n['@type'] === 'WebPage');
    assert.match(webPage.primaryImageOfPage.caption, fr ? /données fictives.*non publiées/ : /synthetic data.*unreleased/);
    const video = one(page.doc, n => n.tag === 'video');
    const sources = all(video, n => n.tag === 'source');
    assert.deepEqual(sources.map(n => n.attrs.type), ['video/mp4; codecs="avc1.640028"', 'video/webm; codecs="vp9"']);
    for (const source of sources) assert.match(source.attrs.src, /#t=4$/);
    assert.equal(video.attrs['aria-describedby'], undefined, `${page.file}: the text alternative is read once, in order`);
    const desc = one(one(page.doc, n => n.tag === 'figure' && hasClass(n, 'tour')), n => n.attrs.id === 'tour-desc');
    assert.ok(desc && desc.attrs.hidden === undefined && hasClass(desc, 'sr-only'));
  }
  // The released side panel capture, shown at a fixed 320 CSS px, has a 2x file.
  const en = pages(out).find(p => p.url === '');
  const states = one(one(en.doc, n => hasClass(n, 'states__figure')), n => n.tag === 'img');
  assert.equal(states.attrs.sizes, '320px');
  assert.ok(states.attrs.srcset.split(',').some(c => Number(c.trim().split(/\s+/)[1]?.replace('w', '')) >= 640), 'a 2x candidate');
});
