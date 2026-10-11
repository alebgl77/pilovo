# Release checks — Pilovo 0.4.0 Preview

The new activity observer is an experimental pilot. No Chrome Web Store approval, authenticated extension E2E, universal agent coverage, reliability percentage or provider endorsement is claimed. See [Compatibility](compatibility.md).

## Reproduce

Use Node.js 22.12+, npm and Git from the repository root:

```sh
npm ci
npm run typecheck
npm test
npm run test:publication
npm run check:publication
npm run build
npm run package:check
```

Review the exact build and remaining gates before running `npm run package`. The legacy filename `scripts/package-briefoak.mjs` is retained behind that stable command; it now produces:

- `release/v0.4.0/Pilovo_Chrome_v0.4.0.zip`
- `release/v0.4.0/Pilovo_Source_v0.4.0.zip`
- `release/v0.4.0/Pilovo_SHA256_v0.4.0.json`
- `release/v0.4.0/Pilovo_THIRD_PARTY_NOTICES_v0.4.0.md`

The Chrome ZIP contains the extension at root, project license and dependency notices. The source ZIP is self-contained, with lockfile, scripts, tests and docs; no installed dependencies, builds, outputs, work folders, profiles or secrets. The historical companion remains source-only and is neither built by default nor bundled into Chrome.

ZIP paths are sorted, timestamps fixed and content CRC checked by regression tests. A per-version lock and atomic rename prevent partial publication and overwrites. Older Briefoak releases remain immutable. No final artifact is produced merely by changing this document. Checksums identify bytes, not publisher authenticity.

## Publication boundaries

`check:publication` scans the source allowlist, common secret signatures, raw bidirectional control characters (which must be written as escapes) and local Markdown links. `--staged` scans staged bytes; `--tracked` checks every tracked index path, including forced additions. CI uses tracked mode. These checks are not a complete secret audit: review images and the staged diff separately.

`package:check` aligns package/lock/manifest versions; requires exact storage/sidePanel/alarms/scripting permissions and two optional hosts, and in unreleased source exactly one optional permission, `notifications`; rejects required hosts, any other optional permission, static content scripts and external messaging; enforces local-only extension CSP. It requires the self-contained isolated `observer.js` and allows only reviewed runtime paths plus built JS/CSS assets. No extra executable, profile or marketing file is accepted in the Chrome bundle.

The same workflow includes project and installed production-dependency licenses in both ZIPs. The conservative inventory retains historical dependency notices even when absent from runtime. Deterministic and privacy boundaries must remain intact. Historical standalone/native packagers are not the current release workflow.

## Current evidence and gates

| Check | 0.4.0 status |
| --- | --- |
| Native Pilovo vector assets, icon PNGs and preview tiles | Generated with `node scripts/build-icons.mjs --media`, 10 October; banner/icon visually inspected |
| Publication regressions | 8/8 passed 10 October. Windows sandbox blocked three Git/junction/rename fixtures; identical suite passed outside it. |
| Unit/type checks | Fresh post-review source staging independently passed `npm test`: 274 tests across 13 files, and `npm run typecheck`, 10 October. Earlier 268-test results are superseded. |
| Production build | `npm ci --offline --no-audit --no-fund` installed 155 locked packages into fresh staging; `npm run build` passed there. No installed dependencies were copied from the working checkout. |
| UI regression suites | UI executor reports 8 activity, 14 preparation, 4 race and 12 archive groups passed; 15 axe audits with zero violations, zero browser errors, and 21 UI unit tests passed |
| Dependency audits | Maintainer reports both full and production dependency audits with zero reported vulnerabilities; this is not proof of absence of defects |
| Source scan | Fresh staging passed the source scan and `--tracked` check: 171 files each. The tracked check used a separate temporary index, not the working repository index. |
| Exact built package check | `npm run package:check` passed in fresh staging: 171 source files, 14 runtime files and 99 production dependency license records. |
| Final archive integrity | CRC/content/license checks, SHA-256 digests, deterministic reconstruction and the exact extracted Chrome ZIP no-grant smoke are delivery gates recorded in the separate release QA handoff. |
| Final source staging | Fresh post-review source copied through the source allowlist; sorted SHA-256 inventory records exact bytes. The pre-fix provisional snapshot is obsolete. |
| Security review | Final delta review approved: no remaining P1/P2 findings; reviewer independently reproduced all three fixed cases. The revocation/regrant and stale-document focus corrections are included. |
| ChatGPT French selector evidence | Manually observed streaming and completion UI, 10 October; not an authenticated extension test |
| Claude French selector evidence | Attempt blocked by quota, stale completion announcer observed; no successful streaming/completion test |
| Screenshots | Synthetic local fixtures only; not provider execution evidence |
| Isolated extension fixtures | Final core run: 9 checks passed, including 12 FR/EN DOM cases. The production manifest without grants is checked unchanged; positive observation fixtures use a test-only clone with required hosts. |
| Real optional permissions and revocation | Native permission-dialog gate remains manual. Unit mocks and required-host fixture clones do not prove real grant/revocation behavior on the release ZIP. |
| Throttled tabs and restart | Synthetic coverage must remain distinguished from real provider/background qualification |
| Screen reader, zoom and multiple windows | Manual review still required |
| Remote CI, repository rename and published asset hashes | Separate maintainer actions; no result implied by local validation |
| Chrome Web Store | Not submitted/approved by this work |

The existing standalone browser runner uses isolated synthetic provider fixtures and prevents provider access. Its required-host test clone cannot validate the real optional-permission dialog or establish exact-ZIP grant E2E. New activity fixtures and tests likewise do not establish account/locale-wide reliability. Authenticated extension E2E remains untested; Claude's real attempt was quota-blocked. Keep all browser results and private captures outside packages.

Focus must revalidate the current document identity before activation. A browser navigation after that preflight remains a best-effort race boundary; neither focus nor a successful activation response proves current provider execution.

## Clean source staging procedure

Prepare a new directory under `work/pilovo-release-stage` (use a unique sibling if it already exists), with a `source/` child. Enumerate the repository with `walkFiles(root, { source: true })` from `scripts/publication-lib.mjs`, then copy only those files while preserving relative paths. Do not recursively copy the repository or installed dependencies. This excludes `node_modules`, `dist`, `work`, `outputs`, profiles, private captures outside the source allowlist, release archives and orchestration state.

Record a sorted SHA-256 inventory outside `source/`, verify copied bytes against it, and run the source publication scan from the staged root. Check package/lock/source-manifest consistency and the reviewed built runtime inventory independently. A staging snapshot does not freeze concurrent source edits: compare its hashes against the final reviewed source before using it for release.

After security review and the final source freeze, install dependencies from the lockfile in the clean source, rerun type/unit/publication checks and build, then perform `package:check`. Final ZIP creation requires the maintainer's explicit go-ahead. Validate ZIP CRC, manifest-root layout, licenses, exclusions and deterministic bytes against that exact staging tree before any upload.

## Historical evidence

Briefoak 0.3.0 on 9 October 2026 passed 234 unit tests, typecheck/build, seven publication tests and 15 synthetic Chromium extension groups, with one real-permission-dialog gate. The prior 0.2.0 UI baseline included 14 UI groups and five axe scans. These validate their own older scopes, not Pilovo 0.4.0. [Historical release](releases/v0.3.0.md).

Existing CI is read-only, with pinned actions and no deployment/release credentials. Revalidate the exact pushed commit and workflow result before publication. The 9 October dependency audit reported zero known production vulnerabilities for that lockfile; it is historical evidence, not a guarantee about all defects.
