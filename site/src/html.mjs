// Minimal HTML templating: interpolations are escaped unless wrapped in raw(); attributes are always double-quoted.
export class Raw {
  constructor(value) { this.value = String(value); }
  toString() { return this.value; }
}
export const raw = value => (value instanceof Raw ? value : new Raw(value));

export function escapeHtml(value) {
  return String(value).replace(/[&<>"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[ch]);
}

function render(value) {
  if (value === null || value === undefined || value === false) return '';
  if (value instanceof Raw) return value.value;
  if (Array.isArray(value)) return value.map(render).join('');
  return escapeHtml(value);
}

export function html(strings, ...values) {
  let out = strings[0];
  for (let i = 0; i < values.length; i++) out += render(values[i]) + strings[i + 1];
  return new Raw(out);
}

// attrs({ href: 'x', hidden: true, title: null }) -> ' href="x" hidden'
export function attrs(map) {
  let out = '';
  for (const [name, value] of Object.entries(map)) {
    if (value === null || value === undefined || value === false) continue;
    if (name === 'style' || /^on/i.test(name)) throw new Error(`Attribute not allowed by the site CSP: ${name}`);
    out += value === true ? ` ${name}` : ` ${name}="${escapeHtml(value)}"`;
  }
  return new Raw(out);
}

export const join = (items, separator = '') => new Raw(items.map(render).join(render(separator)));
