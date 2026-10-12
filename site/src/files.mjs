// sitemap.xml, robots.txt, llms.txt and third-party-notices.txt.
// On the project Pages site (https://alebgl77.github.io/pilovo/) these files sit under /pilovo/, not at the
// host root: crawlers do not read that robots.txt, and search engines take the site name and favicon from
// the host root. Owner follow-ups: submit the sitemap in Google Search Console and Bing Webmaster Tools as a
// URL-prefix property; robots.txt, the site name and the favicon apply once a custom domain is set (SITE_URL).
import { BLOB, LANGS, PAGES, RAW, RELEASE, REPO, REVIEWED } from './config.mjs';
import { escapeHtml } from './html.mjs';

export function sitemap(site) {
  const urls = [];
  for (const key of ['landing', 'faq']) {
    for (const lang of LANGS) {
      const alternates = [...LANGS.map(l => [l, `${site}${PAGES[key][l]}`]), ['x-default', `${site}${PAGES[key].en}`]];
      urls.push(`  <url>
    <loc>${escapeHtml(`${site}${PAGES[key][lang]}`)}</loc>
    <lastmod>${REVIEWED}</lastmod>
${alternates.map(([hreflang, href]) => `    <xhtml:link rel="alternate" hreflang="${hreflang}" href="${escapeHtml(href)}"/>`).join('\n')}
  </url>`);
    }
  }
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">
${urls.join('\n')}
</urlset>
`;
}

export const AI_AGENTS = ['GPTBot', 'OAI-SearchBot', 'ChatGPT-User', 'ClaudeBot', 'Claude-SearchBot', 'Claude-User', 'PerplexityBot', 'Perplexity-User', 'Google-Extended', 'Applebot-Extended', 'CCBot'];

export function robots(site) {
  return `# All crawlers, including AI search and answer engines, may read this site.
User-agent: *
Allow: /

${AI_AGENTS.map(agent => `User-agent: ${agent}`).join('\n')}
Allow: /

Sitemap: ${site}sitemap.xml
`;
}

// llmstxt.org format: an H1, a "> " summary, free text before the first H2, then H2 sections that hold
// only "- [title](url): notes" items (scripts/site.test.mjs checks that grammar).
export function llms(site) {
  return `# Pilovo

> Pilovo is an open-source Chrome extension (Manifest V3, MIT license) that shows whether the ChatGPT and Claude web tabs you authorize are working, have a response ready, need your attention or cannot be confirmed, in Chrome's side panel and on its toolbar badge. Version ${RELEASE.version} Preview is a GitHub prerelease installed manually with Load unpacked; it is not on the Chrome Web Store.

Key facts (last reviewed ${REVIEWED}):
- Free core under the MIT license; no Pilovo account, API key, backend or telemetry.
- Reads a limited set of status indicators locally, on sites the user allows one at a time; does not collect prompts, responses or tab titles.
- Required permissions: storage, sidePanel, alarms, scripting. Optional, one site at a time: https://chatgpt.com/*, https://claude.ai/*.
- Chrome 120 or later, chatgpt.com and claude.ai web tabs only; desktop and mobile apps are not observed.
- "Response available" means generation ended as observed in the page, not that the task succeeded. "Seen" is a local acknowledgment.
- Unknown ("Observation interrupted") means evidence is missing, expired after 15 seconds, inaccessible or not recognized.
- Independent project, not affiliated with or endorsed by the companies that operate ChatGPT or Claude.
- Unreleased (build from source): keyboard shortcuts, mark all as seen, elapsed durations, badge colors, stable session numbers, positions and names, automatic seen, optional system notifications.

Documentation links point to plain Markdown sources on the repository's main branch.

## Website
- [Pilovo in English](${site}): states, privacy, permissions, installation, FAQ
- [Pilovo en français](${site}${PAGES.landing.fr})
- [FAQ](${site}${PAGES.faq.en})
- [FAQ en français](${site}${PAGES.faq.fr})

## Documentation
- [README](${RAW}README.md): overview, states, permissions, installation and the main questions
- [FAQ](${RAW}docs/faq.md): every question, including privacy, compatibility and troubleshooting
- [Installation guide](${RAW}docs/installation.md): installing the prerelease, updating and building from source
- [Privacy notice](${RAW}docs/privacy.md)
- [Compatibility record](${RAW}docs/compatibility.md)
- [Changelog](${RAW}CHANGELOG.md)
- [v${RELEASE.version} prerelease](${RELEASE.tagUrl}): downloads and checksums
- [README en français](${RAW}docs/README.fr.md): présentation, états, permissions, installation et questions principales
- [FAQ en français](${RAW}docs/faq.fr.md): toutes les questions, dont la confidentialité, la compatibilité et le dépannage
- [Guide d'installation](${RAW}docs/installation.fr.md): installer la préversion, la mettre à jour, compiler les sources

## Optional
- [Technical contract](${RAW}docs/core-contract.md)
- [Source code](${REPO})
`;
}

export function notices({ fontVersion, fontLicense, lucideVersion, lucideLicense }) {
  return `Third-party notices for the Pilovo website

================================================================
Montserrat Variable (font), via @fontsource-variable/montserrat ${fontVersion}, files montserrat-latin-wght-normal.woff2 and montserrat-latin-ext-wght-normal.woff2: SIL Open Font License 1.1
================================================================

${fontLicense.trim()}

================================================================
Lucide icons, via lucide-react ${lucideVersion}, rendered to inline SVG at build time: ISC License
================================================================

${lucideLicense.trim()}

================================================================

Pilovo itself is under the MIT license: ${BLOB}LICENSE
`;
}
