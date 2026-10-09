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

The toolbar badge reflects the last observed, unacknowledged attention. Evidence has a 15-second logical lifetime. Background tabs may be throttled; Chrome may suspend its service worker. The panel checks freshness, but badge cleanup uses a best-effort watchdog and is not a strict real-time notification guarantee. There are no OS notifications.

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

The observer reads a limited set of DOM controls and dedicated status indicators. It does not collect full conversations, prompt or response text, tab titles, screenshots, cookies or credentials. Activity metadata stays local and ephemeral. No backend, model API, remote telemetry or cloud sync is used. Revocation invalidates access; the observer's lease has a logical cutoff of at most 15 seconds, even if Chrome delays execution of cleanup. See [Privacy](docs/privacy.md) and the [technical contract](docs/core-contract.md).

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
