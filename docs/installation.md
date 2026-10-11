# Install Pilovo 0.4.0 Preview

Use Chrome 120+. Pilovo is a manually loaded preview; no Chrome Web Store listing or approval is claimed. You use your own ChatGPT or Claude web account. Pilovo's core is free under MIT and needs no account, API key or companion.

## Release ZIP

1. Check [Releases](https://github.com/alebgl77/pilovo/releases) for a reviewed `Pilovo_Chrome_v0.4.0.zip`. If none is available, build from source below.
2. Extract it to a folder you will keep. That folder must contain `manifest.json` directly.
3. Open `chrome://extensions` and turn on **Developer mode**.
4. Choose **Load unpacked**, select the folder, then pin Pilovo in Chrome's extensions menu.
5. Open Pilovo. A fresh installation has no fabricated activity or sample history.

Node.js, Python, a CLI and a native companion are unnecessary to use the ZIP. This distribution has no automatic updater. Developer-mode notices are normal.

## First minute

Enable ChatGPT or Claude from Pilovo. The optional site grant applies to that provider only; you can grant the other later. Open its web app and send your own prompt. Pilovo observes supported status controls without collecting the conversation.

Working requires recognized evidence. Response ready requires witnessed work followed by stable ready evidence. Unknown means evidence is absent, inaccessible, stale or not supported by the current adapter; it does not mean the agent stopped. Use focus to inspect the provider directly. Marking an attention item seen only acknowledges it locally. Unreleased source also shows how long a row has been working or showing an item to review, seen or not; that duration restarts whenever evidence is lost, for example after expiry, navigation or a restart. It also gives each row a stable session number per service, the tab's position (with *other window* when it is elsewhere) and a pencil button to name the session while its evidence is current; the name stays in memory only, shown while the tab is on the service where it was given, until the tab closes, that site's access is removed or the service worker restarts, and is never stored or exported.

Remove a site's access through Pilovo or Chrome's extension controls. Revocation invalidates observations and stops renewals; a local lease expires within 15 seconds logically. A suspended page may execute its cleanup later. The toolbar badge is last-observed attention, with best-effort expiry. The badge itself is not an OS notification; see [System notifications](#system-notifications) for the unreleased opt-in. Unreleased source colors it by the most urgent reason (red: visible error, amber-brown: input request, olive: response available), shows `…` while work is observed and nothing needs review, and summarizes the counts in text when you hover the icon, in the language chosen in Pilovo's settings.

The [compatibility record](compatibility.md) lists the pilot's limits. Provider subscriptions and quotas remain separate.

## Keyboard shortcuts

These shortcuts are unreleased: they are available when you build from source, not in the 0.4.0 archive.

| Command | Default | Effect |
| --- | --- | --- |
| Go to the next item to review | `Alt+Shift+J` (`Option+Shift+J` on macOS) | Focuses the earliest unacknowledged attention after the same revalidation as **Open session**, moving on if it no longer needs review; opens the side panel when nothing needs review |
| Mark all items to review as seen | None | Marks every current attention as seen locally; it verifies nothing and controls nothing |

To assign, change or remove a shortcut, open `chrome://extensions/shortcuts`, find Pilovo and edit its field. Chrome may leave the suggested `Alt+Shift+J` unassigned, for example when another extension already uses it; the panel then hides its shortcut hint until you assign one. Shortcuts are Chrome commands, not permissions, and grant no site access.

## Automatic seen

This setting is unreleased: it is available when you build from source, not in the 0.4.0 archive. It is off by default.

In **Settings**, under **Activity**, **Mark as seen automatically** offers **Off**, **5 s**, **15 s** and **30 s**. When set, an item to review is marked as seen after its own tab has stayed the active tab of the focused Chrome window for that delay, with or without the side panel open beside it. Pilovo's full-page view, another tab or window, or another application in front does not count. A tab or window switch, leaving Chrome, navigation, closing the tab, removing that site's access, a new signal in the tab or a manual acknowledgment stops the wait; it restarts in full when the tab is in front again, and Pilovo asks Chrome again just before marking. The activity page's footer then states the delay. Seen means you noticed the item, not that the task succeeded; it approves and verifies nothing. Only tab and window IDs and their active and focused flags are read, in memory; no permission is added.

## System notifications

This setting is unreleased: it is available when you build from source, not in the 0.4.0 archive, which sends no OS notifications. It is off by default.

In **Settings**, under **Activity**, **System notifications** has one checkbox per service, **Claude** and **ChatGPT**. Check a service to enable it. For the first one, Chrome asks whether Pilovo may show notifications; accept to continue. If you refuse, the setting stays unchanged and Pilovo says so; you can check the box again later. Pilovo then shows a notification from your operating system when a new item to review appears for a checked service in a tab you are not looking at. It contains only the service, the reason (response available, input requested or error visible) and the session number. Clicking it opens that session after the same revalidation as **Open session** and does not mark it as seen; seeing the item, a newer signal, evidence lapsed for more than 35 seconds, navigation or closing the tab clears it.

To turn notifications off, uncheck the services; unchecking the last one clears Pilovo's notifications, then removes Chrome's permission. You can also turn Chrome's notifications off in your operating system's settings. If the permission is removed another way, for example in Chrome's extension settings, Chrome no longer lets Pilovo clear notifications already shown: dismiss them yourself, or allow notifications again and Pilovo clears them. Settings then shows both services as off and explains how to turn them back on. Your operating system decides how notifications appear and may keep them in its notification center.

## Build from source

From the clone or Source ZIP root, use Node.js 22.12+:

```sh
npm ci
npm test
npm run build
```

Load `dist/` using the steps above. [Release checks](RELEASE.md) cover packaging and validation. The default build excludes the historical companion.

## Updating and removing

Export saved preparations before changing installations. Replace files in the existing unpacked folder and click **Reload** in `chrome://extensions`. Keep the extension identity/profile to preserve saved history. A different path or identity may create separate storage; cross-extension import is not implemented. Live activity is ephemeral and needs fresh observation after restart.

Uninstall removes extension storage. Exports, backups, clipboard, provider conversations and independently installed historical companions remain separate. See [Privacy](privacy.md).

## Installation simple en français

1. Récupérez l'archive revue **Pilovo_Chrome_v0.4.0.zip**, puis décompressez-la. Si elle n'est pas publiée, construisez les sources avec les commandes ci-dessus.
2. Dans Chrome, ouvrez `chrome://extensions`, activez **Mode développeur** puis cliquez sur **Charger l'extension non empaquetée**.
3. Choisissez le dossier contenant `manifest.json`, épinglez Pilovo et ouvrez son panneau.
4. Activez **un fournisseur** : ChatGPT et Claude demandent chacun une autorisation distincte. Un refus laisse l'ouverture du site officiel disponible.
5. Envoyez une consigne dans votre compte fournisseur. Pilovo indique l'état seulement si un signal compatible est observé.
6. Si l'état est **Inconnu**, rejoignez l'onglet : la preuve peut manquer, expirer, être ralentie en arrière-plan ou correspondre à une interface non reconnue. Ne l'interprétez pas comme une fin. Depuis les sources (non publié), une durée indique depuis quand une ligne est en cours ou signale un élément à vérifier, vu ou non ; elle repart de zéro dès que la preuve est perdue.
7. Retirez l'accès de chaque site depuis Pilovo ou Chrome quand vous le souhaitez.
8. Sessions (non publiées, depuis les sources) : chaque ligne garde un numéro stable par service et indique la position de l'onglet (« Onglet 4 », avec « autre fenêtre » s'il est ailleurs). Le bouton crayon **Nommer cette session** permet de lui donner un nom tant que sa preuve est à jour ; ce nom reste en mémoire, affiché lorsque l'onglet est sur le service où il a été donné, jusqu'à la fermeture de l'onglet, au retrait de l'accès à ce site ou au redémarrage du service worker, sans être stocké ni exporté.
9. Badge (non publié, depuis les sources) : rouge pour une erreur visible, brun ambré pour une intervention demandée, olive pour une réponse disponible ; « … » signale un travail observé quand rien n'est à vérifier. Au survol de l'icône, un résumé en texte, dans la langue des paramètres de Pilovo, reprend ces nombres.
10. Raccourcis (non publiés, depuis les sources) : `Alt+Maj+J` rejoint le prochain élément à vérifier, ou ouvre le panneau s'il n'y a rien à vérifier. Pour le modifier, ou attribuer une touche à **Marquer tous les éléments à vérifier comme vus**, ouvrez `chrome://extensions/shortcuts`.
11. « Vu » automatique (non publié, depuis les sources ; désactivé par défaut) : dans **Paramètres**, rubrique **Activité**, **Marquer comme vu automatiquement** propose **Désactivé**, **5 s**, **15 s** et **30 s**. Un élément à vérifier est alors marqué comme vu après ce délai passé sur son propre onglet, onglet actif de la fenêtre Chrome active, avec ou sans le panneau latéral ouvert à côté ; la vue complète de Pilovo, un autre onglet, une autre fenêtre ou une autre application ne comptent pas. Changer d'onglet ou de fenêtre, quitter Chrome, naviguer, fermer l'onglet, retirer l'accès au site, un nouveau signal ou un « Vu » manuel interrompt l'attente, qui repart de zéro au retour sur l'onglet ; Pilovo interroge de nouveau Chrome juste avant de marquer l'élément. Le pied de la page d'activité indique alors le délai choisi. « Vu » signifie que vous l'avez remarqué, pas que la tâche a réussi. Seuls les identifiants d'onglets et de fenêtres et leurs indicateurs « actif » et « active » sont lus, en mémoire ; aucune permission n'est ajoutée.
12. Notifications système (non publiées, depuis les sources ; désactivées par défaut) : dans **Paramètres**, rubrique **Activité**, **Notifications système** propose une case par service, **Claude** et **ChatGPT**. En cochant la première, Chrome vous demande si Pilovo peut afficher des notifications ; si vous refusez, le réglage ne change pas et Pilovo vous l'indique ; vous pourrez cocher la case plus tard. Pilovo affiche ensuite une notification de votre système quand un nouvel élément à vérifier apparaît pour un service coché, dans un onglet que vous ne regardez pas. Elle contient seulement le service, le motif (réponse disponible, intervention demandée ou erreur visible) et le numéro de session. Un clic ouvre cette session avec la même revalidation que **Ouvrir la session**, sans la marquer comme vue ; elle s'efface quand l'élément est vu, à un nouveau signal, quand la preuve reste expirée plus de 35 secondes, à la navigation ou à la fermeture de l'onglet. Pour les désactiver, décochez les services : décocher le dernier efface les notifications de Pilovo, puis retire la permission de Chrome. Vous pouvez aussi couper les notifications de Chrome dans les réglages de votre système. Si la permission est retirée autrement, par exemple dans les réglages des extensions de Chrome, Chrome ne laisse plus Pilovo effacer les notifications déjà affichées : fermez-les vous-même, ou autorisez de nouveau les notifications et Pilovo les efface. Les Paramètres montrent alors les deux services désactivés et expliquent comment les réactiver. Votre système décide de l'affichage et peut les conserver dans son centre de notifications.

Le cœur de Pilovo est gratuit. Aucun compte Pilovo, clé API ou compagnon à installer. Le Chrome Web Store serait un parcours futur plus simple, sous réserve d'une soumission acceptée ; ce pilote s'installe manuellement.