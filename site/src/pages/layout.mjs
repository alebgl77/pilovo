// Shared document head, header and footer.
import { BLOB, PAGES, RELEASE, REPO, REVIEWED, formatDate } from '../config.mjs';
import { attrs, escapeHtml, html, raw } from '../html.mjs';
import { inline } from '../markdown.mjs';
import { typo } from '../typography.mjs';
import { icon } from '../icons.mjs';
import { ldScript } from '../jsonld.mjs';

// No inline script or style, no third-party origin: everything the page loads comes from this site.
// connect-src 'self' (the page itself fetches nothing) lets audit tools read this site's robots.txt.
export const CSP = "default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self'; media-src 'self'; font-src 'self'; connect-src 'self'; manifest-src 'none'; base-uri 'none'; form-action 'none'; object-src 'none'";

export const t = (ctx, text) => typo(ctx.c.lang, text);
export const md = (ctx, text, options = {}) => inline(text, { lang: ctx.c.lang, kbd: options.kbd, link: href => ({ href: /^https?:/.test(href) ? href : ctx.url(href) }) });

export function head(ctx, { title, description, canonical, alternates, jsonld, preloadImage, robots }) {
  const c = ctx.c;
  const metaTitle = t(ctx, title);
  const metaDescription = t(ctx, description);
  const ogImage = `${ctx.site}assets/brand/pilovo-social-preview.png`;
  const lines = [
    html`<meta charset="utf-8">`,
    html`<meta name="viewport" content="width=device-width, initial-scale=1">`,
    html`<meta http-equiv="Content-Security-Policy" content="${CSP}">`,
    html`<meta name="referrer" content="no-referrer">`,
    robots ? html`<meta name="robots" content="${robots}">` : '',
    html`<title>${metaTitle}</title>`,
    html`<meta name="description" content="${metaDescription}">`,
    canonical ? html`<link rel="canonical" href="${canonical}">` : '',
    ...(alternates || []).map(([lang, href]) => html`<link rel="alternate" hreflang="${lang}" href="${href}">`),
    html`<meta name="color-scheme" content="light dark">`,
    html`<meta name="theme-color" content="#F6F4EE" media="(prefers-color-scheme: light)">`,
    html`<meta name="theme-color" content="#1B201A" media="(prefers-color-scheme: dark)">`,
  ];
  if (canonical) {
    lines.push(
      html`<meta property="og:type" content="website">`,
      html`<meta property="og:site_name" content="Pilovo">`,
      html`<meta property="og:title" content="${metaTitle}">`,
      html`<meta property="og:description" content="${metaDescription}">`,
      html`<meta property="og:url" content="${canonical}">`,
      html`<meta property="og:locale" content="${c.locale}">`,
      html`<meta property="og:locale:alternate" content="${c.ogLocaleAlternate}">`,
      html`<meta property="og:image" content="${ogImage}">`,
      html`<meta property="og:image:type" content="image/png">`,
      html`<meta property="og:image:width" content="1280">`,
      html`<meta property="og:image:height" content="640">`,
      html`<meta property="og:image:alt" content="${t(ctx, c.meta.ogImageAlt)}">`,
      html`<meta name="twitter:card" content="summary_large_image">`,
      html`<meta name="twitter:title" content="${metaTitle}">`,
      html`<meta name="twitter:description" content="${metaDescription}">`,
      html`<meta name="twitter:image" content="${ogImage}">`,
      html`<meta name="twitter:image:alt" content="${t(ctx, c.meta.ogImageAlt)}">`,
    );
  }
  lines.push(
    html`<link rel="icon" href="${ctx.url('assets/brand/favicon.svg')}" type="image/svg+xml">`,
    html`<link rel="icon" href="${ctx.url('assets/brand/favicon-32.png')}" sizes="32x32" type="image/png">`,
    html`<link rel="apple-touch-icon" href="${ctx.url('assets/brand/apple-touch-icon.png')}">`,
    html`<link rel="preload" href="${ctx.url('assets/fonts/montserrat-latin-wght-normal.woff2')}" as="font" type="font/woff2" crossorigin>`,
    preloadImage ? html`<link rel="preload" as="image" href="${ctx.url(preloadImage)}" fetchpriority="high">` : '',
    html`<link rel="stylesheet" href="${ctx.url(ctx.assets.css)}">`,
    html`<script src="${ctx.url(ctx.assets.js)}" defer></script>`,
    jsonld ? raw(ldScript(jsonld)) : '',
  );
  return html`<head>
${lines.filter(Boolean).map(line => html`${line}\n`)}</head>`;
}

function logo(ctx) {
  return html`<picture><source srcset="${ctx.url('assets/brand/pilovo-logo-light.svg')}" media="(prefers-color-scheme: dark)"><img src="${ctx.url('assets/brand/pilovo-logo.svg')}" alt="Pilovo" width="304" height="96" loading="eager" decoding="async"></picture>`;
}

