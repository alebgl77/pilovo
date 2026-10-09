# Briefoak

**A local prompt desk for Claude & ChatGPT.**

Prepare a clear brief, keep related work together, and remember what you sent. Briefoak is a Chrome side panel for people who work across their existing Claude and ChatGPT web accounts.

![Briefoak — A local prompt desk for Claude & ChatGPT.](docs/media/briefoak-github-banner.png)

[Install](docs/installation.md) · [Français](docs/README.fr.md) · [Privacy](docs/privacy.md) · [Releases](https://github.com/alebgl77/briefoak/releases) · [Contribute](CONTRIBUTING.md)

![Briefoak with an example brief and its manual follow-up](docs/media/screenshots/Briefoak_desktop_mission_synthetic.png)

*Briefoak browser preview with synthetic local examples. Statuses are declared manually; no provider execution is shown.*

## From brief to follow-through

1. **Prepare.** Choose Claude or ChatGPT, write a title and prompt, and optionally group it in a mission. Saving the prompt is a separate choice, off for each new preparation.
2. **Use your web account.** Copy the prompt, open the provider, then paste and send it yourself. Opening an app does not submit anything.
3. **Keep your place.** Mark the preparation sent or completed yourself. Add a local note and return to related work later.

The same workspace opens as a full tab. French and English, light/dark/system themes, search, local notes, missions, JSON export, deletion and retention controls are included.

## Install in Chrome

Chrome 120 or later is required. Download the **Briefoak Chrome ZIP** from [Releases](https://github.com/alebgl77/briefoak/releases), extract it, open `chrome://extensions`, enable Developer mode, and choose **Load unpacked**. Select the folder containing `manifest.json`; pin Briefoak and open its side panel.

If no release asset is available yet, [build from source](#build-from-source). This is an unpacked preview; Briefoak is not listed in the Chrome Web Store. Node.js is needed to build, not to use the extension. No API key, companion, CLI or Briefoak account is required. Your providers' account rules, plans and quotas still apply.

## What Briefoak can see

| Permission | Purpose |
| --- | --- |
| `storage` | Local preferences and extension storage access. Records live in IndexedDB. |
| `sidePanel` | Show the Chrome side panel. |
| `alarms` | Schedule local retention maintenance. |
| Optional `https://claude.ai/*` and `https://chatgpt.com/*` | Recognize matching open tabs and return to them after you grant access. |

Site access is optional and requested for both supported sites together. You can open their official home pages without granting it. Tab presence does not establish login, model choice or activity.

Briefoak does not read conversations, page content, responses, cookies or credentials. It does not send prompts, run agents, call a model API or verify that work was completed. Sent/completed labels are your declarations. There is no backend, remote telemetry or cloud sync. The [technical contract](docs/core-contract.md) describes these boundaries.

## What “local” means

Records stay in your Chrome profile. Briefoak does **not encrypt** that database or downloaded exports. Titles, notes and retained prompts may be sensitive; profile access, device backups and clipboard contents need their own protection.

Prompt retention is off for every new preparation. Without opting in, the prompt stays in the current form so you can copy it before closing; its text is absent from storage and exports. Titles, provider, status, technical identifiers/dates and separately entered notes or mission links are still saved.

History retention defaults to 30 days and runs while the extension is active. JSON export uses schema 2; import and cross-device sync are not implemented. Purge clears history but keeps preferences and minimal historical anti-replay identifiers. Uninstalling removes the extension's remaining local storage; exports, clipboard, backups and provider conversations are separate. See [Privacy](docs/privacy.md).

## Build from source

Use Node.js **22.12+** (CI uses Node 22), npm, and Git for the publication regression fixture. Run these commands in this repository's root:

```sh
npm ci
npm run typecheck
npm test
npm run test:publication
npm run build
npm run package:check
npm run package
```

Load `dist/` as the unpacked extension. Packaging creates versioned Chrome/source ZIPs, license notices and checksums under `release/v<version>/`. It has no Python requirement or dependency on files above the repository. Existing releases are never overwritten. See [Release checks](docs/RELEASE.md).

`npm run dev` opens a local UI preview. Chrome discovery/navigation require the installed extension. The preserved `companion/` code and its scripts/tests are historical reference; the default build and Chrome ZIP do not include a native companion. Internal database/native identifiers retain the old name for compatibility.

## Status and contributing

Version 0.3.0 is an early, manually installed release. [Validation](docs/RELEASE.md) separates executed checks from remaining manual review. No store approval, production certification, user count or provider affiliation is claimed. Claude and ChatGPT belong to their respective owners.

The [positioning and launch notes](docs/positioning-and-launch.md) explain the audience hypothesis and proposed learning plan (French).

Useful first contributions: improve a French/English label with its context; reproduce a keyboard issue with a short sequence; document a permission denial/revocation result with the exact Chrome version. [Contribution guide](CONTRIBUTING.md), [support](SUPPORT.md), [security](SECURITY.md), and the [proposed roadmap](docs/roadmap.md) explain where to start.

Briefoak is available under the [MIT license](LICENSE). Third-party components retain their own licenses; release archives include their notices.
