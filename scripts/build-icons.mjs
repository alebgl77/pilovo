import { mkdir, writeFile } from 'node:fs/promises';
import { deflateSync } from 'node:zlib';

const olive = '#4B5D3A', ivory = '#F6F4EE', ink = '#20261F', limestone = '#D9DDCF';
const markPath = 'M24 16H68A36 36 0 0 1 68 88H46V112H24ZM68 38A14 14 0 1 0 68 66A14 14 0 1 0 68 38Z';
const mark = color => `<path fill="${color}" fill-rule="evenodd" d="${markPath}"/><circle cx="96" cy="100" r="10" fill="${color}"/>`;
const svg = (width, height, title, body) => `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-labelledby="title"><title id="title">${title}</title>${body}</svg>\n`;

// Original outlined lettering. No font file, platform font, or external reference.
const letters = [
  [0, 'M0 0H15C26 0 32 6 32 15C32 25 26 30 15 30H7V46H0ZM7 6V24H15C22 24 25 21 25 15C25 9 22 6 15 6Z'],
  [40, 'M0 13H6V46H0ZM0 0H6V6H0Z'],
  [56, 'M0-2H6V46H0Z'],
  [72, 'M16 12C26 12 32 19 32 30C32 40 26 47 16 47C6 47 0 40 0 30C0 19 6 12 16 12ZM16 18C10 18 6 22 6 30C6 37 10 41 16 41C22 41 26 37 26 30C26 22 22 18 16 18Z'],
  [110, 'M0 13H7L17 38L27 13H34L20 46H14Z'],
  [150, 'M16 12C26 12 32 19 32 30C32 40 26 47 16 47C6 47 0 40 0 30C0 19 6 12 16 12ZM16 18C10 18 6 22 6 30C6 37 10 41 16 41C22 41 26 37 26 30C26 22 22 18 16 18Z'],
];
const wordmark = color => `<g fill="${color}" fill-rule="evenodd">${letters.map(([x, d]) => `<path transform="translate(${x} 0)" d="${d}"/>`).join('')}</g>`;
const lockup = (symbolColor, textColor) => `<g transform="scale(.75)">${mark(symbolColor)}</g><g transform="translate(104 25)">${wordmark(textColor)}</g>`;

await mkdir('public/icons', { recursive: true });
await mkdir('docs/media', { recursive: true });
await writeFile('public/icons/mark.svg', svg(128, 128, 'Pilovo', mark(olive)));
await writeFile('docs/media/pilovo-symbol.svg', svg(128, 128, 'Pilovo symbol', mark(olive)));
await writeFile('docs/media/pilovo-logo.svg', svg(304, 96, 'Pilovo', lockup(olive, ink)));
await writeFile('docs/media/pilovo-logo-light.svg', svg(304, 96, 'Pilovo', lockup(ivory, ivory)));

const crc = data => { let n = 0xffffffff; for (const byte of data) { n ^= byte; for (let i = 0; i < 8; i++) n = (n >>> 1) ^ (0xedb88320 & -(n & 1)); } return (n ^ 0xffffffff) >>> 0; };
function chunk(type, data) {
  const body = Buffer.concat([Buffer.from(type), data]);
  const size = Buffer.alloc(4); size.writeUInt32BE(data.length);
  const check = Buffer.alloc(4); check.writeUInt32BE(crc(body));
  return Buffer.concat([size, body, check]);
}
function sample(x, y) {
  const qx = Math.abs(x - 64) - 32, qy = Math.abs(y - 64) - 32;
  if (Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) > 16) return [0, 0, 0, 0];
  const mx = (x - 16) / .75, my = (y - 16) / .75;
  const bowl = (mx >= 24 && mx <= 68 && my >= 16 && my <= 88) || Math.hypot(mx - 68, my - 52) <= 36;
  const stem = mx >= 24 && mx <= 46 && my >= 16 && my <= 112;
  const counter = Math.hypot(mx - 68, my - 52) < 14;
  const point = Math.hypot(mx - 96, my - 100) <= 10;
  return ((bowl || stem) && !counter) || point ? [246,244,238,255] : [75,93,58,255];
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
  await writeFile(size === 512 ? 'docs/media/pilovo-icon512.png' : `public/icons/icon${size}.png`, png);
}
await writeFile('docs/media/pilovo-icon.svg', svg(128, 128, 'Pilovo app icon', `<rect x="16" y="16" width="96" height="96" rx="16" fill="${olive}"/><g transform="translate(16 16) scale(.75)">${mark(ivory)}</g>`));

const label = (x, y, size, color, text) => `<text x="${x}" y="${y}" font-family="Arial, sans-serif" font-size="${size}" fill="${color}">${text}</text>`;
const activityRows = `<path d="M40 40V288" stroke="${limestone}" stroke-width="2"/>${[40, 164, 288].map((y, i) => `<circle cx="40" cy="${y}" r="${i === 1 ? 12 : 8}" fill="${i === 2 ? limestone : olive}"/><path d="M78 ${y - 9}H${i === 1 ? 300 : 248}M78 ${y + 13}H${i === 0 ? 204 : 160}" stroke="${i === 2 ? limestone : olive}" stroke-width="5" stroke-linecap="round"/>`).join('')}`;
const banner = `<rect width="1280" height="640" fill="${ivory}"/><g transform="translate(72 108) scale(2)">${lockup(olive, ink)}</g>${label(96, 356, 40, ink, 'Keep your AI in view.')}${label(96, 410, 25, olive, 'AI activity for Chrome')}<path d="M96 471H665" stroke="${limestone}"/>${label(96, 519, 20, olive, 'ChatGPT + Claude · Preview')}<g transform="translate(840 168)">${activityRows}</g>`;
const tiles = [
  ['pilovo-store-small', 440, 280, `<rect width="440" height="280" fill="${olive}"/><g transform="translate(48 48)">${lockup(ivory, ivory)}</g>${label(64, 180, 24, ivory, 'Keep your AI in view.')}${label(64, 220, 16, ivory, 'AI activity for Chrome · Preview')}`],
  ['pilovo-store-marquee', 1400, 560, `<rect width="1400" height="560" fill="${olive}"/><g transform="translate(108 115) scale(2.5)">${lockup(ivory, ivory)}</g>${label(144, 410, 40, ivory, 'Keep your AI in view.')}${label(950, 376, 25, ivory, 'AI activity for Chrome')}${label(950, 421, 21, ivory, 'Preview')}`],
  ['pilovo-social-preview', 1280, 640, banner],
  ['pilovo-github-banner', 1280, 640, banner],
];
for (const [name, width, height, body] of tiles) await writeFile(`docs/media/${name}.svg`, svg(width, height, 'Pilovo — Preview', body));

// Optional browser rasterization of native SVG media; no network or font download.
if (process.argv.includes('--media')) {
  const { chromium } = await import('playwright');
  const browser = await chromium.launch({ headless: true, ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : { channel: 'chrome' }) });
  try {
    for (const [name, width, height, body] of tiles) {
      const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 });
      await page.setContent(`<html><body style="margin:0">${svg(width, height, 'Pilovo — Preview', body)}</body></html>`);
      await page.screenshot({ path: `docs/media/${name}.png`, omitBackground: true });
      await page.close();
    }
  } finally { await browser.close(); }
}
console.log('Pilovo: vector logos, 16/32/48/128/512 PNG icons, and preview SVGs generated.');
