// Responsive images from the committed derivatives listed in site/assets/media/media.json.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { attrs, html } from './html.mjs';
import { rel } from './links.mjs';

export function loadMedia(repoRoot) {
  const data = JSON.parse(readFileSync(path.join(repoRoot, 'site/assets/media/media.json'), 'utf8'));
  const byId = new Map(data.assets.map(asset => [asset.id, asset]));
  const get = id => {
    const asset = byId.get(id);
    if (!asset) throw new Error(`Unknown media asset: ${id}`);
    return asset;
  };
  return { assets: data.assets, get };
}

// Files sorted by width, as { path (site path), width, height }.
export function variants(asset) {
  return asset.files.map(file => ({ path: `assets/${file.path}`, width: file.width, height: file.height })).sort((a, b) => a.width - b.width);
}

/**
 * <img> with srcset, intrinsic width/height of the largest file and lazy loading unless told otherwise.
 * options: { id, alt, sizes, fromDir, loading = 'lazy', priority, className, used }
 */
export function img(media, { id, alt, sizes, fromDir, loading = 'lazy', priority = false, className, used }) {
  if (!alt || !alt.trim()) throw new Error(`Image ${id} needs alt text.`);
  const asset = media.get(id);
  const files = variants(asset);
  const largest = files[files.length - 1];
  for (const file of files) used?.add(file.path);
  const srcset = files.length > 1 ? files.map(file => `${rel(fromDir, file.path)} ${file.width}w`).join(', ') : null;
  return html`<img${attrs({
    src: rel(fromDir, largest.path),
    srcset,
    sizes: files.length > 1 ? sizes : null,
    width: largest.width,
    height: largest.height,
    alt,
    loading,
    decoding: 'async',
    fetchpriority: priority ? 'high' : null,
    class: className,
  })}>`;
}
