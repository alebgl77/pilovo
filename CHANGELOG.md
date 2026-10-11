# Changelog

## Unreleased

- Adds keyboard commands. **Go to the next item to review** (suggested `Alt+Shift+J`) focuses the earliest unacknowledged attention through the same revalidation as **Open session**, provided the fresh sample still shows that attention. When revalidation or activation fails, it moves on to the next candidate (each initially selected candidate at most once, never looping). When nothing needs review it opens the side panel, in the command's window or the last focused browser window; after every candidate failed it also tries to, best effort. **Mark all items to review as seen** has no default key; assign it at `chrome://extensions/shortcuts`.
- Adds a **Mark all as seen** panel action when two or more items need review. It acknowledges locally only the attention identities the panel displayed and confirms through a refreshed snapshot. A discreet hint shows the configured next-item shortcut and hides when none is assigned.
- Records a monotonic `raisedAt` time for each attention identity to order attention, and adds the `acknowledgeAllWebActivity` RPC. Commands are not permissions; no page data, persistence or permission changes.
- Shows elapsed durations: **Working for 4 min** on working rows and **Available for 2 min**, **Input requested for…** or **Error visible for…** on items to review, seen or not (French: **En cours depuis…**, **Réponse disponible depuis…**). Observations carry a monotonic `stateSince`; the panel formats it to the minute and refreshes at minute boundaries only while a duration is shown. Durations are ephemeral: never persisted, exported or sent, and they restart when the worker loses evidence (no recognized signal, a failed sample, expired evidence, navigation, worker restart), so they can be shorter than the real time. A panel-only interruption (failed refresh, unavailable service, access change in progress) hides them until fresh data confirms the same observation.
- Differentiates the toolbar badge. It still counts live, unacknowledged attention, now on the color of the most urgent reason: red for a visible error, amber-brown for an input request, olive for a response available. With nothing to review but live work, it shows `…` on neutral gray instead of a count; seen attention, idle and unknown sessions never light it. Every background carries white text with a contrast of at least 4.5:1, checked by a unit test. The icon's tooltip gives the same summary in text, in the language chosen in Pilovo's settings rather than the browser's, for example **Pilovo — 3 to review, including 1 visible error · 1 working** (French: **Pilovo — 3 à vérifier, dont 1 erreur visible · 1 en cours**), or **Pilovo** when nothing counts. Badge and tooltip contain only counts and fixed reason words, never titles, URLs, labels or content. Unchanged values make no `chrome.action` call. Expiry lowers or clears the badge through the background watchdog and alarm, still best effort; revocation and tab closure clear their rows' contribution on Chrome's events, and a worker restart repaints it hidden before any fresh evidence. No permission or persisted data changes.
- Identifies sessions stably. Rows read **Claude · session 3** with a number the service worker assigns per service when it first observes the tab (the smallest one free) and keeps while that tab stays open on that service, so another tab closing or the page navigating no longer renumbers them; numbering restarts with the worker. A secondary line gives the tab's position, **Tab 4**, plus **other window** when it is not in the panel's window (French: **Onglet 4 · autre fenêtre**). A pencil button (**Name this session** / **Nommer cette session**) turns the heading into a field for a name of up to 40 characters; the row then reads **Contract review — Claude**. Enter or leaving the field applies the name, Escape cancels, an empty name clears it; control and bidi override characters are refused, and, as for focus and seen, only a live observation can be named. Names are typed by the user and kept only in the worker's memory for that tab: kept across navigation in the tab and shown only on the service where they were given, cleared on tab close, removal of that service's access or a worker restart, and never persisted, exported, sent or shown on the badge, its tooltip or any notification. Observations gain `sessionNumber`, `tabIndex` and `label`; adds the strict `labelWebActivity` RPC and a `tabs.onMoved` listener. No permission change; tab titles and URLs are still never shown.
- `check:publication` refuses raw bidirectional control characters (U+202A–U+202E, U+2066–U+2069) in published text; source writes them as escapes.
- Fixes the expiry watchdog, which could run a fraction of a millisecond before the earliest deadline (the clock is fractional and timers truncate their delay) and then not re-arm, leaving the badge lit until the next alarm or panel read. It now rounds the delay up and re-arms when nothing has expired yet.

## 0.4.0 — Pilovo Preview

- Introduces Pilovo, the native P identity and the promise “Keep your AI in view.”
- Adds experimental local ChatGPT/Claude web-status observation with separate optional site grants and a bundled isolated observer.
- Distinguishes witnessed work, response-ready attention after debounce, explicit recognized attention, and unknown/expired evidence; adds focus, seen acknowledgment and a last-observed toolbar badge.
- Keeps activity metadata ephemeral and manual preparations separate; preserves existing database/protocol identifiers and historical receipts.
- Updates EN/FR installation, privacy, compatibility and release gates. Claude's quota-blocked stale completion announcer is documented as a counterexample; authenticated extension E2E is not claimed.
- Retains deterministic packaging and license/privacy checks, with a required observer bundle and exact permission/CSP checks.

This is a pilot scope, not a store release or universal agent manager. Final validation and publication remain separate gates in [RELEASE](docs/RELEASE.md). Older Briefoak archives remain unchanged.

## 0.3.0 — Briefoak

- Introduces the Briefoak name and visual identity for the local Claude/ChatGPT prompt workspace.
- Adds English/French public documentation, contribution/support guidance and explicit product/privacy boundaries.
- Adds a self-contained source/Chrome packaging workflow, publication checks and pinned read-only GitHub CI.
- Preserves manual copy/send/status behavior, optional site permissions, IndexedDB identity and historical receipt provenance.

This entry describes the release scope; [RELEASE](docs/RELEASE.md) records validation. Store publication is not included.

## 0.2.0 — standalone web workspace (historical local delivery)

Prepared prompts, optional exact-site tab recognition, human-declared statuses, notes/missions, per-preparation prompt consent, schema 2 export and database revision protection. Native connectors were disabled. Earlier local archives remain separate.

## 0.1.0 — native integration experiment (historical)

Experimental native receipts and companion code. Preserved source provides provenance and compatibility context; the native companion is not part of the current Chrome release.
