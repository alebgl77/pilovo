// Landing page (English at /, French at /fr/): ten sections, ten layout families.
import { RELEASE, REPO, REVIEWED, VIDEO, BLOB, formatDate } from '../config.mjs';
import { attrs, escapeHtml, html, raw } from '../html.mjs';
import { icon } from '../icons.mjs';
import { inline, slug, stripInline } from '../markdown.mjs';
import { img, variants } from '../media.mjs';
import { t, md } from './layout.mjs';

// Rendered width of rail media: panel clamp(280px, 30vw, 360px) less its padding and border (34px).
const RAIL_SIZES = '(min-width: 1200px) 326px, (min-width: 934px) calc(30vw - 34px), (min-width: 768px) 246px, calc(85vw - 34px)';
const STATE_ICONS = [['LoaderCircle', true], ['CircleAlert', true], ['CircleAlert', true], ['Circle', false], ['Unplug', false], ['Check', false]];

// Inline Markdown from a repository file, with its links rewritten for this page.
function docInline(ctx, text, sourceFile) {
  return inline(text, { lang: ctx.c.lang, link: href => ctx.docLink(href, sourceFile) });
}

function withTime(ctx, rendered, date) {
  const plain = escapeHtml(date);
  if (!rendered.value.includes(plain)) throw new Error(`Review date "${date}" not found in rendered text.`);
  return raw(rendered.value.replace(plain, `<time datetime="${REVIEWED}">${plain.replace(/ /g, '\u00A0')}</time>`));
}

const primary = (ctx, extra = '') => html`<a class="btn btn--primary${extra}" href="${RELEASE.tagUrl}">${icon('Download', 18)}<span>${t(ctx, ctx.c.labels.download)}</span></a>`;
const secondary = (ctx, href, label) => html`<a class="btn btn--secondary" href="${href}"><span>${t(ctx, label)}</span>${icon('ArrowUpRight', 16)}</a>`;

function hero(ctx) {
  const c = ctx.c;
  const poster = variants(ctx.media.get(`tour-poster-${c.lang}`)).at(-1);
  const files = variants(ctx.media.get(`tour-${c.lang}`));
  // H.264 first (Safari, Chrome, Edge, Firefox); VP9 for Chromium builds without H.264. The codecs
  // parameter lets a browser skip a source it cannot decode instead of failing on it.
  const sources = [['.mp4', 'video/mp4; codecs="avc1.640028"'], ['.webm', 'video/webm; codecs="vp9"']].map(([ext, type]) => {
    const file = files.find(f => f.path.endsWith(ext));
    if (!file) throw new Error(`Tour ${c.lang} has no ${ext} file.`);
    return { ...file, type };
  });
  ctx.used.add(poster.path);
  for (const source of sources) ctx.used.add(source.path);
  const video = sources[0];
  // The text alternative below stays in the reading order; it is not also wired as a description.
  const media = VIDEO
    ? html`<div class="frame frame--video">
<video data-tour width="${video.width}" height="${video.height}" poster="${ctx.url(poster.path)}" preload="none" muted playsinline loop controls aria-label="${t(ctx, c.hero.videoLabel)}">
${sources.map(source => html`<source src="${ctx.url(source.path)}#t=4" type="${source.type}">
`)}</video>
</div>`
    : html`<div class="frame frame--video">${img(ctx.media, { id: `tour-poster-${c.lang}`, alt: t(ctx, c.hero.posterAlt), fromDir: ctx.fromDir, loading: 'eager', priority: true, used: ctx.used })}</div>`;
  return html`<section class="hero">
<div class="container hero__grid">
<div class="hero__copy">
<p class="tag">${t(ctx, c.hero.tag)}</p>
<h1 id="hero-title">${t(ctx, c.hero.h1)}</h1>
<p class="hero__sub">${t(ctx, c.hero.sub)}</p>
<div class="ctas">${primary(ctx)}
${secondary(ctx, REPO, c.labels.source)}</div>
</div>
<figure class="tour" data-capture data-synthetic data-unreleased-capture>
${media}
<p id="tour-desc" class="sr-only">${t(ctx, c.hero.description)}</p>
<figcaption><span>${t(ctx, c.hero.caption)}</span>${VIDEO ? html`
<button type="button" class="tour__toggle" data-tour-toggle data-state="paused">${icon('Pause', 16, 'icon icon--pause')}${icon('Play', 16, 'icon icon--play')}<span class="tour__labels"><span class="tour__label tour__label--play">${t(ctx, c.hero.play)}</span> <span class="tour__label tour__label--pause">${t(ctx, c.hero.pause)}</span></span></button>` : ''}</figcaption>
</figure>
</div>
</section>`;
}

