# Install Briefoak

Briefoak 0.3.0 is an unpacked Chrome extension, not a Chrome Web Store listing. Use Chrome 120 or later. You need your own Claude or ChatGPT web account to send work; Briefoak has no account or paid model API integration.

## Release ZIP

1. Open [Releases](https://github.com/alebgl77/briefoak/releases) and download `Briefoak_Chrome_v0.3.0.zip`. If no asset is available, build from source below.
2. Extract the ZIP into a folder you will keep. The selected folder must contain `manifest.json` directly.
3. Open `chrome://extensions` and enable **Developer mode**.
4. Choose **Load unpacked**, select the extracted folder, then pin Briefoak from Chrome's extensions menu.
5. Open Briefoak. A fresh installation has no sample history.

No Node.js, Python, CLI, companion or API key is required to use the release. Chrome normally shows developer-mode notices for unpacked extensions. There is no automatic updater in this distribution.

## First minute

Create a preparation, choose a provider, and enter a title and prompt. Leave prompt retention off to avoid saving its text. Copy it while the form is open, open the provider, then paste and send there yourself. Return to Briefoak and mark it sent when appropriate. Marking completed is also your own declaration.

Granting optional access to the two provider sites enables tab recognition. Denial keeps official-site navigation available. An open tab is not evidence of login or activity. You can revoke site access through Chrome's extension controls.

## Build from source

From a clone or the extracted **Source ZIP** root, use Node.js 22.12+ and run:

```sh
npm ci
npm test
npm run build
```

Load `dist/` using the same Chrome steps. To create delivery archives, see [RELEASE](RELEASE.md). The default build has no native companion.

## Updating and removing

Export before changing installations. Replace the files in the existing unpacked folder and click **Reload** in `chrome://extensions`. Keep the same extension identity and profile if you need its stored history. A different unpacked path or extension identity may create separate storage; cross-extension import is not implemented.

Removing the extension removes its profile storage. Downloaded exports, backups, clipboard contents, provider conversations and any historical companion installed independently remain separate. Read [Privacy](privacy.md) for purge and retention limits.

## En français

Téléchargez puis décompressez le ZIP Chrome. Ouvrez `chrome://extensions`, activez **Mode développeur**, choisissez **Charger l'extension non empaquetée** et sélectionnez le dossier contenant `manifest.json`. Épinglez Briefoak. Préparez, copiez puis collez/envoyez vous-même chez le fournisseur. Les statuts d'envoi et de fin sont vos déclarations. Le [guide français](README.fr.md) décrit les données et les limites.
