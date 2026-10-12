// 404 page: served at any depth by GitHub Pages, so every URL is root-relative to the base path.
import { html } from '../html.mjs';
import { t } from './layout.mjs';

export const NOT_FOUND = {
  title: 'Page not found · Pilovo',
  description: 'This address does not match a page on the Pilovo website. Go to the English or French home page, or read the FAQ about the Pilovo Chrome extension.',
  h1: 'Page not found',
  text: 'This address does not match a page on this site.',
  english: 'Pilovo in English',
  faq: 'FAQ',
  french: 'Page introuvable : cette adresse ne correspond à aucune page de ce site.',
  frenchLink: 'Pilovo en français',
};

export function notFoundBody(ctx) {
  return html`<section class="section not-found" aria-labelledby="nf-title">
<div class="container not-found__inner">
<h1 id="nf-title">${NOT_FOUND.h1}</h1>
<p class="lead">${NOT_FOUND.text}</p>
<ul class="not-found__links">
<li><a class="link" href="${ctx.url('')}">${NOT_FOUND.english}</a></li>
<li><a class="link" href="${ctx.url('faq/')}">${NOT_FOUND.faq}</a></li>
</ul>
<p lang="fr">${t({ c: { lang: 'fr' } }, NOT_FOUND.french)} <a class="link" href="${ctx.url('fr/')}" lang="fr" hreflang="fr">${NOT_FOUND.frenchLink}</a></p>
</div>
</section>`;
}