function what(ctx) {
  const c = ctx.c;
  const r = ctx.readme;
  const clusters = [[0, 1, 2, 7], [3, 4, 8], [5, 6]];
  const intro = withTime(ctx, docInline(ctx, r.factsIntro, r.file), c.what.factsDate);
  return html`<section id="what-is-pilovo" class="section what" aria-labelledby="what-title">
<div class="container">
<div class="what__intro">
<h2 id="what-title">${t(ctx, c.what.h2)}</h2>
<p class="lede">${docInline(ctx, r.definition, r.file)}</p>
<p>${docInline(ctx, r.version, r.file)}</p>
</div>
<p class="small what__facts-intro">${intro}</p>
<div class="facts">
${clusters.map((rows, i) => html`<div class="facts__cluster">
<h3 class="facts__head">${t(ctx, c.what.clusters[i])}</h3>
<dl class="facts__list">${rows.map(index => html`<div class="facts__row"><dt>${t(ctx, r.facts[index][0])}</dt><dd>${docInline(ctx, r.facts[index][1], r.file)}</dd></div>`)}</dl>
</div>`)}
</div>
</div>
</section>`;
}

function states(ctx) {
  const c = ctx.c;
  const r = ctx.readme;
  const f = c.states.figure;
  const tall = f.variant === 'tall';
  const figure = html`<figure class="states__figure${tall ? ' states__figure--tall' : ''}" data-capture data-synthetic>
<div class="frame${tall ? ' frame--plate' : ''}">${img(ctx.media, { id: f.id, alt: t(ctx, f.alt), sizes: f.sizes, fromDir: ctx.fromDir, used: ctx.used })}</div>
<figcaption>${t(ctx, f.caption)}</figcaption>
</figure>`;
  return html`<section id="states" class="section states states--${f.variant}" aria-labelledby="states-title">
<div class="container">
<div class="states__grid">
<div class="states__head">
<h2 id="states-title">${t(ctx, c.states.h2)}</h2>
<p class="lead">${md(ctx, c.states.lead)}</p>
</div>
${figure}
<div class="states__body">
<p>${docInline(ctx, r.stateContext, r.file)}</p>
<dl class="legend">
${r.states.map((row, i) => html`<div class="legend__item reveal">
<dt><span class="legend__icon${STATE_ICONS[i][1] ? ' legend__icon--accent' : ''}">${icon(STATE_ICONS[i][0], 20)}</span><span class="legend__label">${docInline(ctx, row[1], r.file)}</span>${stripInline(row[1]) === row[0] ? '' : html`
<span class="legend__state"><span class="sr-only">(</span>${t(ctx, row[0])}<span class="sr-only">)</span></span>`}</dt>
<dd>${docInline(ctx, row[2], r.file)}</dd>
</div>`)}
</dl>
<p class="states__note">${docInline(ctx, r.stateNote, r.file)}</p>
</div>
</div>
<div class="states__qa">
${[c.states.tabs, c.states.badge].map(item => html`<div class="states__q">
<h3>${t(ctx, item.h3)}</h3>
<p>${t(ctx, item.text)}</p>
</div>`)}
</div>
</div>
</section>`;
}

