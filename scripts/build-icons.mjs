import { mkdir, writeFile } from 'node:fs/promises';
import { deflateSync } from 'node:zlib';

const olive = '#4B5D3A', ivory = '#F6F4EE', ink = '#20261F';
const outer = [[16,16],[80,16],[104,40],[104,56],[96,64],[112,80],[112,96],[96,112],[16,112]];
const counters = [[[40,40],[72,40],[72,56],[40,56]], [[40,80],[80,80],[80,96],[40,96]]];
const polygonPath = points => 'M' + points.map(point => point.join(' ')).join('L') + 'Z';
const markPath = [outer, ...counters].map(polygonPath).join('');
const mark = color => `<path fill="${color}" fill-rule="evenodd" d="${markPath}"/>`;
const svg = (width, height, title, body) => `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-labelledby="title"><title id="title">${title}</title>${body}</svg>\n`;

// Original outlined lettering. No font file, platform font, or external reference.
const letters = [
  [0, 'M0 0H14C24 0 28 5 28 13C28 18 25 21 21 22C27 23 30 27 30 33C30 42 24 46 15 46H0ZM6 5V20H14C19 20 22 17 22 13C22 8 19 5 14 5ZM6 25V41H15C21 41 24 38 24 33C24 28 21 25 15 25Z'],
  [37, 'M0 13H6V18C9 14 13 12 19 13V19C12 17 6 21 6 28V46H0Z'],
  [63, 'M0 13H6V46H0ZM0 0H6V6H0Z'],
  [80, 'M31 31H6C7 38 11 42 18 42C23 42 26 40 29 38V44C26 46 22 47 17 47C6 47 0 40 0 30C0 20 6 12 16 12C26 12 31 19 31 28ZM6 26H25C24 20 21 17 16 17C11 17 7 20 6 26Z'],
  [116, 'M6 46V19H0V13H6V9C6 1 11-3 18-3C21-3 23-2 25-1V5C23 4 21 3 19 3C14 3 12 5 12 10V13H22V19H12V46Z'],
  [145, 'M16 12C26 12 32 19 32 30C32 40 26 47 16 47C6 47 0 40 0 30C0 19 6 12 16 12ZM16 18C10 18 6 22 6 30C6 37 10 41 16 41C22 41 26 37 26 30C26 22 22 18 16 18Z'],
  [184, 'M23 46V42C20 45 16 47 11 47C4 47 0 43 0 36C0 29 6 25 16 25H23V24C23 20 20 18 15 18C10 18 6 20 3 22V16C7 13 11 12 16 12C25 12 29 17 29 25V46ZM23 30H16C9 30 6 32 6 36C6 40 8 42 12 42C18 42 23 38 23 33Z'],
  [222, 'M0-2H6V27L21 13H29L12 29L30 46H22L6 31V46H0Z'],
];
const wordmark = color => `<g fill="${color}" fill-rule="evenodd">${letters.map(([x, d]) => `<path transform="translate(${x} 0)" d="${d}"/>`).join('')}</g>`;
const lockup = (symbolColor, textColor) => `<g transform="scale(.75)">${mark(symbolColor)}</g><g transform="translate(104 25)">${wordmark(textColor)}</g>`;

await mkdir('public/icons', { recursive: true });
await mkdir('docs/media', { recursive: true });
await writeFile('public/icons/mark.svg', svg(128, 128, 'Briefoak', mark(olive)));
await writeFile('docs/media/briefoak-symbol.svg', svg(128, 128, 'Briefoak symbol', mark(olive)));
await writeFile('docs/media/briefoak-logo.svg', svg(376, 96, 'Briefoak', lockup(olive, ink)));
await writeFile('docs/media/briefoak-logo-light.svg', svg(376, 96, 'Briefoak', lockup(ivory, ivory)));

