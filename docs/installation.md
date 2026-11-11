# Install Pilovo 0.4.0 Preview in Chrome

English · [Français](installation.fr.md) · [README](../README.md) · [FAQ](faq.md)

Pilovo 0.4.0 is a Chrome extension installed manually: download `Pilovo_Chrome_v0.4.0.zip` from the [v0.4.0 prerelease](https://github.com/alebgl77/pilovo/releases/tag/v0.4.0), extract it, open `chrome://extensions`, turn on **Developer mode**, then choose **Load unpacked** and select the folder that contains `manifest.json`. It needs Chrome 120 or later. There is no Chrome Web Store listing or approval and no automatic update. You use your own ChatGPT or Claude web account; Pilovo's core is free under MIT and needs no account, API key or companion.

Last reviewed: 11 November 2026.

## Release ZIP

1. Download `Pilovo_Chrome_v0.4.0.zip` from the [v0.4.0 prerelease](https://github.com/alebgl77/pilovo/releases/tag/v0.4.0), or build from source below. To check the archive, compare its SHA-256 with `Pilovo_SHA256_v0.4.0.json` from the same release; a checksum identifies the bytes, not the publisher.
2. Extract it to a folder you will keep. That folder must contain `manifest.json` directly.
3. Open `chrome://extensions` and turn on **Developer mode**.
4. Choose **Load unpacked**, select the folder, then pin Pilovo in Chrome's extensions menu.
5. Open Pilovo. A fresh installation has no fabricated activity or sample history.

Node.js, Python, a CLI and a native companion are unnecessary to use the ZIP. This distribution has no automatic updater. Developer-mode notices are normal.

## First minute

Connect ChatGPT or Claude from Pilovo (**Connect** button). The optional site grant applies to that provider only; you can grant the other later. If you decline, you can still open the service from Pilovo. Open its web app and send your own prompt. Pilovo observes supported status controls without collecting the conversation.

Working requires recognized evidence. Response ready (**Response available**) requires witnessed work followed by stable ready evidence; it does not prove the task succeeded. Unknown (rows show **Observation interrupted**) means evidence is absent, inaccessible, stale or not supported by the current adapter; it does not mean the agent stopped. Use focus to inspect the provider directly. Marking an attention item seen only acknowledges it locally. Unreleased source adds [elapsed durations](#elapsed-durations) and [stable session numbers, positions and names](#session-numbers-positions-and-names).

Remove a site's access through Pilovo or Chrome's extension controls. Revocation invalidates observations and stops renewals; a local lease expires within 15 seconds logically. A suspended page may execute its cleanup later. The toolbar badge is last-observed attention, with best-effort expiry. The badge itself is not an OS notification; see [System notifications](#system-notifications) for the unreleased opt-in. Unreleased source adds [badge colors and a summary tooltip](#badge-colors-and-summary).

The [compatibility record](compatibility.md) lists the pilot's limits. Provider subscriptions and quotas remain separate. For common problems, see [Troubleshooting](faq.md#troubleshooting).

## Build from source

From the clone or Source ZIP root, use Node.js 22.12+:

```sh
npm ci
npm test
npm run build
```

Load `dist/` using the steps above. [Release checks](RELEASE.md) cover packaging and validation. The default build excludes the historical companion. Building from source is the only way to use the unreleased features below.

## Updating and removing

Export saved preparations before changing installations. Replace files in the existing unpacked folder and click **Reload** in `chrome://extensions`. Keep the extension identity/profile to preserve saved history. A different path or identity may create separate storage; cross-extension import is not implemented. Live activity is ephemeral and needs fresh observation after restart.

Uninstall removes extension storage. Exports, backups, clipboard, provider conversations and independently installed historical companions remain separate. See [Privacy](privacy.md).

## Unreleased features (build from source)

The sections below describe features in the current source that are not in the 0.4.0 archive.

### Keyboard shortcuts

These shortcuts are unreleased: they are available when you build from source, not in the 0.4.0 archive.

| Command | Default | Effect |
| --- | --- | --- |
| Go to the next item to review | `Alt+Shift+J` (`Option+Shift+J` on macOS) | Focuses the earliest unacknowledged attention after the same revalidation as **Open session**, moving on if it no longer needs review; opens the side panel when nothing needs review |
| Mark all items to review as seen | None | Marks every current attention as seen locally; it verifies nothing and controls nothing |

To assign, change or remove a shortcut, open `chrome://extensions/shortcuts`, find Pilovo and edit its field. Chrome may leave the suggested `Alt+Shift+J` unassigned, for example when another extension already uses it; the panel then hides its shortcut hint until you assign one. Shortcuts are Chrome commands, not permissions, and grant no site access. When two or more items need review, the panel also offers **Mark all as seen**. Like a single acknowledgment, it is local and only means you noticed them.

### Automatic seen

This setting is unreleased: it is available when you build from source, not in the 0.4.0 archive. It is off by default.

In **Settings**, under **Activity**, **Mark as seen automatically** offers **Off**, **5 s**, **15 s** and **30 s**. When set, an item to review is marked as seen after its own tab has stayed the active tab of the focused Chrome window for that delay, with or without the side panel open beside it. Pilovo's full-page view, another tab or window, or another application in front does not count. A tab or window switch, leaving Chrome, navigation, closing the tab, removing that site's access, a new signal in the tab or a manual acknowledgment stops the wait; it restarts in full when the tab is in front again, and Pilovo asks Chrome again just before marking. The activity page's footer then states the delay. Seen means you noticed the item, not that the task succeeded; it approves and verifies nothing. Only tab and window IDs and their active and focused flags are read, in memory; no permission is added. The setting itself is saved with your other preferences and included in the export.

### System notifications

This setting is unreleased: it is available when you build from source, not in the 0.4.0 archive, which sends no OS notifications. It is off by default.

In **Settings**, under **Activity**, **System notifications** has one checkbox per service, **Claude** and **ChatGPT**. Check a service to enable it. For the first one, Chrome asks whether Pilovo may show notifications (its optional `notifications` permission); accept to continue. If you refuse, the setting stays unchanged and Pilovo says so; you can check the box again later. Pilovo then shows a notification from your operating system when a new item to review appears for a checked service in a tab you are not looking at. The tab you are looking at is the active tab of the focused Chrome window. The notification contains only the service, the reason (response available, input requested or error visible) and the session number, for example **ChatGPT** · *Input requested · session 2*; a notification never contains a session name, tab title, address or conversation content. There is none for an item that was already there when you checked the service. When Chrome slows a background tab and the item's evidence lapses, the notification stays for up to 35 seconds and keeps standing for the same signal if Pilovo samples it again in that tab meanwhile, without notifying twice. Clicking it clears it and opens that session after the same revalidation as **Open session** (sampling the tab again first if its evidence had lapsed) and does not mark it as seen; seeing the item (by hand, **Mark all as seen** or automatic seen), a newer signal, evidence lapsed for more than 35 seconds, navigation, closing the tab, removing that site's access or unchecking the service clears it.

To turn notifications off, uncheck the services; unchecking the last one clears Pilovo's notifications, then removes Chrome's permission. You can also turn Chrome's notifications off in your operating system's settings. If the permission is removed another way, for example in Chrome's extension settings, Chrome no longer lets Pilovo clear notifications already shown: dismiss them yourself, or allow notifications again and Pilovo clears them. Settings then shows both services as off and explains how to turn them back on. Your operating system decides how notifications appear and may keep them in its notification center.

### Elapsed durations

This feature is unreleased: it is available when you build from source, not in the 0.4.0 archive.

A working row shows how long that work has been observed, for example **Working for 4 min**; an item to review, seen or not, shows how long its signal has been shown, for example **Available for 2 min**. Durations have minute precision and are computed in the panel's memory from the moment Pilovo observed the current state in that page. They are never saved, exported or sent. Because the evidence model is conservative, a duration restarts whenever Pilovo loses the evidence for that state: no recognized signal, a failed check of the page, expired evidence, navigation or reload, or a service-worker restart. It can therefore be shorter than the real time and is not a provider-reported generation time. When only the panel cannot confirm activity (a failed refresh, the activity service unavailable, or a site access change in progress), durations are hidden; they come back unchanged once fresh data confirms the same continuous observation.

### Session numbers, positions and names

This feature is unreleased: it is available when you build from source, not in the 0.4.0 archive. In 0.4.0, rows already show a session number per service, which can change when other tabs close.

Each row keeps a stable number per service, for example **Claude · session 3**. Pilovo assigns it when it first observes the tab and keeps it while that tab stays open on that service, even when other tabs close or the page navigates. Numbering starts again after the extension's service worker restarts, and a tab that leaves the service and comes back gets a new number. A secondary line gives the tab's position in its window, for example **Tab 4**, and adds **other window** when the tab is not in the window showing Pilovo. To tell sessions apart, select the pencil button (**Name this session**) and type a name of up to 40 characters, for example *Contract review*; the row then reads **Contract review — Claude · session 3**, keeping the number that system notifications use. Enter or leaving the field applies the name, Escape cancels, and an empty name removes it. Naming needs current evidence, as opening a session does: a row whose evidence has expired can be renamed again once Pilovo observes it anew. The name is kept only in the extension's memory for that tab: it survives navigation in the tab, is shown only while the tab is on the service where you named it, and disappears when the tab closes, when you remove that site's access or when the service worker restarts. It is never stored, exported, sent, or shown on the toolbar badge or its tooltip. Pilovo still never shows tab titles or addresses.

### Badge colors and summary

This feature is unreleased: it is available when you build from source, not in the 0.4.0 archive.

The count takes the color of the most urgent reason, red for a visible error, amber-brown for an input request, olive for a response available. With nothing to review but work observed, it shows `…` on gray instead of a count; seen items, waiting and unknown sessions never light it. Hovering Pilovo's icon gives the same summary in text, in the language chosen in Pilovo's settings, for example *Pilovo — 3 to review, including 1 visible error · 1 working*. The badge and its tooltip contain only counts and these fixed words, never a title, URL or conversation content.

### Background evidence renewal

This feature is unreleased: it is available when you build from source, not in the 0.4.0 archive.

Pilovo's page observer asks for a new reading when the page changes and on a 5-second timer, and a reading is valid for 15 seconds. Chrome slows the timers of background tabs, down to about one wake-up per minute. Without renewal, the state of a background tab can therefore lapse between readings: observed work loses its witness, so its end is not announced, and an item to review that you have not seen yet can leave the list. In the current source, the extension's service worker, whose timers Chrome does not slow with tab visibility, reads the tab again by itself while it shows observed work or an item to review that you have not marked as seen: about every second at the start of a run, then less often, but at least every 10 seconds. It reads the same status indicators as any other reading, with the same checks, and each reading still expires after 15 seconds. Tabs at rest, unknown tabs and items already seen are not renewed. Chrome can still freeze or discard a tab or stop the service worker, and a reading can fail: the state then becomes **Observation interrupted** as before, an item to review lost this way does not come back, and no real-time guarantee is made. While such a tab exists, the service worker stays active.

Measured on 11 November 2026 with Chrome for Testing 153, a synthetic page in a hidden tab and the panel closed: without renewal, a **Response available** item left the toolbar badge 15 to 41 seconds after it was raised; with renewal, it stayed for the 150 seconds observed. This is one synthetic measurement, not a test on a provider session and not a reliability rate.

### Observation quality counters

This feature is unreleased: it is available when you build from source, not in the 0.4.0 archive.

**Settings** › **Local diagnostics** › **Tab observation** shows five counts for the current Chrome session, all services together: responses announced; work observed again within 5 seconds of an announcement; announcements lost before being seen; evidence lost during work; ends of work not observed. They let you see, on your own machine, how observation behaves, for example whether items to review are lost while their tabs are in the background. They are indications, not a reliability rate: a new message sent right after an answer also counts as work observed again, and a generation you stop by hand counts as evidence lost during work. A tab that Chrome freezes or discards counts as lost evidence; a page you navigate or close does not. The counters are numbers only, with no page content, address, tab or time. Chrome keeps them in the extension's session memory: they are not written to disk, exported or sent, and they restart from zero when Chrome closes or the extension is reloaded. Disconnecting a site clears its counts.

## Installation simple en français

Ce guide existe en version française complète : [Installer Pilovo 0.4.0](installation.fr.md).
