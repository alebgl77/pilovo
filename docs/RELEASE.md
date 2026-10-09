# Release checks — Briefoak 0.3.0

This is an early unpacked extension release. No Chrome Web Store publication, production certification, provider endorsement or real agent execution is claimed.

## Reproduce the build

Use Node.js 22.12+ (GitHub CI uses Node 22), npm and Git for the publication regression fixture. Run from the repository root:

```sh
npm ci
npm run typecheck
npm test
npm run test:publication
npm run check:publication
npm run build
npm run package:check
```

After reviewing the exact build and documentation, create delivery artifacts:

```sh
npm run package
```

The command creates `release/v0.3.0/` containing:

- `Briefoak_Chrome_v0.3.0.zip`: built extension with manifest at archive root and dependency notices; no companion.
- `Briefoak_Source_v0.3.0.zip`: self-contained repository root, including source, tests, scripts, configs, documentation and lockfile; no installed dependencies/build/profile data.
- `Briefoak_SHA256_v0.3.0.json`.
- `Briefoak_THIRD_PARTY_NOTICES_v0.3.0.md`.

ZIP creation uses Node's standard library, fixed ZIP timestamps and sorted paths. No Python or files outside this repository are required. Install instructions live in this repository; the runtime archive contains only the extension and dependency notices. Checksums identify bytes; they do not establish publisher authenticity.

The publisher uses a per-version lock and an atomic directory rename. An existing release is never replaced. A crashed process can leave a lock/staging directory: inspect it and remove only the confirmed abandoned directory before retrying. Keep older reviewed releases unchanged.

## Publication boundaries

`npm run check:publication` inspects an explicit file allowlist, common secret signatures and local Markdown links. `node scripts/check-publication.mjs --list` prints the allowlist inventory. After staging Git changes, `node scripts/check-publication.mjs --staged` scans index bytes and rejects staged files outside the allowlist.

`node scripts/check-publication.mjs --tracked` checks every tracked index file and rejects forbidden paths even if force-added. CI uses this mode. These checks do not prove the absence of every secret. Review the actual staged diff and images. Excluded files include profiles, test results, work/output directories, builds, installed packages, environment files, keys and orchestration state. Runtime source identifiers with the former product name are intentionally retained for compatibility.

`package:check` verifies package/lock/manifest version alignment, exact permissions, current built manifest and installed production dependency license texts. The conservative notices inventory includes historical dependencies potentially absent from the Chrome bundle. Historical `package:standalone` and native packagers are retained as reference; do not use them for Briefoak.

## Evidence and remaining review

| Check | Status |
| --- | --- |
| 0.3.0 typecheck, 234 unit tests and production build | Passed locally on 9 October 2026 |
| Publication regression tests | 7 passed on 9 October 2026; Windows sandbox blocked junction/rename fixtures, then the identical suite passed outside it |
| Clean staging build and ZIP checks | Passed 9 October 2026: source allowlist copied to a fresh independent folder, offline npm ci, types, 234 tests, 7 publication tests, build, package check/create; Python ZIP CRC, manifest, source-root, license and exclusion checks passed |
| 0.3.0 Chromium extension checks | 15 automated groups passed; Chromium 148.0.7778.96, zero page/console errors; 1 real-permission-dialog manual gate |
| 0.3.0 browser-preview screenshots | Actual interface with fictional local data; no provider execution |
| 0.2.0 UI regression baseline | 14 UI groups, 5 axe scans with no reported violations, 15 Chromium extension groups passed |
| Real optional permission grant/denial/revocation | Manual review remains; a fixture with required hosts does not validate Chrome's real permission dialog |
| Screen reader, zoom, multiple windows | Manual review remains |
| GitHub CI and exact published artifacts | Verify after public push/release; local checks are not a remote CI result |

The 0.2.0 baseline is historical evidence, not proof of a 0.3.0 artifact. The unchanged behavior suite and fresh exact-build checks should be considered separately.

The standalone browser runner is `node tests/e2e/standalone-browser.mjs`. It uses isolated profiles, synthetic provider pages and a proxy that prevents provider access; it tests no authenticated account or real agent. `CHROME_PATH` chooses an installed compatible Chromium executable; `STANDALONE_EXTENSION_DIR` selects an extracted Chrome ZIP. UI preview checks use `node tests/ui/autoporteur-flows.mjs` with optional `HUB_TEST_URL` and `CHROME_PATH`.

## CI supply-chain review

The workflow uses Ubuntu and Node 22, runs only on `push`, `pull_request` and manual dispatch, and grants only `contents: read`. Checkout does not persist credentials. There is no `pull_request_target`, secret, deployment, package publication or repository write permission. PR code runs as untrusted code without release privileges.

Official refs verified with `git ls-remote` on 9 October 2026:

| Action | Verified tag | Pinned commit |
| --- | --- | --- |
| [actions/checkout](https://github.com/actions/checkout) | v4 | `11d5960a326750d5838078e36cf38b85af677262` |
| [actions/setup-node](https://github.com/actions/setup-node) | v4 | `49933ea5288caeca8642d1e84afbd3f7d6820020` |

The npm lockfile pins resolved package versions/integrities. `npm ci` still executes dependency install scripts and downloads packages from configured registries, so review lockfile changes. The workflow builds and checks packages but does not upload or publish them. Publishing GitHub releases is a separate maintainer action.

Production dependency audit on 9 October 2026: `npm audit --omit=dev --audit-level=high --json` returned exit 0 and zero reported vulnerabilities across all severities. This is the registry audit result for the checked lockfile, not a guarantee that dependencies are free of defects.