function privacy(ctx) {
  const c = ctx.c;
  const p = c.privacy;
  return html`<section id="privacy" class="section privacy" aria-labelledby="privacy-title">
<div class="container">
<div class="section__head">
<h2 id="privacy-title">${t(ctx, p.h2)}</h2>
<p class="lead">${t(ctx, p.lead)}</p>
</div>
<figure class="band">
<div class="frame">${img(ctx.media, { id: 'illus-status-zone', alt: t(ctx, p.bandAlt), sizes: '(min-width: 1280px) and (prefers-color-scheme: dark) 792px, (min-width: 1024px) and (prefers-color-scheme: dark) 61vw, (min-width: 1280px) 1200px, 92vw', fromDir: ctx.fromDir, used: ctx.used, className: 'band__img' })}</div>
<figcaption>${t(ctx, p.bandCaption)}</figcaption>
</figure>
<div class="ledger">
<div class="ledger__col">
<h3 class="ledger__head">${icon(p.readIcon, 20)}<span>${t(ctx, p.readH3)}</span></h3>
<ul class="ledger__list">${p.read.map(([name, text]) => html`<li>${icon(name, 20)}<p>${md(ctx, text)}</p></li>`)}</ul>
<p class="small ledger__note">${md(ctx, p.readUnreleased)}</p>
</div>
<div class="ledger__col">
<h3 class="ledger__head">${icon('EyeOff', 20)}<span>${t(ctx, p.neverH3)}</span></h3>
<ul class="chips">${p.never.map(item => html`<li class="chip">${t(ctx, item)}</li>`)}</ul>
${p.notes.map(note => html`<p>${t(ctx, note)}</p>`)}
<p><a class="link" href="${BLOB}docs/privacy.md">${t(ctx, c.labels.privacy)}</a></p>
</div>
</div>
</div>
</section>`;
}

function permissions(ctx) {
  const c = ctx.c;
  const p = c.permissions;
  // How to remove a site's access belongs with the optional site permissions, so it closes the first cell.
  const cell = (item, i) => {
    const media = i === 1 ? html`<div class="cell__media">${img(ctx.media, { id: 'illus-never-requested', alt: t(ctx, p.illustrationAlt), sizes: '(min-width: 1280px) 490px, (min-width: 1024px) calc(41.7vw - 40px), 92vw', fromDir: ctx.fromDir, used: ctx.used })}</div>` : '';
    return html`<li class="cell cell--${i + 1} reveal">
${media}<span class="cell__icon">${icon(item.icon, 24)}</span>
<p class="cell__label"><span>${t(ctx, item.label)}</span>${item.unreleased ? html` <span class="tag tag--small">${t(ctx, c.unreleasedLabel)}</span>` : ''}</p>
<h3 class="cell__title">${md(ctx, item.h3)}</h3>
<p>${md(ctx, item.text)}</p>${i === 0 ? html`
<p class="cell__note">${md(ctx, p.after)}</p>` : ''}
</li>`;
  };
  return html`<section id="permissions" class="section permissions" aria-labelledby="permissions-title">
<div class="container">
<div class="section__head">
<h2 id="permissions-title">${t(ctx, p.h2)}</h2>
<p class="lead">${md(ctx, p.lead)}</p>
</div>
<ul class="bento">
${p.cells.map(cell)}
</ul>
</div>
</section>`;
}

function unreleased(ctx) {
  const c = ctx.c;
  const u = c.unreleased;
  // Panels without a capture or an illustration are plain tinted text panels: no imitation of the interface.
  const panel = item => {
    let media = '';
    if (item.media?.capture) {
      media = html`<figure class="panel__media" data-capture data-synthetic data-unreleased-capture>
<div class="frame">${img(ctx.media, { id: item.media.id, alt: t(ctx, item.media.alt), sizes: RAIL_SIZES, fromDir: ctx.fromDir, used: ctx.used })}</div>
<figcaption>${t(ctx, u.captureCaption)}</figcaption>
</figure>`;
    } else if (item.media) {
      media = html`<div class="panel__media"><div class="frame">${img(ctx.media, { id: item.media.id, alt: t(ctx, item.media.alt), sizes: RAIL_SIZES, fromDir: ctx.fromDir, used: ctx.used })}</div></div>`;
    }
    return html`<li class="panel${item.media ? '' : ' panel--tint'}">
${media}<h3>${t(ctx, item.h3)}</h3>
<p>${md(ctx, item.text, { kbd: true })}</p>
<p class="panel__more"><a class="link" href="${c.urls.install}#${item.anchor}">${t(ctx, u.details)}<span class="sr-only">${t(ctx, `${u.detailsAbout} ${item.h3}`)}</span></a></p>
</li>`;
  };
  return html`<section id="unreleased" class="section unreleased" data-unreleased aria-labelledby="unreleased-title">
<div class="container">
<div class="section__head">
<p class="tag">${t(ctx, c.unreleasedLabel)}</p>
<h2 id="unreleased-title">${t(ctx, u.h2)}</h2>
<p class="lead">${t(ctx, u.intro)}</p>
<p><a class="link" href="${c.urls.build}">${t(ctx, c.labels.build)}</a></p>
</div>
</div>
<div class="rail" role="region" aria-label="${t(ctx, u.railLabel)}" tabindex="0">
<ul class="rail__track">
${u.panels.map(panel)}
</ul>
</div>
</section>`;
}

