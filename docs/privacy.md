# Privacy and local data — Pilovo 0.4.0 Preview

Updated 10 October 2026. This notice describes the preview's intended data boundaries; it is not a legal certification or Chrome Web Store approval. Contact: [GitHub Issues](https://github.com/alebgl77/pilovo/issues) for non-sensitive questions; [Security](../SECURITY.md) for sensitive reports.

## Activity observation

After you grant access to a provider individually, Pilovo dynamically registers a bundled content observer in Chrome's isolated world on that exact provider origin. It examines a bounded set of DOM controls and dedicated status indicators to classify supported activity. This is page-DOM access: the former Briefoak 0.3.0 statement that no page content is read does not describe this preview.

Pilovo does not collect full conversations, prompt or response text, tab titles, screenshots, account cookies, credentials, tokens or passwords. No whole-page text is read. Dedicated generic status labels may be matched locally; conversation content is not included in observer messages. Navigation uses tab identity and validates the permitted provider origin; conversation URLs are not retained as activity history.

Activity consists of temporary provider/tab/window identities, observed state, local observation/freshness times, attention reason, the attention's raise time on a local monotonic clock and local seen acknowledgment. It stays in session memory, without durable activity history or activity export. Restart requires fresh evidence. It does not inspect other extensions or native applications. An open tab does not prove authentication or active work.

Removing site access invalidates observations and stops authorization renewals. An observer lease expires logically within 15 seconds, including when a worker restart or missed event prevents immediate cleanup. A throttled/suspended document may run the cleanup callback later, but cannot use an expired lease to continue authorized sampling. Stale evidence becomes unknown. Chrome's background scheduling makes toolbar-badge cleanup best effort, not an exact real-time guarantee.

## Manual records are separate

A preparation contains a title, provider, human-declared status, technical identifiers/timestamps, and any mission association or note you enter. The prompt is stored only when you explicitly retain it for that preparation; the choice starts off each time. Otherwise its text stays in the form so you can copy it before closing.

Historical receipts may contain previously supplied title, summary, prompt, links, timeline and review/file-check metadata. These are legacy records with their original provenance, not current observations. Activity observation does not populate preparations or copy conversation content into them.

| Data | Location and control |
| --- | --- |
| Current activity and seen acknowledgment | Ephemeral session memory; invalidated by revocation/restart and evidence expiry |
| Preparations, notes, retained prompts, missions and historical receipts | IndexedDB in your Chrome profile; deletion, retention and purge controls |
| Preferences | Local extension storage; preserved by history purge |
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

The optional grants are requested **per provider**, from an explicit action. Denial leaves official-site navigation available. Revocation does not erase your manually saved history. There is no global `tabs`, `management`, `nativeMessaging`, `notifications` or broad host permission. No static content script is declared; scripts are registered dynamically with session-only registrations after a grant. All executable code ships in the extension. Keyboard shortcuts are declared through Chrome's `commands` manifest key, which is not a permission and grants no site access; the panel reads the configured shortcut text locally from Chrome. So that the shortcut can open the side panel, the worker keeps only the last focused browser window's numeric ID in memory.

## Erasure and migration

Delete a preparation or purge history to remove the corresponding saved content. Uninstall to remove remaining preferences and minimal historical identifiers too. Exports, backups, clipboard and provider conversations require separate deletion.

Saved records persist across versions only under the same extension identity/profile. A new identity has separate storage; import and automatic cross-extension merging are not implemented. Stable database/protocol identifiers are retained. Pilovo does not uninstall an independently installed historical companion.

Before any store submission, compare this notice against the exact artifact and the store's current user-data requirements. Publication remains a separate review gate.