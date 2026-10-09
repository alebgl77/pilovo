# Web integrations — Briefoak 0.3.0

Destinations: [Claude](https://claude.ai/) and [ChatGPT](https://chatgpt.com/), using your ordinary web accounts. No API, CLI or companion is required.

## Optional tab recognition

Briefoak requests optional access to `https://claude.ai/*` and `https://chatgpt.com/*` together, following an explicit user action. After a grant, matching tabs are recognized at panel opening, focus changes and tab changes.

Chrome exposes matching tab metadata through site permission without global `tabs` permission; see [Chrome Tabs](https://developer.chrome.com/docs/extensions/reference/api/tabs). No conversation DOM, cookies, credentials or provider output is read. Tab presence is not evidence of authentication, a subscription, a selected model or active work.

Without a grant, or after revocation, tab presence is unknown. The fixed official home page can still be opened explicitly. Other origins, subdomains, extensions and native applications are not discovered.

## Prepare, copy, open, send

1. Choose a provider, title, prompt and optional mission.
2. Prompt retention begins off. Without opting in, copy the prompt before closing its form.
3. Copy explicitly; separately open/focus the provider.
4. Paste and send in the provider's own interface.
5. Manually mark sent/completed in Briefoak and optionally add a note.

No prompt travels in a URL or is injected into a page. Copy/open/focus never change the preparation's status. Briefoak cannot see results, errors, approval requests or stopped execution. Provider access rules and quotas apply.

## Historical records

Earlier native receipts keep their original source and provenance in the same database. They are not converted into web declarations. Native connectors are disabled in the current product, regardless of historical settings.

The `companion/` directory, native tests and install/package scripts are historical reference. They are not part of the default build or the Chrome ZIP. Historical packagers depend on their original local delivery environment and are not the current release workflow; use `npm run package` for Briefoak.

A different extension identity has separate storage. Export before uninstalling; there is no automatic merge or import between identities. Updating Briefoak does not remove old companion installations, MCP configurations, provider data or exports.
