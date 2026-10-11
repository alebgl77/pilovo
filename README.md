# Pilovo

**Keep your AI in view.**
AI activity for Chrome · **0.4.0 Preview**

Keep track of your ChatGPT and Claude tabs in one quiet workspace. See observed work, notice a response ready for attention, and return to the right session. Pilovo is an experimental Chrome preview.

![Pilovo — Keep your AI in view. Preview.](docs/media/pilovo-github-banner.png)

[Install](docs/installation.md) · [Français](docs/README.fr.md) · [Privacy](docs/privacy.md) · [Compatibility](docs/compatibility.md) · [Contribute](CONTRIBUTING.md)

## Keep track of the tabs you authorize

1. **Enable one site.** Grant optional access to ChatGPT or Claude separately. Access to one does not enable the other.
2. **Work in your usual account.** Send your prompt in the provider's own interface. Pilovo observes recognized status controls; it does not collect your prompts, responses or tab titles.
3. **Return when needed.** Open the matching tab or acknowledge an attention item as seen. Seen means you noticed it, not that the task succeeded.

The panel distinguishes working, response ready, recognized requests for attention, and unknown or expired evidence. Response ready requires witnessed work followed by a recognized ready signal and debounce. A tab merely being open, a disappearing button or an old completion announcement is insufficient.

**Keyboard shortcuts** (unreleased; build from source until the next release). Press `Alt+Shift+J` (`Option+Shift+J` on macOS) to go to the next item to review: the earliest unacknowledged attention, revalidated like **Open session** and skipped for the next one if the fresh check shows it no longer needs review. When nothing needs review, it opens the side panel. **Mark all items to review as seen** has no default key; assign it, or change `Alt+Shift+J`, at `chrome://extensions/shortcuts`. When two or more items need review, the panel also offers **Mark all as seen**. Like a single acknowledgment, it is local and only means you noticed them.

**Automatic seen** (unreleased; build from source; off by default). In **Settings**, **Mark as seen automatically** can be set to 5, 15 or 30 seconds. An item to review is then marked as seen once its own tab has stayed the active tab of the focused Chrome window for that long, with the side panel open beside it or not; Pilovo's full-page view, another tab, another window or another application in front does not count. Switching tabs or windows, leaving Chrome, navigating, closing the tab, removing that site's access, a new signal in the tab or a manual acknowledgment stops the wait, which restarts in full when the tab is in front again; just before marking, Pilovo asks Chrome again which tab is in front. When enabled, the activity page's footer states the delay. Like a manual acknowledgment, it is local and only means the tab was in front of you: it never verifies, approves or completes the task. To know which tab is in front, Pilovo reads only tab and window IDs and their active and focused flags, in the service worker's memory; no new permission is needed. The setting itself is saved with your other preferences and included in the export.

**Elapsed durations** (unreleased; build from source). A working row shows how long that work has been observed, for example **Working for 4 min**; an item to review, seen or not, shows how long its signal has been shown, for example **Available for 2 min**. Durations have minute precision and are computed in the panel's memory from the moment Pilovo observed the current state in that page. They are never saved, exported or sent. Because the evidence model is conservative, a duration restarts whenever Pilovo loses the evidence for that state: no recognized signal, a failed check of the page, expired evidence, navigation or reload, or a service-worker restart. It can therefore be shorter than the real time and is not a provider-reported generation time. When only the panel cannot confirm activity (a failed refresh, the activity service unavailable, or a site access change in progress), durations are hidden; they come back unchanged once fresh data confirms the same continuous observation.

**Session numbers, positions and names** (unreleased; build from source). Each row keeps a stable number per service, for example **Claude · session 3**. Pilovo assigns it when it first observes the tab and keeps it while that tab stays open on that service, even when other tabs close or the page navigates. Numbering starts again after the extension's service worker restarts, and a tab that leaves the service and comes back gets a new number. A secondary line gives the tab's position in its window, for example **Tab 4**, and adds **other window** when the tab is not in the window showing Pilovo. To tell sessions apart, select the pencil button (**Name this session**) and type a name of up to 40 characters, for example *Contract review*; the row then reads **Contract review — Claude**. Enter or leaving the field applies the name, Escape cancels, and an empty name removes it. Naming needs current evidence, as opening a session does: a row whose evidence has expired can be renamed again once Pilovo observes it anew. The name is kept only in the extension's memory for that tab: it survives navigation in the tab, is shown only while the tab is on the service where you named it, and disappears when the tab closes, when you remove that site's access or when the service worker restarts. It is never stored, exported, sent, or shown on the toolbar badge or its tooltip. Pilovo still never shows tab titles or addresses.