function install(ctx) {
  const c = ctx.c;
  const s = c.install;
  return html`<section id="install" class="section install" aria-labelledby="install-title">
<div class="container">
<div class="section__head">
<h2 id="install-title">${t(ctx, s.h2)}</h2>
<p class="lead">${md(ctx, s.lead)}</p>
</div>
<div class="install__grid">
<ol class="steps">
${s.steps.map(([title, text]) => html`<li class="step reveal"><h3>${t(ctx, title)}</h3><p>${md(ctx, text)}</p></li>`)}
</ol>
<div class="install__aside">
${s.aside.map(([title, text]) => html`<h3>${t(ctx, title)}</h3><p>${md(ctx, text)}</p>`)}
<ul class="install__links">
<li><a class="link" href="${c.urls.install}">${t(ctx, c.labels.install)}</a></li>
<li><a class="link" href="${c.urls.build}">${t(ctx, c.labels.build)}</a></li>
</ul>
${primary(ctx)}
</div>
</div>
</div>
</section>`;
}

function limits(ctx) {
  const c = ctx.c;
  const l = c.limits;
  return html`<section id="limits" class="section limits" aria-labelledby="limits-title">
<div class="container">
<div class="section__head">
<h2 id="limits-title">${t(ctx, l.h2)}</h2>
<p class="lead">${t(ctx, l.lead)}</p>
</div>
<ul class="limits__list">
${l.items.map(([name, text]) => html`<li class="limit reveal">${icon(name, 24)}<p>${md(ctx, text)}</p></li>`)}
</ul>
<p class="limits__more"><a class="link" href="${BLOB}docs/compatibility.md">${t(ctx, c.labels.compat)}</a></p>
</div>
</section>`;
}

function faq(ctx) {
  const c = ctx.c;
  const r = ctx.readme;
  const seen = new Set(['main']);
  return html`<section id="faq" class="section faq" aria-labelledby="faq-title">
<div class="container">
<h2 id="faq-title">${t(ctx, c.faq.heading)}</h2>
<div class="qa-list">
${r.faq.map((item, i) => html`<details class="qa" id="${slug(item.question, seen)}"${attrs({ open: i === 0 })}>
<summary><h3>${docInline(ctx, item.question, r.file)}</h3><span class="qa__icon">${icon('Plus', 20, 'icon icon--plus')}${icon('Minus', 20, 'icon icon--minus')}</span></summary>
<div class="answer">${item.paragraphs.map(p => html`<p>${docInline(ctx, p, r.file)}</p>`)}</div>
</details>`)}
</div>
<p class="faq__more">${t(ctx, c.faq.closing)} <a class="link" href="${ctx.url(ctx.faqPath)}">${t(ctx, c.labels.fullFaq)}</a></p>
</div>
</section>`;
}

function openSource(ctx) {
  const c = ctx.c;
  return html`<section id="open-source" class="section open" aria-labelledby="open-title">
<div class="container">
<div class="closing">
<div class="closing__text">
<h2 id="open-title">${t(ctx, c.open.h2)}</h2>
<p>${t(ctx, c.open.text)}</p>
<div class="ctas">${primary(ctx)}
${secondary(ctx, REPO, c.labels.source)}</div>
</div>
<div class="closing__media frame">${img(ctx.media, { id: 'illus-panel-layers', alt: t(ctx, c.open.alt), sizes: '(min-width: 1280px) 430px, (min-width: 1024px) 33vw, 82vw', fromDir: ctx.fromDir, used: ctx.used })}</div>
</div>
</div>
</section>`;
}

export function landingBody(ctx) {
  return [hero, what, states, privacy, permissions, unreleased, install, limits, faq, openSource].map(section => section(ctx)).join('\n');
}

export const reviewedText = lang => formatDate(REVIEWED, lang);
