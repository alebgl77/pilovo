# Pilovo FAQ: ChatGPT and Claude tab activity in Chrome

English · [Français](faq.fr.md) · [README](../README.md)

Answers about Pilovo 0.4.0 Preview. Features marked unreleased exist only in the current source: build from source to use them. Last reviewed: 11 October 2026.

## About Pilovo

### What is Pilovo?

Pilovo is an open-source Chrome extension (Manifest V3, MIT license) that shows whether the ChatGPT and Claude web tabs you authorize are working, have a response ready, need your attention or cannot be confirmed. It lists them in Chrome's side panel and counts the items to review on its toolbar badge, so you can return to the right tab. Pilovo observes a limited set of status indicators locally, with optional access per site, and does not collect your prompts, responses or tab titles.

Version 0.4.0 is an experimental preview installed manually from GitHub; see the [README](../README.md).

### Is Pilovo an official ChatGPT or Claude extension?

No. Pilovo is an independent open-source Chrome extension, not affiliated with, endorsed by or sponsored by the companies that operate ChatGPT or Claude; those names only identify the services Pilovo observes. Provider account rules, plans and quotas still apply.

### Is Pilovo free? Do I need an account or an API key?

The core of the Pilovo Chrome extension is free under the MIT license, and you need no Pilovo account, API key or companion app. You keep using your own ChatGPT or Claude web account, with its plans and quotas. Node.js is needed only to build from source.

### Is Pilovo available in English? Why does it open in French?

Yes: Pilovo's interface is available in English and French; it opens in French by default, and the language menu at the top of Pilovo's page, or **Settings** › **Interface** › **Language**, switches it to English. Its adapters recognize the English and French interfaces of ChatGPT and Claude. A provider interface in another language may not be recognized, and its row then shows **Observation interrupted**.

### What was Briefoak?

Briefoak was this project's earlier name, last released as 0.3.0; Pilovo's activity observation begins with 0.4.0, and Briefoak releases and their claims remain historical.

## Knowing when a response is ready

### How do I know when ChatGPT or Claude has finished responding in another tab?