export function header(ctx) {
  const c = ctx.c;
  const onLanding = ctx.pageKey === 'landing';
  const landing = PAGES.landing[c.lang];
  const section = id => (onLanding ? `#${id}` : `${ctx.url(landing)}#${id}`.replace(/^\.\/#/, '#'));
  const faqCurrent = ctx.pageKey === 'faq';
  const other = c.lang === 'en' ? 'fr' : 'en';
  const twin = ctx.pageKey === 'faq' ? PAGES.faq[other] : PAGES.landing[other];
  const items = [
    ['lg', section('states'), c.nav.states],
    ['lg', section('privacy'), c.nav.privacy],
    ['lg', section('permissions'), c.nav.permissions],
    ['md', section('install'), c.nav.install],
    ['', ctx.url(PAGES.faq[c.lang]), c.nav.faq, faqCurrent],
    ['lg', REPO, c.labels.source],
  ];
  return html`<a class="skip" href="#main">${t(ctx, c.skip)}</a>
<header class="site-header">
<div class="container bar">
<a class="brand" href="${ctx.url(landing)}">${logo(ctx)}</a>
<nav class="nav" aria-label="${t(ctx, c.nav.label)}">
<ul>${items.map(([size, href, label, current]) => html`<li${attrs({ class: size ? `nav__item nav__item--${size}` : 'nav__item' })}><a${attrs({ href, 'aria-current': current ? 'page' : null })}>${t(ctx, label)}</a></li>`)}</ul>
</nav>
<a class="lang" href="${ctx.url(twin)}" lang="${other}" hreflang="${other}">${t(ctx, c.langSwitch)}</a>
</div>
</header>`;
}

// A trailing note such as "(en anglais)" moves to the next line as a whole in a narrow footer column.
function linkLabel(ctx, label) {
  const match = /^(.*\S) (\([^()]+\))$/.exec(label);
  return match ? html`${t(ctx, match[1])} <span class="nowrap">${t(ctx, match[2])}</span>` : t(ctx, label);
}

export function footer(ctx) {
  const c = ctx.c;
  const other = c.lang === 'en' ? 'fr' : 'en';
  const twin = ctx.pageKey === 'faq' ? PAGES.faq[other] : PAGES.landing[other];
  const group = (key, id, links) => html`<nav class="footer__group" aria-labelledby="${id}">
<p class="footer__label" id="${id}">${t(ctx, c.footer.groups[key])}</p>
<ul>${links.map(([href, label, extra = {}]) => html`<li><a${attrs({ href, ...extra })}>${linkLabel(ctx, label)}</a></li>`)}</ul>
</nav>`;
  return html`<footer class="site-footer">
<div class="container">
<div class="footer__grid">
<div class="footer__brand">${logo(ctx)}<p class="footer__signature">${t(ctx, c.footer.signature)}</p></div>
${group('get', 'footer-get', [
    [RELEASE.tagUrl, c.labels.download],
    [c.urls.install, c.labels.install],
    [`${REPO}/releases`, c.labels.releases],
    [`${BLOB}CHANGELOG.md`, c.labels.changelog],
  ])}
${group('project', 'footer-project', [
    [REPO, c.labels.source],
    [`${BLOB}docs/privacy.md`, c.labels.privacy],
    [`${BLOB}docs/compatibility.md`, c.labels.compat],
    [`${BLOB}SECURITY.md`, c.labels.security],
    [`${BLOB}LICENSE`, c.labels.license],
    [`${REPO}/issues`, c.labels.issues],
  ])}
${group('site', 'footer-site', [
    [ctx.url(PAGES.faq[c.lang]), c.nav.faq],
    [ctx.url(twin), c.langSwitch, { lang: other, hreflang: other }],
    [ctx.url('third-party-notices.txt'), c.labels.notices],
    [ctx.url('llms.txt'), 'llms.txt'],
  ])}
</div>
<div class="footer__legal">
<p>${t(ctx, c.footer.notAffiliated)}</p>
<p>${t(ctx, c.footer.sitePrivacy)}</p>
<p>${t(ctx, c.footer.reviewed)} <time datetime="${REVIEWED}">${formatDate(REVIEWED, c.lang).replace(/ /g, '\u00A0')}</time>.</p>
</div>
</div>
</footer>`;
}

export function document(ctx, { headHtml, body }) {
  return `<!doctype html>
<html lang="${escapeHtml(ctx.c.lang)}">
${headHtml}
<body>
${header(ctx)}
<main id="main" tabindex="-1">
${body}
</main>
${footer(ctx)}
</body>
</html>
`;
}

export { icon, md as markdownInline };
