# Privacy and local data — Pilovo 0.4.0 Preview

Updated 11 October 2026 (sections on unreleased features; summary added). This notice describes the preview's intended data boundaries; it is not a legal certification or Chrome Web Store approval. Contact: [GitHub Issues](https://github.com/alebgl77/pilovo/issues) for non-sensitive questions; [Security](../SECURITY.md) for sensitive reports.

French summary: [Confidentialité et permissions](faq.fr.md#confidentialité-et-permissions).

## In short

- Pilovo reads a limited set of page controls and status indicators on chatgpt.com and claude.ai, only after you grant each site; it does not collect full conversations, prompt or response text, tab titles, screenshots, cookies or credentials.
- Observed activity stays in the extension's memory and is discarded on restart; it is never saved as history or exported.
- There is no Pilovo backend, account, sync, advertising, remote telemetry or model API call.
- Manual preparations you save stay in IndexedDB in your Chrome profile, are not encrypted by Pilovo and are deleted after 30 days by default (adjustable from 1 to 365), a cleanup that runs only while the extension is active; a prompt is stored only if you opt in for that preparation.
- Required permissions are `storage`, `sidePanel`, `alarms` and `scripting`; access to `https://chatgpt.com/*` and `https://claude.ai/*` is optional and per site, and can be removed at any time. Unreleased source adds only the optional `notifications`, off by default.

## Activity observation

After you grant access to a provider individually, Pilovo dynamically registers a bundled content observer in Chrome's isolated world on that exact provider origin. It examines a bounded set of DOM controls and dedicated status indicators to classify supported activity. This is page-DOM access: the former Briefoak 0.3.0 statement that no page content is read does not describe this preview.

Pilovo does not collect full conversations, prompt or response text, tab titles, screenshots, account cookies, credentials, tokens or passwords. No whole-page text is read. Dedicated generic status labels may be matched locally; conversation content is not included in observer messages. Navigation uses tab identity and validates the permitted provider origin; conversation URLs are not retained as activity history.

Activity consists of temporary provider/tab/window identities, a per-service session number and the tab's position in its window (unreleased), observed state, local observation/freshness times, attention reason, the attention's raise time and the current state's start time on a local monotonic clock, and local seen acknowledgment. It stays in session memory, without durable activity history or activity export. The panel derives an elapsed duration from the state's start time (unreleased); it is computed in memory, never saved, exported or sent, and restarts when evidence is lost. Restart requires fresh evidence. It does not inspect other extensions or native applications. An open tab does not prove authentication or active work.

Unreleased: you can name a session in the panel while its evidence is current. The name is typed by you and kept only in the extension's service-worker memory for that tab's lifetime: it survives navigation in the tab, is shown only while the tab is on the service where you named it, and is erased when the tab closes, when you remove that site's access or when the service worker restarts. It is never stored (no IndexedDB or extension storage), exported, sent, or shown outside the panel: not on the toolbar badge, its tooltip or any notification. Control and bidirectional override characters are refused, and the panel displays the name as plain text. Session numbers restart with the service worker; tab positions come from Chrome's tab index and the panel's own window from Chrome's window API, neither of which needs a permission or exposes a tab title or URL.

Unreleased, off by default: when you set **Mark as seen automatically** to 5, 15 or 30 seconds, the service worker follows which tab is the active tab of Chrome's focused window, from Chrome's tab-activation and window-focus events and a fresh query of the last focused window and its active tab. It reads only tab and window IDs and the active and focused flags: no tab title, URL or page content, and no `tabs` permission. These values stay in the worker's memory and are discarded with it; with this setting off and no service checked for system notifications (which ask Chrome the same way before showing one), Chrome is not asked. An item to review whose tab stays in front for that delay is acknowledged locally, exactly like selecting seen: it records that the tab was in front of you, never that the task was verified or approved. The chosen delay is a preference, saved locally with the others and included in the export's settings.

Unreleased, off by default: optional system notifications. In Settings you choose the services, Claude and/or ChatGPT, for which Pilovo may show a notification from your operating system; checking the first one asks Chrome for the optional `notifications` permission, from your click. A notification is created only for a new item to review on a checked service, and not for the tab you are looking at (Pilovo checks which tab is active in the focused window with the same IDs and flags as automatic seen). It contains only the service name, a fixed reason (response available, input requested or error visible), the worker's session number, the word Pilovo and the extension's icon. It never contains a session name, tab title, URL, prompt, response or other page content, and nothing is sent over the network. Pilovo keeps only the notification's opaque ID (made of two random identifiers) in the service worker's memory, and clears the notification when the item is seen or replaced, when its evidence stays lapsed for more than 35 seconds, when the tab navigates or closes, when site access is removed or when you uncheck the service; a restarted worker clears the ones a previous one left. Unchecking the last service clears them before Chrome's permission is removed. If the permission is removed another way, Chrome no longer lets Pilovo clear notifications already shown: your system may keep them until you dismiss them, and Pilovo clears them if you allow notifications again. Your operating system, not Pilovo, displays notifications and may keep them in its notification center, show them on a lock screen or mirror them to other devices according to its own settings; such copies are outside Pilovo's retention controls. To stop them, uncheck the services in Settings (unchecking the last also removes Chrome's permission), or turn Chrome's notifications off in your operating system's settings; if the permission is removed by other means, Settings shows the services as off. The list of checked services is a preference, saved locally and included in the export's settings.

Removing site access invalidates observations and stops authorization renewals. An observer lease expires logically within 15 seconds, including when a worker restart or missed event prevents immediate cleanup. A throttled/suspended document may run the cleanup callback later, but cannot use an expired lease to continue authorized sampling. Stale evidence becomes unknown. Chrome's background scheduling makes toolbar-badge cleanup best effort, not an exact real-time guarantee. The toolbar badge and, in unreleased source, its color and tooltip show only counts and fixed reason words, never a provider, tab title, URL or conversation content; besides those counts, the tooltip's wording depends only on your saved language preference.

## Manual records are separate

A preparation contains a title, provider, human-declared status, technical identifiers/timestamps, and any mission association or note you enter. The prompt is stored only when you explicitly retain it for that preparation; the choice starts off each time. Otherwise its text stays in the form so you can copy it before closing.

Historical receipts may contain previously supplied title, summary, prompt, links, timeline and review/file-check metadata. These are legacy records with their original provenance, not current observations. Activity observation does not populate preparations or copy conversation content into them.

| Data | Location and control |
| --- | --- |
| Current activity and seen acknowledgment; unreleased source also holds session numbers, tab positions, session names, elapsed durations and, for optional automatic seen or notifications, which tab is in front and the live notifications' IDs | Ephemeral session memory. Observed state and seen acknowledgment are invalidated by revocation/restart and evidence expiry. In unreleased source, durations restart when evidence is lost; session numbers and positions last while the tab stays on that service; a session name lasts while the tab stays open; both are cleared on tab close, revocation of that service or restart. None of them is ever exported |
| Preparations, notes, retained prompts, missions and historical receipts | IndexedDB in your Chrome profile; deletion, retention and purge controls |
| Preferences; unreleased source also stores the services checked for optional notifications | Local extension storage; preserved by history purge |
| Optional system notifications (unreleased, off by default) | Shown by your operating system with the service, reason and session number only; cleared by Pilovo when the item no longer needs review or you uncheck its service; a permission removed outside Settings can leave them for you to dismiss; the system's notification center may keep copies under its own settings |
| Historical anti-replay identities | Minimal deleted-attempt identifiers without their content; preserved by purge |
| Schema 2 JSON export | Downloaded on request; saved records, notes and retained prompts, not live activity |
| Clipboard | Prompt copied only on request; outside Pilovo's retention controls |

History retention defaults to 30 days, adjustable from 1 to 365, and runs while the extension is active. This setting covers saved records, not a durable activity log. Explicitly disabling the legacy `retainPrompts` setting removes retained web and historical prompts. Changing language/theme is not consent.

Pilovo adds no at-rest encryption to storage or exports. Titles and notes can be sensitive even with prompt retention off. Profile access, disk protection and backups are separate responsibilities.

## Network and permissions

There is no Pilovo backend, cloud account, sync, advertising, remote telemetry or model API call. Opening a provider contacts its site normally; sending a prompt remains your action in that site. Provider and GitHub visits are subject to those services' own policies.

| Permission | Reason |
| --- | --- |
| `storage` | Local preferences/storage access |
| `sidePanel` | Chrome side panel |
| `alarms` | Saved-history retention and best-effort freshness watchdog |
| `scripting` | Dynamically activate and sample the local isolated observer after permission |
| Optional `https://chatgpt.com/*` | ChatGPT tab recognition, bounded status observation and focus |
| Optional `https://claude.ai/*` | Claude tab recognition, bounded status observation and focus |
| Optional `notifications` (unreleased) | System notifications for the services you check, off by default; requested from your click, removed with the last service |

The optional grants are requested **per provider**, from an explicit action. Denial leaves official-site navigation available. Revocation does not erase your manually saved history. There is no global `tabs`, `management`, `nativeMessaging` or broad host permission, and `notifications` (unreleased) is only optional, requested from your click in Settings and never by the background worker. No static content script is declared; scripts are registered dynamically with session-only registrations after a grant. All executable code ships in the extension. Keyboard shortcuts are declared through Chrome's `commands` manifest key, which is not a permission and grants no site access; the panel reads the configured shortcut text locally from Chrome. So that the shortcut can open the side panel, the worker keeps only the last focused browser window's numeric ID in memory. Optional automatic seen (unreleased) likewise reads only tab and window IDs and the active and focused flags, in memory.

## Erasure and migration

Delete a preparation or purge history to remove the corresponding saved content. Uninstall to remove remaining preferences and minimal historical identifiers too. Exports, backups, clipboard and provider conversations require separate deletion.

Saved records persist across versions only under the same extension identity/profile. A new identity has separate storage; import and automatic cross-extension merging are not implemented. Stable database/protocol identifiers are retained. Pilovo does not uninstall an independently installed historical companion.

Before any store submission, compare this notice against the exact artifact and the store's current user-data requirements. Publication remains a separate review gate.