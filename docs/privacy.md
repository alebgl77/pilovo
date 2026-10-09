# Privacy and local data — Briefoak 0.3.0

Updated 9 October 2026. This notice describes the shipped extension; it is not a legal certification or a Chrome Web Store approval. Maintainer contact: [GitHub Issues](https://github.com/alebgl77/briefoak/issues) for non-sensitive questions. Read [Security](../SECURITY.md) before reporting sensitive information.

## Data processed

A web preparation contains a title, provider, human-declared status, technical identifiers/timestamps, and optionally a mission association or note you enter. The prompt is stored only when you explicitly retain it for that preparation. This choice starts off for every new preparation. Otherwise its text stays in the current form to be copied before closing.

Historical receipts may contain previously supplied source, attempt, title, timeline, summary, question, links, review and file-check metadata. Their provenance stays visible; they are not new observations of web activity.

Optional provider-site access exposes matching tab metadata for recognition and navigation. Briefoak reads no conversation content, page DOM, account cookies, credentials, tokens, passwords or provider responses. It does not inspect other extensions or native applications. An open tab does not establish authentication.

## Storage and controls

| Data | Location and control |
| --- | --- |
| Preparations, notes, retained prompts, missions and historical receipts | IndexedDB in your Chrome profile; deletion, retention and purge controls |
| Preferences | Local extension storage; preserved by history purge |
| Historical anti-replay identities | Minimal identifiers of deleted attempts, without their content; preserved by purge |
| Recognized tabs | Current navigation state; no conversation copy |
| Schema 2 JSON export | Downloaded only on request; includes web/history records, notes and retained prompts; managed by you afterwards |
| Clipboard | Prompt copied only on request; outside Briefoak's retention controls |

Retention defaults to 30 days, can be set from 1 to 365 days, and runs while the extension is active. Backups can retain copies. Explicitly turning off the historical `retainPrompts` setting removes retained prompts, including web prompts. Changing language or theme is not a new consent.

Briefoak adds no at-rest encryption to its database or exports. Your profile, operating-system account and disk protections are separate. Titles and notes may also be sensitive, even when prompt retention is off.

## Network and permissions

There is no Briefoak backend, cloud account, sync, advertising, remote telemetry or model API call. Copying does not send the prompt to a provider. Opening a provider tab contacts that site normally; you paste and send there yourself under its terms and settings. GitHub handles visits to this repository under GitHub's own policies.

| Permission | Reason |
| --- | --- |
| `storage` | Local extension storage/preferences |
| `sidePanel` | Chrome side panel |
| `alarms` | Local retention maintenance |
| Optional `https://claude.ai/*`, `https://chatgpt.com/*` | Matching tab recognition and return navigation, requested together |

Denial leaves official-home-page navigation available. Revocation stops recognition without erasing history. No global `tabs`, `scripting`, `management`, `nativeMessaging`, broad site access or content script is declared. Chrome's [Tabs documentation](https://developer.chrome.com/docs/extensions/reference/api/tabs) explains metadata access through host grants.

## Erasure and migration

Delete a preparation or purge history to erase the corresponding stored content. To remove remaining preferences and minimal historical identifiers too, uninstall the extension after exporting anything you need. Exports, backups, clipboard contents and provider conversations must be managed separately.

History can persist across versions only under the same extension identity/profile. A new identity has separate storage; automatic cross-extension import and export re-import are not implemented. Briefoak does not remove an independently installed historical companion or its files.

Before a store submission, re-check this notice against the exact submitted artifact and applicable [Chrome Web Store user-data requirements](https://developer.chrome.com/docs/webstore/program-policies/user-data-faq).
