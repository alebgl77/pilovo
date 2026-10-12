// FAQ pages (/faq/ and /fr/faq/), generated from docs/faq.md and docs/faq.fr.md.
import { PAGES, RELEASE, REPO, REVIEWED, formatDate } from '../config.mjs';
import { escapeHtml, html, raw } from '../html.mjs';
import { icon } from '../icons.mjs';
import { inline, stripInline, toPlain } from '../markdown.mjs';
import { img } from '../media.mjs';
import { t } from './layout.mjs';

function docInline(ctx, text) {
  return inline(text, { lang: ctx.c.lang, link: href => ctx.docLink(href, ctx.faq.file) });
}

// Name and plain-text answer of every question, for FAQPage structured data.
export function faqQuestions(c, data) {
  return data.chapters.flatMap(chapter => chapter.questions.map(q => ({
    id: q.id,
    name: toPlain(q.question, c.lang),
    answer: q.paragraphs.map(p => toPlain(p, c.lang)).join(' '),
  })));
}

export function faqBody(ctx) {
  const c = ctx.c;
  const f = c.faqPage;
  const data = ctx.faq;
  const date = formatDate(REVIEWED, c.lang);
  const introHtml = docInline(ctx, data.intro).value;
  const dateHtml = escapeHtml(date);
  if (!introHtml.includes(dateHtml)) throw new Error('FAQ intro lost its review date.');
  const intro = raw(introHtml.replace(dateHtml, `<time datetime="${REVIEWED}">${dateHtml.replace(/ /g, '\u00A0')}</time>`));
  const seen = c.faqPage.seen;
  const figure = html`<figure class="faq-figure" data-capture data-synthetic data-unreleased-capture>
<div class="frame">${img(ctx.media, { id: seen.id, alt: t(ctx, seen.alt), sizes: '(min-width: 1280px) 688px, (min-width: 1024px) 53vw, 92vw', fromDir: ctx.fromDir, used: ctx.used })}</div>
<figcaption>${t(ctx, seen.caption)}</figcaption>
</figure>`;
  // Chapters are plain sections (headings already structure the page; no extra region landmarks).
  // The self-link sits beside its heading, so the heading's accessible name stays the question alone.
  const chapters = data.chapters.map(chapter => html`<section class="faq-chapter">
<h2 id="${chapter.id}">${docInline(ctx, chapter.title)}</h2>
${chapter.title === f.figureAfter ? figure : ''}
${chapter.questions.map(q => html`<article class="qa" aria-labelledby="${q.id}">
<div class="qa__head"><h3 id="${q.id}">${docInline(ctx, q.question)}</h3>
<a class="qa__anchor" href="#${q.id}" aria-label="${t(ctx, `${f.anchorLabel}${c.lang === 'fr' ? ' : ' : ': '}${stripInline(q.question)}`)}">${icon('Link', 16)}</a></div>
${q.paragraphs.map(p => html`<p>${docInline(ctx, p)}</p>`)}
</article>`)}
</section>`);
  if (!data.chapters.some(chapter => chapter.title === f.figureAfter)) throw new Error(`FAQ chapter not found for the figure: ${f.figureAfter}`);
  return html`<div class="container faq-page">
<nav class="breadcrumb" aria-label="${t(ctx, f.breadcrumb)}">
<ol><li><a href="${ctx.url(PAGES.landing[c.lang])}">${t(ctx, f.home)}</a></li><li>${icon('ChevronRight', 16)}<span aria-current="page">FAQ</span></li></ol>
</nav>
<header class="faq-head">
<div class="faq-head__text">
<h1>${docInline(ctx, data.title)}</h1>
<p class="lede">${intro}</p>
</div>
<div class="faq-head__media frame">${img(ctx.media, { id: 'illus-overview', alt: t(ctx, f.illustrationAlt), sizes: '(min-width: 1280px) 380px, (min-width: 1024px) 21.5vw, 92vw', fromDir: ctx.fromDir, loading: 'eager', priority: true, used: ctx.used })}</div>
</header>
<div class="faq-body">
<nav class="toc" aria-labelledby="toc-title">
<p class="toc__label" id="toc-title">${t(ctx, f.toc)}</p>
<ol>${data.chapters.map(chapter => html`<li><a href="#${chapter.id}">${docInline(ctx, chapter.title)}</a></li>`)}</ol>
</nav>
<div class="faq-article">
${chapters}
</div>
</div>
<section class="faq-closing">
<h2 id="closing-title">${t(ctx, f.closingH2)}</h2>
<p>${t(ctx, f.closingText)}</p>
<div class="ctas">
<a class="btn btn--primary" href="${RELEASE.tagUrl}">${icon('Download', 18)}<span>${t(ctx, c.labels.download)}</span></a>
<a class="btn btn--secondary" href="${REPO}/issues"><span>${t(ctx, c.labels.issues)}</span>${icon('ArrowUpRight', 16)}</a>
<a class="btn btn--secondary" href="${REPO}"><span>${t(ctx, c.labels.source)}</span>${icon('ArrowUpRight', 16)}</a>
</div>
</section>
</div>`;
}
