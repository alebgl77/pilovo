# Briefoak contract — 0.3.0

`src/shared/types.ts` defines the UI/client data contract. Runtime communication stays between the extension's own pages and service worker. There is no native connection, backend, model API, content script, external-extension discovery or page-reading channel. Historical native code remains a source reference.

## Web preparation

`WebPreparation` is a local record distinct from a provider execution receipt. Its provider selects only Claude at `https://claude.ai/` or ChatGPT at `https://chatgpt.com/`. States are `prepared`, `sent_by_user`, `completed_by_user`: local preparation or explicit human statements. Copy/open/focus never imply submission, running, successful completion or verification.

Prompt retention requires per-record consent, off by default. Without it, the current form may copy unsaved text; persistence includes title/provider/status, technical identifiers/timestamps and any separately entered note/mission association. Explicitly setting legacy `retainPrompts` to false removes retained prompts from legacy and web records.

No authentication, cookies, tokens, accounts, conversation DOM, results or active model are inspected. The user pastes and sends in the provider UI. No CLI launch or automatic result ingestion.

## Discovery and navigation

Required permissions: exactly `storage`, `sidePanel`, `alarms`. Optional host permissions: exactly `https://claude.ai/*`, `https://chatgpt.com/*`. No required host access, `nativeMessaging`, `management`, `tabs`, `scripting` or content scripts.

After a site grant, discovery refreshes on grant/focus/tab changes. No manual registration. Matching tab means presence only. Revocation clears visibility; unknown presence does not mean absence of an account. Refusal still allows explicit opening of the fixed official base URL. No prompt travels in a navigation URL. Navigation revalidates provider matches rather than trusting stale tab IDs.

Chrome host grants expose matching tab metadata without global tabs permission. References checked 2026-10-09: [Tabs](https://developer.chrome.com/docs/extensions/reference/api/tabs), [Native Messaging](https://developer.chrome.com/docs/extensions/develop/concepts/native-messaging), [messaging](https://developer.chrome.com/docs/extensions/develop/concepts/messaging). They establish no agent authentication/execution state.

## Persistence and legacy provenance

Existing IndexedDB history is preserved under the same extension identity. Legacy source/run identity, events, review and checks keep their provenance; they are not converted to web preparations. Native capabilities remain disabled regardless of old settings. A new extension identifier has separate storage; cross-extension import is not implemented.

Database version 4 adds a positive integer `revision` to web records, including a backfill for version 3 records. Updates require `expectedRevision`; stale updates fail with `preparation.conflict`. Erasing retained prompts advances web revisions so an older open editor cannot restore deleted content. Mission detachment also advances the affected record revision. The UI must clear a stale prompt and require the user to reopen the current record rather than silently retrying an obsolete edit.

Export schema 2 includes legacy and web data. Purge and retention cover web records. Retention defaults to 30 days and runs while the extension is active. Purge retains settings and minimal historical anti-replay identities; uninstall/storage removal clears those too. Exports and provider histories are separate.

Legacy provider completion, connection, human review and scoped file checks remain distinct. SHA-256 compares a selected file to a supplied reference without establishing reference authenticity or task quality. File bytes are not persisted/uploaded.

The source package retains historical companion scripts/tests for reference. The default build and Chrome package do not compile or require it. Actual acceptance evidence belongs in [RELEASE](RELEASE.md).
