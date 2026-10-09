# Briefoak — product scope

Version 0.3.0. Briefoak is a local prompt desk for Claude & ChatGPT. The [current product brief](docs/product-brief.md) defines this release; historical native execution experiments are outside the shipped product.

Primary audience hypothesis: independent consultants, researchers and writers who prepare related work across Claude and ChatGPT web accounts and want to remember their own follow-through. This is an unvalidated positioning hypothesis, not an adoption claim.

Shipped jobs: prepare a prompt locally; explicitly copy it; separately open/focus the official web app; manually mark sent/completed; organize preparations in missions; keep notes; search, export and delete local history. The user pastes and sends in the provider UI. Site permission optionally enables matching-tab discovery.

Tab presence, authentication, execution, human declarations, historical provider receipts, file checks and human review remain distinct facts. Navigation never proves submission or activity. Briefoak reads no conversations, results, account cookies or credentials, and uses no backend, model API, active native connector or telemetry.

Prompt retention requires consent for each preparation, off by default. Unsaved text can be copied while its form is open. Title/provider/status, technical identifiers/timestamps and separately entered notes/mission links persist. An explicit change of the legacy retain-prompts setting to false removes retained web and historical prompts. IndexedDB revision checks prevent stale editors restoring erased prompts.

French/English, side panel/full tab, themes, local persistence and missions are shipped. Production starts empty. Export schema 2 includes web and legacy records; retention and purge cover both. Purge preserves preferences and minimal historical anti-replay identifiers. Storage and exports are not encrypted by Briefoak. Cross-device sync and import are not implemented.

Historical receipts preserve provenance under the same extension identity; a new identity has separate storage. Native code stays as reference and is not compiled by the default build or shipped in the Chrome ZIP. Provider account conditions, quotas and plans apply. Briefoak has no affiliation with Anthropic or OpenAI.

Release evidence and manual gates are tracked in [RELEASE](docs/RELEASE.md). Proposed work is in [Roadmap](docs/roadmap.md); it is not a delivery promise.
