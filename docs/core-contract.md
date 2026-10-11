# Pilovo contract — 0.4.0 Preview

`src/shared/types.ts`, `src/shared/web.ts` and `src/shared/activity.ts` define the client and activity contracts. The extension has no backend, model API or active native connector. Historical companion source remains unbundled reference material.

## Activity observation

Required permissions are exactly `storage`, `sidePanel`, `alarms`, `scripting`. Optional hosts are exactly `https://claude.ai/*` and `https://chatgpt.com/*`, requested individually. There is no required host access, broad `tabs`, `management`, `nativeMessaging`, `notifications` or static `content_scripts` declaration.

After a grant, the worker dynamically registers the bundled `observer.js` in the isolated world with session-only registration. Content hints request resampling; they do not supply a trusted state or arbitrary page text. Validate schema, extension sender, permitted origin, tab and top-level document, activation/session identity, monotonic sequence and sample request identity. Late messages from navigation or an old activation must be rejected. Page data is untrusted.

Only bounded, recognized controls/status indicators are sampled. No full prompt/response, tab title, screenshot, cookie or credential is collected. Activity metadata remains ephemeral; no activity history is persisted/exported. Internal database/source/protocol identities, including `agent-control-hub-v1` and `hub.rpc`, remain stable.

Each observation has provenance `observed_ui`, local observed time and expiry. Working requires recognized evidence. Response-ready attention requires witnessed working followed by stable ready evidence after debounce; an idle composer, removed control or old completion announcer alone is insufficient. Only explicitly recognized intervention/error indicators produce their respective attention reasons. Absence, ambiguity, navigation or expiry yields unknown. Completion never verifies task success.

The observation lifetime and authorization lease are at most 15 seconds logically. Revocation invalidates state, stops lease renewal and unregisters observation. Suspended pages can execute cleanup late but expired leases cannot authorize fresh sampling. Restart discards activity and requires fresh evidence. Chrome throttling may cause unknown states.

Focus revalidates the provider/tab association and activates its tab/window. It does not change execution. Seen acknowledges one local attention identity; it is not approval, task verification or provider control. There are no stop/pause/resume/launch commands.

Each new attention identity records `raisedAt` on the monotonic clock used by `validUntil`; a persisting attention keeps it. Unreleased keyboard commands reuse these rules. `focus-next-attention` (suggested `Alt+Shift+J`) selects the live, unacknowledged attention raised first, with the lower tab ID on ties, and runs the same focus revalidation; the fresh sample must also still show that unacknowledged attention. A failed attempt moves to the next of the initially selected candidates, never looping. With no candidate, it opens the side panel synchronously within the command gesture, in the command's window or else the last focused browser window (a numeric window ID kept in worker memory); after every candidate failed it tries the same, best effort, since Chrome may no longer accept the gesture. `acknowledge-all-attention` (no default key) and the panel's mark-all action are local seen only, identical to acknowledging each current identity. The panel sends the identities it displayed, so attention raised later stays unacknowledged. Manifest commands are not permissions and carry no page data.

Each observation also carries `stateSince` on the same monotonic clock: when its current state began within the current record identity. Samples that keep the state keep it, including the response-ready debounce, during which the state stays working. A state change resets it; a new attention identity resets it together with `raisedAt`, to the same value, even when the state stays attention. Unknown evidence, a failed sample (`unavailable`) and expiry reset it through the unknown state, and navigation, a new document or activation and a worker restart start a new record. Unreleased: the panel shows working and attention rows, seen or not, with an elapsed duration derived from it (`monotonicEpoch() - stateSince`, minute precision, plain text without a live region); idle and unknown rows, and a negative or non-finite value, show none. Durations are never persisted, exported or sent. They are a consequence of the conservative evidence model: they restart whenever the worker loses evidence, so they measure continuous observation by this worker, not provider generation time. The panel's own downgrades to unknown (a failed read, a snapshot reporting `unavailable`, a pending grant change) leave `stateSince` untouched: they hide the duration, which returns unchanged when fresh worker data confirms the same record.

The toolbar badge counts last-observed, unacknowledged attention. Freshness is re-evaluated by the panel and background watchdog. MV3 scheduling can delay badge clearing; no strict real-time or OS-notification guarantee is made. See [compatibility](compatibility.md).

## Manual web preparation

`WebPreparation` remains distinct from observed activity and legacy receipts. Its provider selects only Claude or ChatGPT's fixed official origin. States `prepared`, `sent_by_user`, `completed_by_user` are human declarations. Copy/open/focus never imply submission, running or successful completion.

Prompt retention requires per-record consent, off by default. Without it, the form can copy unsaved text; storage includes title/provider/manual status, identifiers/timestamps and separate note/mission association. Explicitly setting legacy `retainPrompts` false erases retained web and historical prompts. No prompt travels in a URL or is submitted by Pilovo.

Discovery exposes provider/tab presence through host access, not account, subscription or model detection. Revocation clears permitted metadata; unknown presence does not mean no account. Refusal leaves fixed official-home-page navigation available.

## Persistence and historical provenance

IndexedDB version 4 preserves history under the same identity and adds a positive integer `revision` to web records, backfilled for version 3. Updates require `expectedRevision`; stale writes fail with `preparation.conflict`. Prompt erasure and mission detachment advance affected revisions. The UI clears stale prompt text and requires reopening; it must not silently rebase erased content.

Export schema 2 contains saved legacy/web data. Retention defaults to 30 days while active. Purge removes saved history but retains settings and minimal historical anti-replay identities; uninstall removes those too. Exports and provider history are separate.

Historical source/run IDs, receipts, reviews and scoped file checks retain provenance and are not converted to current activity. Legacy native capabilities remain disabled regardless of old settings. A SHA-256 check compares selected bytes to a supplied reference without proving reference authenticity or task quality; file bytes are not persisted/uploaded.

The source archive retains historical companion code/tests. The default build and Chrome archive exclude it. [Release checks](RELEASE.md) separate current validation from historical evidence.