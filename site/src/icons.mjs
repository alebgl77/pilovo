// Lucide icons (a project dependency; DESIGN.md: the extension UI uses Lucide) rendered once to static
// inline SVG at build time. No icon path is drawn by hand and no React runs on the page.
import * as Icons from 'lucide-react';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { raw } from './html.mjs';

export const STROKE = 1.75;
const cache = new Map();

export function icon(name, size = 20, className = 'icon') {
  const key = `${name}:${size}:${className}`;
  if (!cache.has(key)) {
    const component = Icons[name];
    if (!component || name === 'icons' || name === 'createLucideIcon') throw new Error(`Unknown Lucide icon: ${name}`);
    cache.set(key, renderToStaticMarkup(createElement(component, { size, strokeWidth: STROKE, 'aria-hidden': 'true', focusable: 'false', className })));
  }
  return raw(cache.get(key));
}