Install the Pilovo Chrome extension and connect the service, then keep Chrome's side panel open or watch Pilovo's toolbar badge: when a response has finished generating, its row moves to **To review** with **Response available**, and the badge counts the items you have not marked as seen. Pilovo reports this only after observing the tab working and then a stable ready signal; **Open session** brings that tab to the front. A response that finished before Pilovo observed the tab working is not reported as ready. See [What the states mean](../README.md#what-the-states-mean).

### Does Pilovo send a notification or play a sound when ChatGPT or Claude finishes?

Not in 0.4.0: the released preview of the Pilovo Chrome extension shows the side panel and the badge count, with no system notification and no sound. The current source adds optional system notifications per service, off by default (unreleased; build from source), containing only the service, the reason and the session number. Your provider may offer its own notifications, which Pilovo does not change or replace. With the unreleased notifications, your operating system decides how they appear and whether they make a sound; Pilovo itself plays no sound. See [System notifications](installation.md#system-notifications).

### Do I need Pilovo if ChatGPT or Claude can notify me?

Not necessarily. Your provider may offer its own notifications; Pilovo does not read, change or replace them. Pilovo is a separate local view of your authorized ChatGPT and Claude tabs in one panel, with unknown states shown as such; you can use either or both.

### Can Pilovo track several ChatGPT and Claude tabs at once?

Yes: the Pilovo Chrome extension gives each observed ChatGPT or Claude tab on a site you authorize its own row in the side panel, for example **ChatGPT · session 2**, with its observed state, and items to review come first. Pilovo follows tabs, not conversation content: open each conversation in its own tab to follow it separately. Each site needs its own grant, and access to one does not enable the other. In 0.4.0 the panel numbers sessions from the tabs it currently lists, so a number can change when another tab closes. Stable numbers, the tab's position and names you type exist only in the current source (unreleased; build from source). See [Session numbers, positions and names](installation.md#session-numbers-positions-and-names).

### Does "Response available" mean my task succeeded?

No. **Response available** (response ready) means generation ended as observed in the page; Pilovo does not check the answer. Review it in the service, because your task may still need work. **Seen** only records that you noticed the item. Error evidence takes precedence: on 10 October 2026 a Claude page kept a finished announcement after a quota-blocked request, recorded as a counterexample in the [compatibility record](compatibility.md).

### What do Working, To review, Waiting and Observation interrupted mean?

**Working** means a recognized indicator shows a response being generated; **To review** means a response is available, your input is requested or an error is visible; **Waiting** means the page is ready for your next message; **Observation interrupted**, counted as **Unconfirmed**, means Pilovo cannot confirm the current state. Working, To review and Waiting come only from recognized indicators in the page. See [What the states mean](../README.md#what-the-states-mean).

### Is there a keyboard shortcut to jump to the tab that needs me?

Not in Pilovo 0.4.0. Unreleased (build from source): `Alt+Shift+J` (`Option+Shift+J` on macOS) goes to the next item to review, and you can change it at `chrome://extensions/shortcuts`. When nothing needs review, it opens the side panel. See [Keyboard shortcuts](installation.md#keyboard-shortcuts).

### Does Pilovo show how long a response has been running?

Not in 0.4.0. Unreleased (build from source): rows show elapsed durations to the minute, such as **Working for 4 min**; they restart whenever evidence is lost, so they can be shorter than the real time and are not provider-reported generation times. See [Elapsed durations](installation.md#elapsed-durations).

## Privacy and permissions

### Does Pilovo read my conversations?

No. After you grant a site, the Pilovo Chrome extension's observer reads a limited set of page controls and dedicated status indicators there; it does not collect full conversations, prompt or response text, tab titles, screenshots, cookies or credentials. Nothing is sent to a server: Pilovo has no backend or telemetry. Reading those indicators is still page access, which is why Chrome asks you to allow each site. See [Privacy](privacy.md).

### Can a Chrome extension read my ChatGPT chats?

An extension with access to chatgpt.com or claude.ai can technically read those pages, so check what it requests and what its code does before granting access. Pilovo asks for access to each site separately, only after you click, and you can remove that access at any time; its source code is public under the MIT license. See [What Pilovo can see](../README.md#what-pilovo-can-see).

### Which permissions does Pilovo request?

The Pilovo Chrome extension requires exactly four permissions: `storage`, `sidePanel`, `alarms` and `scripting`. Access to `https://chatgpt.com/*` and `https://claude.ai/*` is optional and requested separately for each site; the current source adds just one optional permission, `notifications` (unreleased), requested only when you click. Pilovo never requests `tabs`, access to all sites or `nativeMessaging`; see [What Pilovo can see](../README.md#what-pilovo-can-see).

### Why does Chrome say Pilovo can read and change data on chatgpt.com or claude.ai?

That is how Chrome describes access to one site; Pilovo requests it only when you enable that site with a click. Pilovo uses it to recognize that site's tabs, read supported status indicators and bring a tab to the front; it never sends prompts or approves provider actions. You can remove it from Pilovo or in `chrome://extensions` at any time.

### Does Pilovo send data anywhere or use telemetry?

No: Pilovo has no backend, cloud account, sync, advertising, remote telemetry or model API. Observed activity stays in the extension's memory and is discarded on restart; opening ChatGPT or Claude contacts those sites as usual. See [Privacy](privacy.md).

### Does Pilovo store my prompts?

Not for activity: observed activity stays in memory and is discarded on restart. Manual preparations keep a prompt only if you opt in for that preparation, which is off by default. Saved records stay in your Chrome profile, are not encrypted by Pilovo, and are deleted after 30 days by default (adjustable from 1 to 365); this cleanup runs only while the extension is active. See [Privacy](privacy.md).

### How do I remove Pilovo's access to a site?

Select **Disconnect** for that service under **Connected services** in Pilovo, or remove the site access in Chrome's extension settings. Observations are then invalidated, renewals stop and the observer's lease ends logically within 15 seconds. Saved preparations are not erased.

## Install and updates

### Is Pilovo on the Chrome Web Store?

No. The Pilovo 0.4.0 Chrome extension is a GitHub prerelease that you load with **Load unpacked**, without automatic updates. See the [installation guide](installation.md).

### How do I install Pilovo from GitHub?

Download `Pilovo_Chrome_v0.4.0.zip` from the [v0.4.0 prerelease](https://github.com/alebgl77/pilovo/releases/tag/v0.4.0), extract it to a folder you keep, open `chrome://extensions`, turn on **Developer mode**, choose **Load unpacked** and select the folder that contains `manifest.json`. Chrome 120 or later is required, and Chrome's developer-mode notices are normal. `Pilovo_SHA256_v0.4.0.json`, in the same release, lists the archive's SHA-256 checksum, which identifies the bytes, not the publisher. See the [installation guide](installation.md).

### How do I update or uninstall Pilovo?

Export your saved preparations first, replace the files in the same unpacked folder, then click **Reload** on Pilovo's card in `chrome://extensions`. Keep the same folder and Chrome profile to keep your saved history. Uninstalling removes the extension's storage; your exports, backups and provider conversations are separate.

### How do I build Pilovo from source?

With Node.js 22.12 or later, run `npm ci`, `npm test` and `npm run build`, then load the `dist/` folder with **Load unpacked**. This is the only way to use the unreleased features. See [Build from source](../README.md#build-from-source).

## Compatibility

### Which browsers, apps and sites does Pilovo work with?

The Pilovo Chrome extension is made for Chrome 120 or later and observes only `chatgpt.com` and `claude.ai` web tabs; it does not observe the ChatGPT or Claude desktop or mobile apps, or other AI websites. Other browsers, including other Chromium-based browsers, are not tested or claimed; Firefox and Safari are not supported.

### Does Pilovo work with ChatGPT agent, Claude in Chrome, Claude Code or Codex?

No: they are not supported as dedicated integrations. Ordinary web indicators do not prove an agent's internal tasks, and no connector to external processes is bundled. See the [compatibility record](compatibility.md).

## What Pilovo does not do

### Is Pilovo a sidebar chatbot or a tab manager?

No: Pilovo is a Chrome extension whose side panel shows the state of your own ChatGPT and Claude tabs; it does not embed a chat, send prompts, call a model API, or close, group or reorder tabs.

### Can Pilovo stop or launch generation, or send prompts?

No: Pilovo shows observed state, brings the matching tab to the front and records local acknowledgments, but it never sends or queues prompts, stops, pauses, resumes or launches generation, or approves provider actions.

### Can Pilovo keep a ChatGPT or Claude tab running in the background?

No: Chrome may slow or discard background tabs, and Pilovo, a Chrome extension that only observes status indicators, does not change that. When evidence lapses, the row shows **Observation interrupted** rather than a guess.

### Can Pilovo export or back up my ChatGPT or Claude conversations?

No: Pilovo does not read conversations, so it cannot export them. Its JSON export covers what you saved in Pilovo: preparations (with any prompts you chose to retain), missions, notes, archives and settings.

### Does Pilovo show tab titles or conversation names?

No: rows show the service, a session number and the observed state, never a tab title or address. Session names (unreleased; build from source) are typed by you and stay in the extension's memory.

### Does Pilovo sync across devices or offer a team view?

No: Pilovo has no account and no sync; its data stays in your Chrome profile on this device, apart from exports you download. With the unreleased system notifications, your operating system may keep copies of them or mirror them to other devices according to its own settings.

## Troubleshooting

### Why does Pilovo show "Observation interrupted"?

Pilovo cannot confirm the tab's current state: no recognized signal, evidence older than 15 seconds, a background tab slowed by Chrome, or an interface the adapter does not recognize. It does not mean that generation finished or stopped; switch to the tab so Pilovo can observe it again.

### Why does the toolbar badge not clear right away?

The badge counts last-observed items to review that you have not marked as seen, and Chrome can delay Pilovo's background work, so clearing it is best effort. To update it, open the panel or mark the item as seen.

### Why does Pilovo not detect my ChatGPT or Claude tab?

First check that the service is connected in Pilovo: each site needs its own grant. Then check that the page is on `chatgpt.com` or `claude.ai`. The adapters are experimental and cover the English and French interfaces; a provider page change can show as unknown (**Observation interrupted**) or, until the adapter is updated, as an incorrect state. Report it with the Pilovo and Chrome versions and the steps, without private content, in [GitHub Issues](https://github.com/alebgl77/pilovo/issues).

### Why does Pilovo say "This session could not be opened"?

In Pilovo 0.4.0, **Open session** can fail with this message on an unchanged tab when routine page updates arrive during its check; the fix is in the current source (unreleased; build from source). The message also appears when the tab has closed or changed since the last observation. Select **Refresh** and try again, or switch to the tab yourself.
