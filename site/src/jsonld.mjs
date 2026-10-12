// schema.org graphs. Never: aggregateRating, review, SearchAction or HowTo; nothing is invented.
import { BLOB, PAGES, RELEASE, REPO, REVIEWED } from './config.mjs';
import { typo } from './typography.mjs';
import { variants } from './media.mjs';
import en from './content/en.mjs';
import fr from './content/fr.mjs';

// The Organization, WebSite and SoftwareApplication nodes are identical on every page and in both languages
// (one entity per @id, never contradictory values). Their texts carry both languages as language-tagged
// values, so a French page also states the French description, features, install guide and screenshot.
// Each page's own WebPage or FAQPage node carries the page language's name and description.
const tagged = pick => [en, fr].map(content => ({ '@language': content.lang, '@value': typo(content.lang, pick(content)) }));

function shared(site, media) {
  const screenshot = content => {
    const shot = variants(media.get(content.jsonld.screenshot.id)).at(-1);
    return { '@type': 'ImageObject', url: `${site}${shot.path}`, width: shot.width, height: shot.height, inLanguage: content.lang, caption: typo(content.lang, content.jsonld.screenshot.caption) };
  };
  return [
    { '@type': 'Organization', '@id': `${site}#org`, name: 'Pilovo contributors', url: REPO },
    {
      '@type': 'WebSite', '@id': `${site}#website`, url: site, name: 'Pilovo', inLanguage: ['en', 'fr'],
      description: 'Pilovo is an open-source Chrome extension that shows whether your ChatGPT and Claude tabs are working, have a response ready or need your attention.',
      publisher: { '@id': `${site}#org` },
    },
    {
      '@type': 'SoftwareApplication', '@id': `${site}#software`, name: 'Pilovo', url: site,
      description: tagged(content => content.jsonld.software),
      applicationCategory: 'BrowserApplication', applicationSubCategory: 'Chrome extension',
      operatingSystem: typo(en.lang, en.jsonld.os), softwareRequirements: typo(en.lang, en.jsonld.os),
      softwareVersion: RELEASE.version, datePublished: RELEASE.date,
      downloadUrl: RELEASE.tagUrl, releaseNotes: RELEASE.tagUrl, installUrl: [en.jsonld.installUrl, fr.jsonld.installUrl],
      offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD', url: RELEASE.tagUrl },
      isAccessibleForFree: true,
      license: `${BLOB}LICENSE`,
      inLanguage: ['en', 'fr'],
      permissions: 'storage, sidePanel, alarms, scripting; optional, one site at a time: https://chatgpt.com/*, https://claude.ai/*',
      featureList: [en, fr].flatMap(content => content.jsonld.featureList.map(item => ({ '@language': content.lang, '@value': typo(content.lang, item) }))),
      image: `${site}assets/brand/pilovo-social-preview.png`,
      screenshot: [screenshot(en), screenshot(fr)],
      author: { '@id': `${site}#org` },
      sameAs: [REPO],
    },
  ];
}

export function landingGraph({ site, content, media, title, description, poster }) {
  const page = `${site}${PAGES.landing[content.lang]}`;
  return {
    '@context': 'https://schema.org',
    '@graph': [
      ...shared(site, media),
      {
        '@type': 'WebPage', '@id': `${page}#webpage`, url: page, name: typo(content.lang, title), description: typo(content.lang, description), inLanguage: content.lang,
        isPartOf: { '@id': `${site}#website` }, about: { '@id': `${site}#software` }, dateModified: REVIEWED,
        primaryImageOfPage: { '@type': 'ImageObject', url: `${site}${poster.path}`, width: poster.width, height: poster.height, caption: typo(content.lang, content.jsonld.posterCaption) },
      },
      {
        '@type': 'SoftwareSourceCode', '@id': `${site}#source`, name: content.jsonld.sourceName, codeRepository: REPO,
        programmingLanguage: 'TypeScript', license: `${BLOB}LICENSE`, targetProduct: { '@id': `${site}#software` },
      },
    ],
  };
}

export function faqGraph({ site, content, media, title, description, questions }) {
  const page = `${site}${PAGES.faq[content.lang]}`;
  const landing = `${site}${PAGES.landing[content.lang]}`;
  return {
    '@context': 'https://schema.org',
    '@graph': [
      ...shared(site, media),
      {
        '@type': 'FAQPage', '@id': `${page}#faq`, url: page, name: typo(content.lang, title), description: typo(content.lang, description), inLanguage: content.lang,
        isPartOf: { '@id': `${site}#website` }, about: { '@id': `${site}#software` }, dateModified: REVIEWED,
        // Each question links to its own answer on the page (the h3 id), so an answer can be cited exactly.
        mainEntity: questions.map(q => ({ '@type': 'Question', '@id': `${page}#${q.id}`, url: `${page}#${q.id}`, name: q.name, acceptedAnswer: { '@type': 'Answer', text: q.answer } })),
      },
      {
        '@type': 'BreadcrumbList', '@id': `${page}#breadcrumb`,
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'Pilovo', item: landing },
          { '@type': 'ListItem', position: 2, name: 'FAQ', item: page },
        ],
      },
    ],
  };
}

// JSON-LD data block: `<` escaped so no markup can close the script element.
export function ldScript(graph) {
  return `<script type="application/ld+json">${JSON.stringify(graph).replace(/</g, '\\u003c')}</script>`;
}
