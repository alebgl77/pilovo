# Pilovo

**Keep your AI in view.** Descriptor: **AI activity for Chrome**. Distribution label: **Preview**.

Pilovo's identity belongs to the activity pilot, not the historical Briefoak releases. Product copy describes bounded UI-status observation, local metadata, optional access per provider, and visible unknown states. It must not imply task verification, universal agent coverage or unsupported commands.

## Palette

| Role | Color | Value |
| --- | --- | --- |
| Text and wordmark | Ink | `#20261F` |
| Brand and primary actions | Olive | `#4B5D3A` |
| Light surface and reversed logo | Ivory | `#F6F4EE` |
| Supporting lines | Limestone | `#D9DDCF` |

Use olive/ink on ivory or white, ivory on olive/ink. Flat fills; no glow, gradients, shadows or provider logos.

## Native symbol and wordmark

A P with a round counter and separate round activity point. Master grid 128 × 128; stem begins at (24,16), circular bowl centered (68,52), radius 36; counter radius 14; point centered (96,100), radius 10. The point is part of the identity, not a live status indicator. The P is neither a book nor a B.

`public/icons/mark.svg` retains the UI import path. `pilovo-symbol.svg` is the matching olive master. The icon uses an olive 96 × 96 rounded tile at (16,16), with the ivory symbol at 75% scale translated (16,16). Native PNGs: 16/32/48/128; large preview: 512. Keep supplied proportions.

The six Pilovo glyphs are original local SVG paths defined in `scripts/build-icons.mjs`. No font file or remote font is bundled. The horizontal lockup is 304 × 96; minimum recommended width 152 px. Clear space: 16 master units. Do not stretch or retype the wordmark.

## Assets and reproduction

| Files | Purpose |
| --- | --- |
| `pilovo-logo.svg`, `pilovo-logo-light.svg` | Light/dark horizontal lockup |
| `pilovo-symbol.svg`, `pilovo-icon.svg`, `pilovo-icon512.png` | Symbol and app icon |
| `pilovo-store-small.svg/png` | 440 × 280 proposed store tile |
| `pilovo-store-marquee.svg/png` | 1400 × 560 proposed marquee |
| `pilovo-social-preview.svg/png` | 1280 × 640 social preview |
| `pilovo-github-banner.svg/png` | 1280 × 640 README banner |
| `pilovo-tour-en.gif`, `pilovo-tour-fr.gif` | 800 × 450, 20 s looping README tour of the actual UI with synthetic data |

Run `node scripts/build-icons.mjs` for SVGs and analytic icon PNG rendering. Add `--media` to render native SVG tiles with installed Chrome via Playwright; `CHROME_PATH` can select the executable. All content is local. Auxiliary text uses Arial/system fallback; wordmark outlines are platform independent.

The banner's abstract activity rows are editorial shapes, not a product screenshot, user count or measured metric. All promotional tiles visibly say Preview. UI screenshots must separately disclose synthetic data. The README tours are captures of the synthetic UI harnesses, animated outside this repository; each UI frame carries a synthetic-data footer and unreleased screens carry an UNRELEASED / NON PUBLIÉ label.

Old `briefoak-*` files and [banner provenance](BANNER_PROMPT.md) remain historical references. They are not Pilovo assets and must not be relabeled or used for the current README. Old release archives stay unchanged.