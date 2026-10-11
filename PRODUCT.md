# Pilovo — product scope

Version **0.4.0 Preview**. Pilovo is **AI activity for Chrome**: **Keep your AI in view.** The [current brief](docs/product-brief.md) defines the experimental web pilot; the [PRD](docs/activity-manager-prd.md) separates broader targets.

The main job is to see recognized ChatGPT/Claude web activity and return to the right tab. Optional access is granted per provider. A local isolated observer reads bounded DOM status indicators, without collecting full conversations, prompts, responses, tab titles, credentials or cookies.

Working requires recognized evidence. Response ready requires witnessed work then a stable ready signal. Recognized attention, focus and seen acknowledgment are available; unreleased source adds a next-attention keyboard shortcut, a local mark-all-seen action and elapsed durations for working and attention rows, which restart whenever evidence is lost. It also differentiates the toolbar badge: colored by the most urgent reason, `…` while only work is observed, and a counts-only tooltip in the app's language. Rows get a stable per-service session number assigned by the worker, the tab's position (and "other window") and an optional session name typed by the user, kept in worker memory for that tab's lifetime only: never stored, exported or shown outside the panel. Tab titles and URLs are still never shown. Unknown/stale remains explicit. Completion and acknowledgment never verify task success. Activity metadata is ephemeral. Leases/evidence expire logically within 15 seconds; throttling and MV3 scheduling mean the last-observed toolbar badge has best-effort cleanup.

Initial EN/FR compatibility is experimental. Manual ChatGPT selector evidence and Claude's quota-blocked false-completion example are recorded in [Compatibility](docs/compatibility.md). No measured reliability rate, universal agent coverage or authenticated extension E2E is claimed.

Preparations remain separate: prepare/copy/open, human-declared statuses, notes/missions, search, JSON export and deletion/retention. Prompt storage requires per-preparation consent, off by default. Saved titles, status, technical identifiers/dates and separately entered notes can still be sensitive. Revision checks protect erased prompts from stale editors.

The core is free under MIT, with no account, API key, companion, backend, model API or telemetry. Stop/pause/resume/launch, provider approvals, OS notifications, native/other-extension control, import and sync are unsupported. Provider accounts/plans/quotas apply; no affiliation is claimed.

French/English, themes, side panel/full page and local saved history are included. Storage/exports have no added encryption. Purge retains preferences and minimal historical anti-replay identities. Historical receipts keep provenance; native source stays unbundled. Stable database/protocol identifiers are preserved.

This pilot uses manual unpacked installation until any store submission is accepted. [RELEASE](docs/RELEASE.md) lists validation gates; [Roadmap](docs/roadmap.md) lists proposals, not delivery promises.