const crc = data => { let n = 0xffffffff; for (const byte of data) { n ^= byte; for (let i = 0; i < 8; i++) n = (n >>> 1) ^ (0xedb88320 & -(n & 1)); } return (n ^ 0xffffffff) >>> 0; };
function chunk(type, data) {
  const body = Buffer.concat([Buffer.from(type), data]);
  const size = Buffer.alloc(4); size.writeUInt32BE(data.length);
  const check = Buffer.alloc(4); check.writeUInt32BE(crc(body));
  return Buffer.concat([size, body, check]);
}
function inside(x, y, points) {
  let hit = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const [xi, yi] = points[i], [xj, yj] = points[j];
    if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) hit = !hit;
  }
  return hit;
}
function sample(x, y) {
  const qx = Math.abs(x - 64) - 32, qy = Math.abs(y - 64) - 32;
  if (Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) > 16) return [0, 0, 0, 0];
  const mx = (x - 16) / .75, my = (y - 16) / .75;
  return inside(mx, my, outer) && !counters.some(points => inside(mx, my, points)) ? [246,244,238,255] : [75,93,58,255];
}
for (const size of [16, 32, 48, 128, 512]) {
  const bytes = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const total = [0,0,0,0];
    for (let sy = 0; sy < 4; sy++) for (let sx = 0; sx < 4; sx++) {
      const color = sample((x + (sx + .5) / 4) / size * 128, (y + (sy + .5) / 4) / size * 128);
      for (let c = 0; c < 3; c++) total[c] += color[c] * color[3];
      total[3] += color[3];
    }
    const offset = y * (size * 4 + 1) + 1 + x * 4;
    for (let c = 0; c < 3; c++) bytes[offset + c] = total[3] ? Math.round(total[c] / total[3]) : 0;
    bytes[offset + 3] = Math.round(total[3] / 16);
  }
  const header = Buffer.alloc(13); header.writeUInt32BE(size, 0); header.writeUInt32BE(size, 4); header[8] = 8; header[9] = 6;
  const png = Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]), chunk('IHDR', header), chunk('IDAT', deflateSync(bytes)), chunk('IEND', Buffer.alloc(0))]);
  await writeFile(size === 512 ? 'docs/media/briefoak-icon512.png' : `public/icons/icon${size}.png`, png);
}
await writeFile('docs/media/briefoak-icon.svg', svg(128, 128, 'Briefoak app icon', `<rect x="16" y="16" width="96" height="96" rx="16" fill="${olive}"/><g transform="translate(16 16) scale(.75)">${mark(ivory)}</g>`));

const tiles = [
  ['briefoak-store-small', 440, 280, `<rect width="440" height="280" fill="${olive}"/><g transform="translate(32 92)">${lockup(ivory, ivory)}</g>`],
  ['briefoak-store-marquee', 1400, 560, `<rect width="1400" height="560" fill="${olive}"/><g transform="translate(230 160) scale(2.5)">${lockup(ivory, ivory)}</g>`],
  ['briefoak-social-preview', 1280, 640, `<rect width="1280" height="640" fill="${ivory}"/><g transform="translate(170 175) scale(2.5)">${lockup(olive, ink)}</g><text x="640" y="446" text-anchor="middle" font-family="Arial, sans-serif" font-size="28" fill="${olive}">A local prompt desk for Claude &amp; ChatGPT.</text>`],
];
for (const [name, width, height, body] of tiles) await writeFile(`docs/media/${name}.svg`, svg(width, height, 'Briefoak', body));

// Optional browser rasterization of native SVG media; no network or font download.
if (process.argv.includes('--media')) {
  const { chromium } = await import('playwright');
  const browser = await chromium.launch({ headless: true, ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : { channel: 'chrome' }) });
  try {
    for (const [name, width, height, body] of tiles) {
      const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 });
      await page.setContent(`<html><body style="margin:0">${svg(width, height, 'Briefoak', body)}</body></html>`);
      await page.screenshot({ path: `docs/media/${name}.png`, omitBackground: true });
      await page.close();
    }
  } finally { await browser.close(); }
}
console.log('Briefoak: vector logos, 16/32/48/128/512 PNG icons, and promotional SVGs generated.');
