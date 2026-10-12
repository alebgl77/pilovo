// Typography for text nodes and human-readable attributes only (never code, URLs or identifiers).
export const NBSP = ' ';
const DASHES = /[‒-―]/u;

export function typo(lang, text) {
  let out = String(text);
  if (lang === 'fr') {
    out = out.replace(/"([^"\n]*)"/g, `«${NBSP}$1${NBSP}»`);
    out = out.replace(/[ \t  ]+([:;?!»])/g, `${NBSP}$1`);
    out = out.replace(/«[ \t  ]+/g, `«${NBSP}`);
    out = out.replace(/(\d)[ \t]+(secondes|caractères|jours|min|s)(?![\p{L}\p{N}])/gu, `$1${NBSP}$2`);
  } else {
    out = out.replace(/"([^"\n]*)"/g, '“$1”');
  }
  // Both languages: a middle dot stays with the word before it, and "session 2" stays on one line.
  out = out.replace(/ · /g, `${NBSP}· `);
  out = out.replace(/\bsession (\d)/g, `session${NBSP}$1`);
  return out;
}

// French verb-subject inversions ("affiche-t-il", "peut-on") must not break at their hyphens. Applied to
// already escaped HTML text (never inside a tag or attribute): wraps each inversion in a no-wrap span.
const INVERSION = /(?<![\p{L}\p{N}-])([\p{L}]+(?:-t)?-(?:il|elle|on|ils|elles))(?![\p{L}\p{N}-])/gu;
export function keepInversions(lang, escapedHtml) {
  return lang === 'fr' ? escapedHtml.replace(INVERSION, '<span class="nowrap">$1</span>') : escapedHtml;
}

// Build guard: no figure, en or em dash, nor horizontal bar, may reach any published text.
export function assertNoDash(label, text) {
  const match = DASHES.exec(String(text));
  if (match) {
    const start = Math.max(0, match.index - 40);
    throw new Error(`Dash U+${match[0].codePointAt(0).toString(16).toUpperCase()} in ${label}: ${JSON.stringify(String(text).slice(start, match.index + 40))}`);
  }
}