The toolbar badge shows how many last-observed items to review are still unseen. **Badge colors and summary** (unreleased; build from source): the count takes the color of the most urgent reason, red for a visible error, amber-brown for an input request, olive for a response available. With nothing to review but work observed, it shows `…` on gray instead of a count; seen items, waiting and unknown sessions never light it. Hovering Pilovo's icon gives the same summary in text, in the language chosen in Pilovo's settings, for example *Pilovo — 3 to review, including 1 visible error · 1 working*. The badge and its tooltip contain only counts and these fixed words, never a title, URL or conversation content. Evidence has a 15-second logical lifetime. Background tabs may be throttled; Chrome may suspend its service worker. The panel checks freshness, but badge cleanup uses a best-effort watchdog and is not a strict real-time notification guarantee. There are no OS notifications.

![Pilovo activity panel with synthetic examples](docs/media/screenshots/Pilovo_activity_desktop_synthetic.png)

*Actual interface rendered with synthetic local activity fixtures. These examples are not a real provider session or execution proof.*

## Preview compatibility

Initial adapters target English/French ChatGPT and Claude web interfaces. They are experimental, not universal agent coverage. On 10 October 2026, manual inspection observed ChatGPT's French streaming and completion indicators. Claude's attempted check was blocked by quota; its completion announcer still contained a finished message. Claude streaming was not captured. This is selector evidence, **not an authenticated end-to-end extension test**. Read the [compatibility record](docs/compatibility.md).

Pilovo offers focus and local acknowledgment. It does not stop, pause, resume or launch agents, send prompts, approve provider actions, inspect other extensions or control native applications. ChatGPT agent, Claude in Chrome and Claude Code/Codex supervision remain future work with separate integration requirements.

## Install in Chrome

Chrome 120+ is required. This is a manually installed preview; there is no Chrome Web Store approval. Use a reviewed `Pilovo_Chrome_v0.4.0.zip` if it is available in [Releases](https://github.com/alebgl77/pilovo/releases), or build from source below. Extract it, open `chrome://extensions`, enable **Developer mode**, choose **Load unpacked**, then select the folder containing `manifest.json`.

Pilovo's core is free under MIT. No Pilovo account, API key, companion, CLI or Node.js is required to use the extension. Provider account rules, plans and quotas still apply. Node.js is only needed to build. [Detailed installation and French first-run guide](docs/installation.md).

## What Pilovo can see

| Permission | Purpose |
| --- | --- |
| `storage` | Local preferences; saved manual preparations live in IndexedDB. |
| `sidePanel` | Chrome side panel. |
| `alarms` | Retention maintenance and best-effort activity watchdog. |
| `scripting` | Register and sample the bundled isolated observer after a site grant. |
| Optional `https://chatgpt.com/*` or `https://claude.ai/*` | Recognize matching tabs, read supported status indicators and focus a tab; requested individually. |

The observer reads a limited set of DOM controls and dedicated status indicators. It does not collect full conversations, prompt or response text, tab titles, screenshots, cookies or credentials. Activity metadata stays local and ephemeral; session names you type (unreleased) stay in that memory for their tab's lifetime and are never stored or exported. Optional automatic seen (unreleased, off by default) reads only which tab is active in the focused window, as IDs and flags kept in memory. No backend, model API, remote telemetry or cloud sync is used. Revocation invalidates access; the observer's lease has a logical cutoff of at most 15 seconds, even if Chrome delays execution of cleanup. See [Privacy](docs/privacy.md) and the [technical contract](docs/core-contract.md).

## Manual preparations remain separate

You can still prepare/copy a prompt, keep notes and missions, search, export or delete local history. You paste and send yourself. Sent/completed preparation labels remain human declarations and do not become observed activity.

Prompt retention is off for every new preparation. Without opting in, copy its text before closing the form. Titles, provider, manual status, identifiers/dates, notes and mission links are still saved. Storage and exports are **not encrypted by Pilovo**. Retention defaults to 30 days while the extension is active. Schema 2 JSON export includes saved records; import and sync are not implemented. Purge keeps preferences and minimal historical anti-replay identifiers. Uninstall removes remaining extension storage; exports, clipboard, backups and provider history are separate.

## Build from source

Use Node.js **22.12+**, npm and Git. From the repository root:

```sh
npm ci
npm run typecheck
npm test
npm run test:publication
npm run build
npm run package:check
```

Load `dist/` in Chrome. `npm run dev` is a UI preview; actual site observation requires the installed extension. After exact-artifact review, `npm run package` creates immutable versioned Chrome/source ZIPs, license notices and checksums under `release/v<version>/`. [Release gates](docs/RELEASE.md) identify checks and manual gaps.

The preserved `companion/` code is a historical experiment, unbundled and unnecessary for Pilovo. Database and protocol identifiers such as `agent-control-hub-v1` and `hub.rpc` stay stable. Briefoak 0.3.0 releases and their claims remain historical; the Pilovo activity feature begins with this preview.

## Status and contributing

No store approval, production certification, coverage percentage, user count or provider affiliation is claimed. Benchmarks and broader integration goals in the [PRD](docs/activity-manager-prd.md) and [roadmap](docs/roadmap.md) are future targets.

[Contribution guide](CONTRIBUTING.md) · [Support](SUPPORT.md) · [Security](SECURITY.md). Pilovo uses the [MIT license](LICENSE); third-party components retain their own licenses and notices.
