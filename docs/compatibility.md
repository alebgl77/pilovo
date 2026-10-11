# Pilovo 0.4.0 — experimental compatibility

Dated 10 October 2026. This pilot observes a bounded set of web UI controls. Provider changes, account variants, locale and page throttling can produce unknown states. There is no measured coverage percentage or universal agent support.

| Surface / capability | Preview status | Evidence and limits |
| --- | --- | --- |
| ChatGPT web EN/FR status adapter | Experimental | Local synthetic fixtures cover selected labels. Manual French UI inspection witnessed the streaming control and completion announcer on 10 October. No authenticated end-to-end extension run is claimed. |
| Claude web EN/FR status adapter | Experimental | Local synthetic fixtures cover selected labels. Manual French attempt was blocked by quota; no Claude streaming indicator or successful completion was captured. |
| Response ready | Conditional | Requires witnessed work, then recognized ready evidence and debounce. A ready composer or old announcer alone is not completion. |
| Explicit attention/error | Conditional | Only recognized, bounded UI indicators; unfamiliar notices remain unknown. No general account, quota or error understanding is claimed. |
| Focus / mark seen | Preview feature | Focus targets the matched tab. Seen is a local acknowledgment, never verification or provider approval. |
| Keyboard shortcuts / mark all as seen | Unreleased | The next-item shortcut reuses focus revalidation and skips an item the fresh sample no longer shows as needing review; mark all is local seen only. Command handling is unit-tested with mocked Chrome APIs; real key dispatch, macOS keys and conflicting extension shortcuts are not yet checked manually. |
| Elapsed durations | Unreleased | Derived in the panel from the observed state's start; minute precision. They restart whenever evidence is lost (throttled or expired evidence, navigation, worker restart), so they can be shorter than the real time and are not provider generation times. Covered by unit tests and synthetic harness flows only. |
| Session numbers, tab positions and names | Unreleased | The service worker numbers sessions per service at first observation and keeps the number while the tab stays open on that service; numbering restarts with the worker. Positions follow Chrome's tab index, re-read on samples and tab moves; "other window" depends on reading the panel's own window. Names typed in the panel stay in worker memory for the tab's lifetime and show only on the service where they were given. Covered by unit tests with mocked Chrome APIs, synthetic harness flows and a synthetic-fixture Chromium run (position after a real tab move, a label across a reload); several windows, the side panel's own window detection, tab groups and screen reader announcements of the rename field are not yet checked manually. |
| Toolbar badge | Best effort | Last observed unacknowledged attention; service-worker suspension can delay visual expiry. |
| Badge colors, working mark and summary tooltip | Unreleased | The count takes the color of the most urgent reason; `…` shows live work with nothing to review; the tooltip gives counts and fixed reason words in the app's language. Same best-effort expiry as the badge. Covered by unit tests with mocked `chrome.action` only; rendering in a real toolbar (light/dark browser themes, platforms) and tooltip display are not yet checked manually. |
| ChatGPT agent / Claude in Chrome | Not supported as dedicated integrations | Ordinary web indicators do not prove internal agent tasks, remote-browser state or extension state. |
| Claude Code / Codex / native applications | Not supported | No live connector or external-process control is bundled. |
| Stop / pause / resume / launch / OS notifications | Not supported | No such control commands or permission are exposed by this preview; keyboard commands only focus, open the side panel or acknowledge. |

## Manual selector evidence

Only non-content interface identifiers and generic status labels are recorded here. No conversation URL, title, transcript, screenshot, account details or provider result is included.

- **ChatGPT, French:** during streaming, the composer had a button with accessible label `Arrêter`; dictation was disabled. After streaming, a dedicated `role=status`, `aria-live=polite` element contained `Réponse terminée`. The voice button label was `Démarrer une conversation vocale` and dictation was enabled.
- **Claude, French:** composer `data-testid=chat-input`; empty composer send control `data-testid=chat-input-send` disabled. The dedicated `data-testid=response-status-announcer`, `role=status` element contained `Claude a terminé sa réponse.` **even though the attempted request was blocked by quota and generated no response.** This is a false-completion counterexample, not a successful Claude run.

The Claude quota notice was separately observed under the dedicated composer banner: `[data-composer-banner-layer="composer"] [data-cds="ChatComposerNotices"] > [role="status"][aria-live="polite"]`. Only this anchor and the quota-blocked outcome are recorded; no account text or quota details are published. Dedicated error evidence must take precedence over an old finished announcement.

These observations establish the existence and ambiguity of selected indicators on one date. They do not measure adapter reliability. Claude authenticated streaming, live extension message flow, permission grant/denial/revocation, account variants and broader locales remain qualification work. Do not use synthetic UI screenshots as evidence of a real provider session.

## Freshness

Observations and observer authorization leases expire logically after at most 15 seconds without renewal. Throttled or suspended tabs can miss heartbeats. The activity panel downgrades stale evidence to unknown; the toolbar uses a best-effort alarm/watchdog, so its visual badge, including the unreleased working mark and tooltip, cannot promise a hard real-time expiry. A restart requires fresh evidence and a newly witnessed working transition before response-ready attention.

Any future 99% reliability or similar benchmark is a target requiring a defined corpus, denominator and measured results. No such target has been achieved or measured here.
