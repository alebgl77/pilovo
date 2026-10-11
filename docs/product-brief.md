# Pilovo 0.4.0 Preview — current product brief

**Keep your AI in view.** AI activity for Chrome.

## User and job

Audience hypothesis: people working across ChatGPT and Claude web accounts who want to notice supported activity and return to the relevant tab. The hypothesis is unvalidated; no adoption, uniqueness or measured productivity claim is made.

## Preview scope

- Activity-first side panel and full-page workspace.
- Separate optional grants for the exact ChatGPT/Claude origins.
- Local isolated observer of recognized DOM controls/status indicators, without collecting prompts, responses or tab titles.
- Working; ready after witnessed work and debounce; explicitly recognized attention; unknown/stale evidence.
- Focus, local seen acknowledgment and a last-observed attention toolbar badge.
- Unreleased in source: a next-attention keyboard shortcut and local mark all as seen, both reusing the same focus/seen rules; elapsed durations for working and attention rows that restart when evidence is lost; a toolbar badge colored by the most urgent reason, a working mark and a counts-only tooltip in the app's language; stable per-service session numbers, the tab's position and an optional session name kept in memory for the tab's lifetime, never stored or exported.
- Ephemeral activity metadata; fresh evidence required after restart.
- Existing manual preparations, per-record prompt retention, notes, missions, search, schema 2 export, deletion and retention kept separate.
- French/English, themes, free MIT core, no account/API key/companion.

Initial EN/FR adapters are experimental. Manual ChatGPT selector evidence and the Claude quota/old-announcer counterexample are documented in [Compatibility](compatibility.md), not presented as full authenticated extension E2E.

## Boundaries

Evidence/leases expire logically within 15 seconds. Background throttling can yield unknown; MV3 watchdog badge cleanup is best effort. Response ready and seen do not verify task success.

No stop, pause, resume, launch, automatic submission, provider approval, OS notification, native process control, other-extension inspection, backend, model API, telemetry, import or sync. Saved records/exports have no application-level encryption.

The manifest requires exactly `storage`, `sidePanel`, `alarms`, `scripting`, with the two exact optional hosts. A bundled observer is registered dynamically after a grant; no static content script or companion is shipped. [Core contract](core-contract.md) defines trust and data boundaries.

## Distribution and next gates

The first 0.4.0 distribution is an unpacked pilot. A Chrome Web Store installation would be a future onboarding improvement, subject to publisher requirements and review; approval is not guaranteed. Existing Briefoak releases remain historical. The proposed Pilovo repository URL is used by current docs; publication/rename is a separate maintainer action.

[Release checks](RELEASE.md) must be completed against the exact artifact. The [PRD](activity-manager-prd.md) covers later integrations and qualified controls, without claiming they already work.