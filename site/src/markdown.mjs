// Markdown subset used by the README and FAQ sources: ATX headings, paragraphs and GFM pipe tables,
// with code spans, links, strong and emphasis inline. Lists, block quotes, fences, raw HTML and images
// are parsed only so that rendering them throws: documentation drift then fails the build loudly.
import { escapeHtml, raw } from './html.mjs';
import { keepInversions, typo } from './typography.mjs';

export function parse(md) {
  const lines = md.replace(/\r\n?/g, '\n').split('\n');
  const blocks = [];
  let i = 0;
  const startsBlock = line => /^#{1,6}\s/.test(line) || /^```/.test(line) || /^\s*([-*+]|\d+\.)\s/.test(line) || /^\s*>/.test(line) || /^\s*</.test(line) || /^\s*\|/.test(line) || /^!\[/.test(line);
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) { i++; continue; }
    const heading = /^(#{1,6})\s+(.*?)\s*#*\s*$/.exec(line);
    if (heading) { blocks.push({ type: 'heading', level: heading[1].length, text: heading[2], line: i + 1 }); i++; continue; }
    if (/^```/.test(line)) {
      const start = i++;
      while (i < lines.length && !/^```/.test(lines[i])) i++;
      i++;
      blocks.push({ type: 'unsupported', kind: 'fenced code', line: start + 1 });
      continue;
    }
    if (/^\s*\|/.test(line)) {
      const rows = [];
      const start = i;
      while (i < lines.length && /^\s*\|/.test(lines[i])) rows.push(lines[i++]);
      blocks.push(table(rows, start + 1));
      continue;
    }
    const kind = /^\s*([-*+]|\d+\.)\s/.test(line) ? 'list' : /^\s*>/.test(line) ? 'block quote' : /^\s*</.test(line) ? 'raw HTML' : /^!\[/.test(line) ? 'image' : null;
    const start = i;
    const text = [line];
    i++;
    while (i < lines.length && lines[i].trim() && (kind ? !/^#{1,6}\s/.test(lines[i]) : !startsBlock(lines[i]))) text.push(lines[i++]);
    blocks.push(kind ? { type: 'unsupported', kind, line: start + 1 } : { type: 'paragraph', text: text.map(part => part.trim()).join(' '), line: start + 1 });
  }
  return blocks;
}

function splitRow(row) {
  const cells = [];
  let current = '';
  const body = row.trim().replace(/^\|/, '').replace(/\|$/, '');
  for (let i = 0; i < body.length; i++) {
    if (body[i] === '\\' && body[i + 1] === '|') { current += '|'; i++; continue; }
    if (body[i] === '|') { cells.push(current.trim()); current = ''; continue; }
    current += body[i];
  }
  cells.push(current.trim());
  return cells;
}
function table(rows, line) {
  if (rows.length < 2 || !/^\s*\|?\s*:?-{3,}/.test(rows[1])) throw new Error(`Malformed table at line ${line}.`);
  return { type: 'table', header: splitRow(rows[0]), rows: rows.slice(2).map(splitRow), line };
}

export function assertSupported(blocks, label) {
  for (const block of blocks) if (block.type === 'unsupported') throw new Error(`Unsupported Markdown (${block.kind}) at line ${block.line} in ${label}.`);
  return blocks;
}

// Blocks after the heading with this exact text, up to the next heading of the same or a higher level.
export function section(blocks, text, level) {
  const index = blocks.findIndex(block => block.type === 'heading' && block.text === text && (!level || block.level === level));
  if (index < 0) throw new Error(`Heading not found: ${text}`);
  const own = blocks[index].level;
  const out = [];
  for (let i = index + 1; i < blocks.length; i++) {
    if (blocks[i].type === 'heading' && blocks[i].level <= own) break;
    out.push(blocks[i]);
  }
  return out;
}

const INLINE = /`([^`]+)`|!\[|\[\[([^\]]+)\]\]|\[([^\]]+)\]\(([^)\s]+)\)|\*\*(.+?)\*\*|(?<![\p{L}\p{N}*])\*(?!\s)(.+?)(?<!\s)\*(?![\p{L}\p{N}*])|(?<![\p{L}\p{N}_])_(?!\s)(.+?)(?<!\s)_(?![\p{L}\p{N}_])/gu;

// Inline Markdown to HTML. ctx: { lang, link(href) -> { href, external }, kbd: allow [[Key]] }.
export function inline(text, ctx) {
  let out = '';
  let last = 0;
  const plain = segment => {
    if (/<[a-zA-Z/!?]/.test(segment)) throw new Error(`Raw HTML in Markdown text: ${segment}`);
    return keepInversions(ctx.lang, escapeHtml(typo(ctx.lang, segment)));
  };
  for (const match of String(text).matchAll(INLINE)) {
    out += plain(text.slice(last, match.index));
    last = match.index + match[0].length;
    const [whole, code, kbd, label, href, strong, em, em2] = match;
    if (code !== undefined) out += `<code>${escapeHtml(code)}</code>`;
    else if (whole === '![') throw new Error(`Image in Markdown text: ${text}`);
    else if (kbd !== undefined) {
      if (!ctx.kbd) throw new Error(`Unexpected [[ ]] in Markdown text: ${text}`);
      out += `<kbd>${escapeHtml(kbd)}</kbd>`;
    } else if (label !== undefined) {
      const target = ctx.link ? ctx.link(href) : { href };
      out += `<a href="${escapeHtml(target.href)}">${inline(label, ctx)}</a>`;
    } else if (strong !== undefined) out += `<strong>${inline(strong, ctx)}</strong>`;
    else out += `<em>${inline(em ?? em2, ctx)}</em>`;
  }
  out += plain(text.slice(last));
  return raw(out);
}

// Plain text of inline Markdown (code, link labels and emphasis reduced to their text), typography applied.
export function toPlain(text, lang) {
  return typo(lang, stripInline(text));
}
export function stripInline(text) {
  return String(text)
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\[\[([^\]]+)\]\]/g, '$1')
    .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, '$1')
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/(?<![\p{L}\p{N}*])\*(?!\s)(.+?)(?<!\s)\*(?![\p{L}\p{N}*])/gu, '$1')
    .replace(/(?<![\p{L}\p{N}_])_(?!\s)(.+?)(?<!\s)_(?![\p{L}\p{N}_])/gu, '$1');
}

// GitHub heading anchors: lower case, drop everything but letters, marks, numbers, connector punctuation,
// spaces and hyphens, spaces to hyphens; repeated slugs get -1, -2 through the shared `seen` map.
export function slug(text, seen) {
  const base = stripInline(text).toLowerCase().replace(/[^\p{L}\p{M}\p{N}\p{Pc} -]/gu, '').replace(/ /g, '-');
  if (!seen) return base;
  let candidate = base;
  for (let n = 1; seen.has(candidate); n++) candidate = `${base}-${n}`;
  seen.add(candidate);
  return candidate;
}

export function headingSlugs(md) {
  const seen = new Set();
  return parse(md).filter(block => block.type === 'heading').map(block => slug(block.text, seen));
}
