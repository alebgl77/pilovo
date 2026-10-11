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

Working requires recognized evidence. Response ready requires witnessed work followed by stable ready evidence. Unknown means evidence is absent, inaccessible, stale or not supported by the current adapter; it does not mean the agent stopped. Use focus to inspect the provider directly. Marking an attention item seen only acknowledges it locally. Unreleased source also shows how long a row has been working or showing an item to review, seen or not; that duration restarts whenever evidence is lost, for example after expiry, navigation or a restart.

Remove a site's access through Pilovo or Chrome's extension controls. Revocation invalidates observations and stops renewals; a local lease expires within 15 seconds logically. A suspended page may execute its cleanup later. The toolbar badge is last-observed attention, with best-effort expiry. It is not an OS notification. Unreleased source colors it by the most urgent reason (red: visible error, amber-brown: input request, olive: response available), shows `…` while work is observed and nothing needs review, and summarizes the counts in text when you hover the icon, in the language chosen in Pilovo's settings.

The [compatibility record](compatibility.md) lists the pilot's limits. Provider subscriptions and quotas remain separate.

## Keyboard shortcuts

These shortcuts are unreleased: they are available when you build from source, not in the 0.4.0 archive.

| Command | Default | Effect |
| --- | --- | --- |
| Go to the next item to review | `Alt+Shift+J` (`Option+Shift+J` on macOS) | Focuses the earliest unacknowledged attention after the same revalidation as **Open session**, moving on if it no longer needs review; opens the side panel when nothing needs review |
| Mark all items to review as seen | None | Marks every current attention as seen locally; it verifies nothing and controls nothing |

To assign, change or remove a shortcut, open `chrome://extensions/shortcuts`, find Pilovo and edit its field. Chrome may leave the suggested `Alt+Shift+J` unassigned, for example when another extension already uses it; the panel then hides its shortcut hint until you assign one. Shortcuts are Chrome commands, not permissions, and grant no site access.

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
8. Badge (non publié, depuis les sources) : rouge pour une erreur visible, brun ambré pour une intervention demandée, olive pour une réponse disponible ; « … » signale un travail observé quand rien n'est à vérifier. Au survol de l'icône, un résumé en texte, dans la langue des paramètres de Pilovo, reprend ces nombres.
9. Raccourcis (non publiés, depuis les sources) : `Alt+Maj+J` rejoint le prochain élément à vérifier, ou ouvre le panneau s'il n'y a rien à vérifier. Pour le modifier, ou attribuer une touche à **Marquer tous les éléments à vérifier comme vus**, ouvrez `chrome://extensions/shortcuts`.

Le cœur de Pilovo est gratuit. Aucun compte Pilovo, clé API ou compagnon à installer. Le Chrome Web Store serait un parcours futur plus simple, sous réserve d'une soumission acceptée ; ce pilote s'installe manuellement.