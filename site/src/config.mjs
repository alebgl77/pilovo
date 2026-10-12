// Single source of the website's addresses, release facts and review date.
export const DEFAULT_SITE_URL = 'https://alebgl77.github.io/pilovo/';
export const REPO = 'https://github.com/alebgl77/pilovo';
export const BLOB = `${REPO}/blob/main/`;
export const RAW = 'https://raw.githubusercontent.com/alebgl77/pilovo/main/';
export const RELEASE = Object.freeze({
  version: '0.4.0',
  date: '2026-10-10',
  tagUrl: `${REPO}/releases/tag/v0.4.0`,
  zip: 'Pilovo_Chrome_v0.4.0.zip',
  sums: 'Pilovo_SHA256_v0.4.0.json',
});
export const REVIEWED = '2026-10-11';
export const MONTHS = Object.freeze({
  en: ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'],
  fr: ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'],
});
// Same-document anchors of README.md / docs/README.fr.md that have a section on the landing page.
// "What Pilovo can see" lands on #privacy, whose heading asks that question; #permissions follows it.
export const README_ANCHORS = Object.freeze({
  en: {
    'what-pilovo-can-see': 'privacy',
    'what-the-states-mean': 'states',
    'unreleased-features-build-from-source': 'unreleased',
    'install-in-chrome': 'install',
    'pilovo-at-a-glance': 'what-is-pilovo',
    'frequently-asked-questions': 'faq',
  },
  fr: {
    'ce-que-pilovo-peut-voir': 'privacy',
    'les-états-affichés': 'states',
    'fonctions-non-publiées-depuis-les-sources': 'unreleased',
    'installer-la-préversion': 'install',
    'pilovo-en-bref': 'what-is-pilovo',
    'questions-fréquentes': 'faq',
  },
});
// The hero shows the re-rendered tour video; false falls back to its poster still with the same caption.
export const VIDEO = true;

export const LANGS = ['en', 'fr'];
// Site paths (relative to SITE_URL) of the indexed pages.
export const PAGES = Object.freeze({
  landing: { en: '', fr: 'fr/' },
  faq: { en: 'faq/', fr: 'fr/faq/' },
});

export function formatDate(iso, lang) {
  const [year, month, day] = iso.split('-').map(Number);
  return `${day} ${MONTHS[lang][month - 1]} ${year}`;
}

// SITE_URL: absolute https, or http on localhost/127.0.0.1 for previews; no query or hash; one trailing slash.
export function resolveSiteUrl(raw = process.env.SITE_URL) {
  const input = raw && String(raw).trim() ? String(raw).trim() : DEFAULT_SITE_URL;
  let url;
  try { url = new URL(input); } catch { throw new Error(`SITE_URL is not an absolute URL: ${input}`); }
  const local = url.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(url.hostname);
  if (url.protocol !== 'https:' && !local) throw new Error('SITE_URL must use https (http only for localhost or 127.0.0.1).');
  if (url.search || url.hash || input.includes('?') || input.includes('#')) throw new Error('SITE_URL must not carry a query or a fragment.');
  if (url.username || url.password) throw new Error('SITE_URL must not carry credentials.');
  let pathname = url.pathname.replace(/\/{2,}/g, '/');
  if (!pathname.endsWith('/')) pathname += '/';
  const site = `${url.origin}${pathname}`;
  return { site, origin: url.origin, basePath: pathname };
}
