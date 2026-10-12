// Regenerates the website's committed media derivatives under site/assets/ from local sources.
// Local only: never run by CI, by `npm run build:site` or by `npm run test:site`. Needs ffmpeg with
// libwebp, libx264 and libvpx-vp9, and the gitignored renders and generated illustrations listed in SOURCES.
// Every derivative is cropped and scaled only, never edited; metadata is stripped.
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { access, mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const mediaDir = path.join(root, 'site/assets/media');
const brandDir = path.join(root, 'site/assets/brand');
const strip = ['-map_metadata', '-1', '-fflags', '+bitexact', '-flags:v', '+bitexact'];

const TOUR = 'outputs/videos/pilovo-site-tour/renders';
const SCREENS = 'outputs/videos/pilovo-readme-tour/assets/screens';
const EXPLAINER = 'outputs/videos/pilovo-explainer/assets/generated';
const NEW = 'outputs/videos/pilovo-nouveautes/assets/generated';

const synthetic = 'Actual Pilovo interface rendered from the synthetic UI harness; synthetic local activity, not a real provider session.';
const generated = 'Flat brand illustration generated with ChatGPT from the Pilovo brand prompts (ink, olive, ivory, limestone; no text). Editorial image, not a product screenshot.';

// kind, id, source, crop [w, h, x, y] in source pixels or null, output widths, quality, preset.
// Captures are 2x renders (2880x1800): crops keep the UI near its own scale where the site shows them.
const SOURCES = [
  // Rows 2 and 3 of the sessions list: a row to review, then the open rename field on a working row.
  ...['en', 'fr'].map(lang => ({ kind: 'capture', id: `sessions-${lang}`, source: `${SCREENS}/${lang}/sessions.png`, released: false, crop: [896, 560, 360, 880], widths: [480, 720, 896] })),
  // The left column of the Activity settings block: automatic seen and system notifications.
  ...['en', 'fr'].map(lang => ({ kind: 'capture', id: `settings-${lang}`, source: `${SCREENS}/${lang}/settings.png`, released: false, crop: lang === 'en' ? [840, 525, 360, 328] : [840, 525, 360, 344], widths: [480, 720, 840] })),
  // Counters and the first three sessions rows after Mark as seen, without the right-hand actions.
  ...['en', 'fr'].map(lang => ({ kind: 'capture', id: `seen-${lang}`, source: `${SCREENS}/${lang}/seen.png`, released: false, crop: [1500, 1000, 360, 380], widths: [750, 1100, 1500] })),
  // The released 0.4.0 side panel, re-captured at device scale 2 (720x1800) from the v0.4.0 harness
  // (tests/ui/activity-flows.mjs at tag v0.4.0, same synthetic fixture and 360x900 viewport), so 2x screens get a sharp file.
  { kind: 'capture', id: 'states-en', source: 'outputs/site-captures/activity-360-dark-v0.4.0@2x.png', released: true, crop: null, widths: [360, 720], provenance: 'Actual Pilovo 0.4.0 interface, captured from the synthetic UI harness of tag v0.4.0 at device scale 2; synthetic local activity, not a real provider session.' },
  { kind: 'capture', id: 'states-fr', source: 'docs/media/screenshots/Pilovo_activity_desktop_synthetic.png', released: true, crop: null, widths: [640, 960, 1365] },
  { kind: 'illustration', id: 'illus-status-zone', source: `${EXPLAINER}/explainer-04-capteur.png`, crop: null, widths: [640, 960, 1280, 1672] },
  { kind: 'illustration', id: 'illus-never-requested', source: `${EXPLAINER}/explainer-07-navigateur.png`, crop: null, widths: [480, 720, 960] },
  { kind: 'illustration', id: 'illus-overview', source: `${EXPLAINER}/explainer-01-tour.png`, crop: null, widths: [480, 800, 1200] },
  { kind: 'illustration', id: 'illus-panel-layers', source: `${NEW}/nouveautes-01-eclatee.png`, crop: null, widths: [480, 720, 960] },
  { kind: 'illustration', id: 'illus-shortcuts', source: `${NEW}/nouveautes-02-touches.png`, crop: [1505, 941, 150, 0], widths: [480, 720, 960] },
  { kind: 'illustration', id: 'illus-notification', source: `${NEW}/nouveautes-07-notification.png`, crop: [1505, 941, 167, 0], widths: [480, 720, 960] },
];

function ffmpeg(args) {
  execFileSync('ffmpeg', ['-v', 'error', '-y', ...args], { cwd: root, stdio: ['ignore', 'inherit', 'inherit'] });
}
function probe(file) {
  const out = execFileSync('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height', '-of', 'csv=p=0', file], { cwd: root, encoding: 'utf8' }).trim();
  const [width, height] = out.split(',').map(Number);
  return { width, height };
}
async function describe(relative) {
  const absolute = path.join(root, relative);
  const bytes = await readFile(absolute);
  return { path: relative.replace(/^site\/assets\//, ''), ...probe(relative), bytes: (await stat(absolute)).size, sha256: createHash('sha256').update(bytes).digest('hex') };
}
async function need(relative) {
  try { await access(path.join(root, relative)); } catch { throw new Error(`Missing media source: ${relative}. Regenerate it locally before running site:media.`); }
}

await mkdir(mediaDir, { recursive: true });
await mkdir(brandDir, { recursive: true });
const assets = [];

for (const item of SOURCES) {
  await need(item.source);
  const files = [];
  for (const width of item.widths) {
    const out = `site/assets/media/${item.id}-${width}.webp`;
    const filters = [];
    if (item.crop) filters.push(`crop=${item.crop.join(':')}`);
    filters.push(`scale=${width}:-2:flags=lanczos`);
    const capture = item.kind === 'capture';
    ffmpeg(['-i', item.source, '-vf', filters.join(','), '-c:v', 'libwebp', '-compression_level', '6', '-preset', capture ? 'text' : 'drawing', '-quality', capture ? '85' : '80', ...strip, out]);
    files.push(await describe(out));
  }
  assets.push({ id: item.id, kind: item.kind, source: item.source, provenance: item.provenance || (item.kind === 'capture' ? synthetic : generated), ...(item.kind === 'capture' ? { released: item.released, synthetic: true } : {}), crop: item.crop ? { width: item.crop[0], height: item.crop[1], x: item.crop[2], y: item.crop[3] } : null, files });
}

// The tour is encoded at 1280x720, its render size: the hero shows it at up to about 690 CSS px, so a 2x
// screen still gets close to one source pixel per device pixel. H.264 MP4 for every browser, plus a VP9 WebM
// for Chromium builds without H.264. The poster is the frame the video starts on (#t=4).
const SIZE = 'scale=1280:720:flags=lanczos';
for (const lang of ['en', 'fr']) {
  const source = `${TOUR}/tour-${lang}.mp4`;
  await need(source);
  let crf = 28, video = `site/assets/media/tour-${lang}.mp4`;
  for (;;) {
    ffmpeg(['-i', source, '-vf', SIZE, '-c:v', 'libx264', '-profile:v', 'high', '-level', '4.0', '-pix_fmt', 'yuv420p', '-crf', String(crf), '-preset', 'slow', '-movflags', '+faststart', '-an', ...strip, video]);
    if ((await stat(path.join(root, video))).size <= 2 * 1024 * 1024 || crf >= 32) break;
    crf += 2;
  }
  const webm = `site/assets/media/tour-${lang}.webm`;
  ffmpeg(['-i', source, '-vf', SIZE, '-c:v', 'libvpx-vp9', '-b:v', '0', '-crf', '40', '-row-mt', '1', '-deadline', 'good', '-cpu-used', '1', '-pix_fmt', 'yuv420p', '-an', ...strip, webm]);
  assets.push({ id: `tour-${lang}`, kind: 'video', source, provenance: `20-second silent loop of the README tour, re-rendered for the website without the caption dash and the named-row frame, with sentence-case labels and no chapter numbers; H.264 CRF ${crf} and VP9 CRF 40 at 1280x720. ${synthetic} Unreleased screens are labeled in the video.`, released: false, synthetic: true, crop: null, files: [await describe(video), await describe(webm)] });
  const poster = `site/assets/media/tour-poster-${lang}.webp`;
  ffmpeg(['-ss', '4', '-i', source, '-frames:v', '1', '-vf', SIZE, '-c:v', 'libwebp', '-quality', '82', ...strip, poster]);
  assets.push({ id: `tour-poster-${lang}`, kind: 'poster', source: `${source} at 4.0 s`, provenance: 'Frame of the tour video showing the activity view and its synthetic-data footer.', released: false, synthetic: true, crop: null, files: [await describe(poster)] });
}

const icon = 'docs/media/pilovo-icon512.png';
ffmpeg(['-i', icon, '-vf', 'scale=32:32:flags=lanczos', ...strip, 'site/assets/brand/favicon-32.png']);
ffmpeg(['-f', 'lavfi', '-i', 'color=c=0xF6F4EE:s=180x180', '-i', icon, '-filter_complex', '[1:v]scale=180:180:flags=lanczos[i];[0:v][i]overlay=0:0:format=auto,format=rgb24', '-frames:v', '1', ...strip, 'site/assets/brand/apple-touch-icon.png']);
for (const [id, file, provenance] of [['favicon-32', 'site/assets/brand/favicon-32.png', 'Icon fallback scaled from pilovo-icon512.png.'], ['apple-touch-icon', 'site/assets/brand/apple-touch-icon.png', 'Touch icon rendered from pilovo-icon512.png on ivory #F6F4EE.']]) {
  assets.push({ id, kind: 'brand', source: icon, provenance, crop: null, files: [await describe(file)] });
}

await writeFile(path.join(mediaDir, 'media.json'), JSON.stringify({ note: 'Written by scripts/site-media.mjs. Dimensions are read by scripts/build-site.mjs; this file is not published.', assets }, null, 2) + '\n');
console.log(JSON.stringify({ assets: assets.length, files: assets.reduce((n, a) => n + a.files.length, 0) }));
