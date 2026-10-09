# Briefoak

A local prompt desk for Claude & ChatGPT.

Briefoak helps people prepare prompts, open the chosen service, and record their own follow-through. The brand should feel clear, grounded, and useful. Product copy must preserve that human role and must not imply conversation access or automatic execution.

## Color

| Role | Name | Value |
| --- | --- | --- |
| Text and wordmark | Ink | `#20261F` |
| Brand and primary actions | Olive | `#4B5D3A` |
| Light surface and reversed logo | Warm ivory | `#F6F4EE` |
| Quiet supporting surface | Limestone | `#D9DDCF` |

Use the olive symbol and ink wordmark on ivory or white. Use the ivory logo on olive or ink. Keep brand assets flat: no gradients, shadows, glow, or added outlines.

## Symbol and geometry

Two stacked brief shapes share a firm vertical spine to form a B. The angled right edge suggests folded paper; the broad base supplies the grounded character of the name without a tree or leaf illustration.

The master is a 128 × 128 unit grid. The visible symbol spans `(16,16)` to `(112,112)`. Its outside vertices are `(16,16) (80,16) (104,40) (104,56) (96,64) (112,80) (112,96) (96,112) (16,112)`. The upper counter is `(40,40)` to `(72,56)`; the lower counter is `(40,80)` to `(80,96)`. The single path uses even-odd fill. Preserve these proportions and the asymmetry between the two counters.

`public/icons/mark.svg` is the transparent olive interface asset. `briefoak-symbol.svg` is the matching master. Keep at least 16 master units of clear space around the visible symbol. Minimum standalone size: 16 × 16 px; 24 px or larger is preferred in product headers.

The app icon uses an olive 96 × 96 tile at `(16,16)`, radius 16. Its ivory symbol is scaled to 75% and translated by `(16,16)`. The outer transparent margin is 16 px at 128 px. Use the supplied 16, 32, 48, and 128 px PNGs at their native sizes. The 512 px PNG is for larger previews.

## Wordmark and type

The wordmark is original custom vector lettering, not a typeset font. Every letter is a local SVG path, so the mark has no font dependency and distributes no third-party font. Its eight glyph origins are `0, 37, 63, 80, 116, 145, 184, 222` on a 46-unit cap-height grid. The exact outlines are defined in `scripts/build-icons.mjs`.

The horizontal lockup has a 376 × 96 viewBox: symbol at 75% scale; lettering translated to `(104,25)`. Use `briefoak-logo.svg` on light surfaces and `briefoak-logo-light.svg` on dark surfaces. Minimum lockup width: 160 px. Keep 16 viewBox units of clear space outside its bounds. Do not retype, stretch, rotate, rearrange, or add effects to the wordmark.

Product text uses the existing system sans-serif stack. The social-preview tagline uses `Arial, sans-serif`, 28 px, regular, with no font embedded or bundled. The checked PNG is the fixed rendering for sharing; an SVG viewer may use its installed fallback for that tagline only.

## Files and reproduction

| File | Use |
| --- | --- |
| `briefoak-logo.svg` / `briefoak-logo-light.svg` | Horizontal logos, transparent |
| `briefoak-symbol.svg` | Transparent symbol master |
| `briefoak-icon.svg` / `briefoak-icon512.png` | App icon master and large raster |
| `briefoak-store-small.svg` / `.png` | 440 × 280 Chrome Web Store small tile |
| `briefoak-store-marquee.svg` / `.png` | 1400 × 560 Chrome Web Store marquee |
| `briefoak-social-preview.svg` / `.png` | 1280 × 640 GitHub social preview |
| `briefoak-github-banner.png` | Separate editorial README banner; see `BANNER_PROMPT.md` |

From `extension/`, run `node scripts/build-icons.mjs` to regenerate the vector assets and icon PNGs. Run `node scripts/build-icons.mjs --media` to also rasterize the three native promotional SVGs using the existing Playwright dependency and installed Chrome; `CHROME_PATH` can select a browser executable. No network resources are loaded. The generator never alters the editorial banner or its provenance file.

The brand-kit copy includes the native sources, rendered assets, application icons, this guide, and the separate editorial banner with its recorded provenance. The native symbol and custom lettering are the authoritative identity.
