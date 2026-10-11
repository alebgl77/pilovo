# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Pilovo is a Manifest V3 Chrome extension (Chrome 120+, 0.4.0 Preview) that observes ChatGPT/Claude web tabs the user explicitly authorizes and surfaces "working / response ready / attention / unknown" state in a side panel and toolbar badge. No backend, no model API, no telemetry. React 19 + TypeScript + Vite UI, esbuild for the worker and content script, IndexedDB (`idb`) for persistence, `zod` for every trust boundary.

Read `PRODUCT.md`, `docs/core-contract.md` and `DESIGN.md` before changing any user-facing behavior, permission, wording or UI. The contract is normative: permissions, evidence rules and lifetimes there are not suggestions.

## Commands

Node.js 22.12+ required.

```sh
npm ci
npm run typecheck            # tsc --noEmit (src, tests/core, vite.config.ts)
npm test                     # vitest: tests/core/**/*.test.ts + tests/ui/**/*.test.ts
npm run test:core            # vitest, core only
npx vitest run tests/core/activity-controller.test.ts   # single file
npx vitest run -t "name"     # single test by name
npm run test:publication     # node --test scripts/publication.test.mjs
npm run check:publication -- --tracked   # scans tracked files for leaks/allowlist/broken md links (CI runs this)
npm run build                # tsc + vite build (index.html, sidepanel.html) + scripts/build.mjs (background.js, observer.js) → dist/
npm run package:check        # validates release packaging without writing (needs dist/ from build)
npm run dev                  # UI preview only at 127.0.0.1:5173 (no real site observation)
```

CI (`.github/workflows/ci.yml`) runs, in order: `npm ci`, typecheck, test, test:publication, `check:publication -- --tracked`, build, package:check, package. Reproduce that locally before pushing.

`npm run package` creates immutable versioned ZIPs under `release/v<version>/` (per-version lock; refuses to overwrite). Only run it after reviewing the exact build. The script file is still named `scripts/package-briefoak.mjs` on purpose.

Playwright flows in `tests/ui/*-flows.mjs` and `tests/e2e/*.mjs` are standalone Node scripts (not vitest). UI flows target `HUB_TEST_URL` (default the dev server) and accept `CHROME_PATH`; they write to `tests/ui/results/`, `outputs/` and `docs/media/screenshots/`. Harnesses (`tests/ui/*-harness.html/tsx`) render UI with synthetic fixtures.

## Architecture

Three execution contexts communicate via `chrome.runtime` messages:

- **Service worker** — `src/background/index.ts`. Single RPC dispatcher on channel `hub.rpc`; requests are validated with `rpcSchema` (`src/shared/rpc.ts`) and only accepted from the extension's own `index.html`/`sidepanel.html` top frame. Mutating methods trigger a debounced `hub.changed` broadcast that the UI re-reads on. Channel `pilovo.observe` carries content-script hints only.
- **Content observer** — `src/content/observer.ts` + `evidence.ts`, bundled as an IIFE `observer.js` and dynamically registered (session-only, isolated world) by the worker after a per-provider host grant. There is no static `content_scripts` entry. Evidence uses fixed selectors and exact whitelisted accessibility tokens (EN/FR); never traverse or read transcript text.
- **UI** — `src/ui/` (rail + list + detail, collapses to single view below 760 px). It talks only to `HubClient` from `src/platform/client.ts`, which picks the extension RPC client when `chrome.runtime.id` exists, otherwise a local preview client backed by a separate IndexedDB (`agent-control-hub-preview-v1`) — that's what `npm run dev` uses.

Keyboard commands (`focus-next-attention`, suggested `Alt+Shift+J`; `acknowledge-all-attention`, unassigned) are handled by `chrome.commands.onCommand` in the worker and reuse `WebActivity.focus` (plus an attention-identity guard) and seen semantics; the no-candidate side-panel open must stay synchronous inside the command gesture (last focused window tracked via `windows.onFocusChanged`); the UI reads configured shortcuts with `chrome.commands.getAll` (`getShortcuts`). Manifest `commands` are not permissions.

Activity pipeline (`src/background/activity.ts`, `activity-reducer.ts`, `activity-injection.ts`, types in `src/shared/activity.ts`): `WebActivity` is written against an injected `ActivityAccess` interface (so tests drive it with fakes; `chromeActivityAccess` is the real adapter). Per-provider grants have serialized registration queues so revoke/regrant can't race. The worker issues leases (≤15 s, `ACTIVITY_TTL`) and pulls samples via `scripting`; hints only request a resample. Samples are checked for sender, origin, tab/top document, activation id, monotonic sequence and sample identity — late or stale messages are dropped. Activity state is in-memory only and discarded on worker restart. `stateSince` (monotonic, same clock as `validUntil`/`attention.raisedAt`) marks when the current state or attention identity began; the reducer keeps it across same-state samples and the ready debounce. The panel derives ephemeral working/attention durations from it (`src/ui/activityModel.ts`) and re-renders at minute boundaries only while one is shown; never persist or export them. "Response ready" requires witnessed working → stable ready signal after debounce; anything absent/ambiguous/expired is `unknown`.

Persistence (`src/domain/repository.ts`, `HubRepository`): IndexedDB `agent-control-hub-v1`, schema version 4. Web preparations carry an integer `revision`; updates need `expectedRevision` and fail with `preparation.conflict` on stale writes. Prompt retention is per-record opt-in, off by default. Export is schema 2. Legacy native-agent receipts/missions/reviews keep their own provenance and are never converted into observed activity.

Errors cross the RPC boundary as string codes (`HubError` / `errorCode` in `src/shared/errors.ts`); the UI localizes codes via `src/ui/i18n.ts` and `public/_locales/{en,fr}`.

## Invariants to preserve

- Required permissions are exactly `storage`, `sidePanel`, `alarms`, `scripting`; optional hosts exactly `https://claude.ai/*` and `https://chatgpt.com/*`, requested individually. No `tabs`, `nativeMessaging`, `notifications`, broad hosts, telemetry or automatic prompt submission without a separately reviewed scope proposal.
- Keep separate: tab presence, human declarations (`prepared` / `sent_by_user` / `completed_by_user`), and observed UI evidence (`observed_ui`). Focus/copy/open/"seen" never imply submission, approval or task success.
- Legacy identifiers stay stable for compatibility even though the product was renamed (Briefoak → Pilovo, originally "agent control hub"): `agent-control-hub-v1`, `hub.rpc`, `hub.changed`, `NATIVE_HOST`, `HubRepository`, `package-briefoak.mjs`.
- `companion/`, `tests/companion/`, native e2e scripts and `src/shared/protocol.ts` (native event schema) are historical reference: not bundled, not part of the default product. Native/bridge RPC methods intentionally throw `bridge.unavailable` / `permission.denied`.
- Never commit real prompts, exports, profiles, credentials or personal paths; screenshots and fixtures must be synthetic and labeled as such. `check:publication` enforces a file allowlist and leak patterns — any new root-level file or top-level directory must be added to `rootFiles`/`rootDirectories` in `scripts/publication-lib.mjs` or CI fails (it also lands in the source ZIP).
- Docs must not claim store approval, coverage, user counts, reliability numbers or provider endorsement.
- Bug fixes come with a regression test.
