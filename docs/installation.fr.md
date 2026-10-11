# Installer Pilovo 0.4.0 (préversion) dans Chrome

[English](installation.md) · Français · [README en français](README.fr.md) · [FAQ](faq.fr.md)

Pilovo 0.4.0 est une extension Chrome qui s'installe manuellement : téléchargez `Pilovo_Chrome_v0.4.0.zip` dans la [préversion v0.4.0 sur GitHub](https://github.com/alebgl77/pilovo/releases/tag/v0.4.0), décompressez-le, ouvrez `chrome://extensions`, activez le **Mode développeur**, puis cliquez sur **Charger l'extension non empaquetée** et sélectionnez le dossier qui contient `manifest.json`. Chrome 120 ou plus récent est requis. Pilovo n'est pas publié sur le Chrome Web Store et ne se met pas à jour automatiquement. Vous utilisez votre propre compte web ChatGPT ou Claude ; le cœur de Pilovo est gratuit sous licence MIT, sans compte Pilovo, clé API ni compagnon.

Dernière revue : 11 octobre 2026.

## Installer l'archive ZIP

1. Téléchargez `Pilovo_Chrome_v0.4.0.zip` depuis la [préversion v0.4.0](https://github.com/alebgl77/pilovo/releases/tag/v0.4.0), ou compilez les sources (plus bas). Pour vérifier l'archive, comparez son empreinte SHA-256 avec `Pilovo_SHA256_v0.4.0.json`, publié avec la même préversion ; une empreinte identifie des octets, pas l'éditeur.
2. Décompressez-la dans un dossier que vous conserverez ; ce dossier doit contenir directement `manifest.json`.
3. Ouvrez `chrome://extensions` et activez le **Mode développeur**.
4. Cliquez sur **Charger l'extension non empaquetée**, sélectionnez le dossier, puis épinglez Pilovo depuis le menu des extensions.
5. Ouvrez Pilovo ; une installation neuve ne contient ni activité inventée ni historique d'exemple.

Node.js, Python, une CLI ou un compagnon natif sont inutiles pour utiliser l'archive. Il n'y a pas de mise à jour automatique. Les avertissements du mode développeur sont normaux.

## Premières minutes

1. Connectez un fournisseur (bouton **Connecter**) : ChatGPT et Claude demandent chacun un accord distinct ; vous pourrez connecter l'autre plus tard. En cas de refus, vous pouvez toujours ouvrir le service depuis Pilovo.
2. Envoyez une consigne dans votre compte fournisseur. Pilovo indique l'état seulement si un signal compatible est observé.
3. **En cours** repose sur un indicateur reconnu. **Réponse disponible** exige un travail d'abord observé, puis un signal de disponibilité stabilisé ; ce n'est pas la preuve que la tâche a réussi.
4. Si une ligne indique **Observation interrompue** (état inconnu), rejoignez l'onglet : la preuve peut manquer ou avoir expiré, l'onglet peut être ralenti en arrière-plan, ou l'interface peut ne pas être reconnue. Ne l'interprétez ni comme une fin ni comme un arrêt.
5. **Ouvrir la session** ramène l'onglet au premier plan après une nouvelle vérification ; **Marquer comme vu** acquitte l'élément localement, sans rien vérifier.
6. Le badge de la barre d'outils indique les éléments à vérifier encore non vus, d'après la dernière observation ; son effacement est fait au mieux, sans garantie de temps réel, et ce badge n'est pas une notification système : la version 0.4.0 n'en envoie aucune (voir [Notifications système](#notifications-système), non publiées).
7. Retirez l'accès de chaque site depuis Pilovo ou Chrome quand vous le souhaitez : les observations sont invalidées et le bail local expire logiquement en 15 secondes au plus. Si la page est suspendue, son nettoyage peut avoir lieu plus tard.

La [matrice de compatibilité](compatibility.md) (en anglais) précise les limites de la préversion. Les sources actuelles ajoutent des fonctions non publiées : [durées écoulées](#durées-écoulées), [numéros de session stables](#numéros-positions-et-noms-des-sessions) et [couleurs du badge](#couleurs-et-résumé-du-badge). Problèmes courants : voir le [dépannage](faq.fr.md#dépannage).

## Compiler depuis les sources

Depuis la racine du dépôt cloné ou de l'archive source, avec Node.js 22.12 ou plus récent :

```sh
npm ci
npm test
npm run build
```

Chargez ensuite le dossier `dist/` avec **Charger l'extension non empaquetée**. C'est le seul moyen d'utiliser les fonctions non publiées décrites plus bas. Les [vérifications de publication](RELEASE.md) (en anglais) couvrent l'empaquetage et la validation ; la compilation par défaut exclut l'ancien compagnon.

## Mettre à jour, retirer un accès, désinstaller

Retirez l'accès d'un site depuis Pilovo (**Déconnecter**, sous **Services connectés**) ou depuis les réglages des extensions de Chrome : les observations sont invalidées et le bail local expire logiquement en 15 secondes au plus. Pour mettre à jour, exportez d'abord vos préparations, remplacez les fichiers dans le même dossier, puis rechargez Pilovo avec l'icône de rechargement de sa carte dans `chrome://extensions`. Gardez le même dossier et le même profil Chrome pour conserver votre historique : un autre chemin ou une autre identité peut créer un stockage séparé, et l'import entre extensions n'est pas implémenté. L'activité en direct est temporaire et demande une nouvelle observation après un redémarrage. La désinstallation supprime le stockage de l'extension ; exports, sauvegardes, presse-papiers, conversations chez le fournisseur et compagnons historiques installés séparément se gèrent à part. Voir la [notice de confidentialité](privacy.md) (en anglais).

## Fonctions non publiées (depuis les sources)

Les sections ci-dessous décrivent des fonctions présentes dans les sources actuelles, pas dans l'archive 0.4.0.

### Raccourcis clavier

Ces raccourcis sont non publiés : ils sont disponibles en compilant les sources, pas dans l'archive 0.4.0.

La commande **Aller au prochain élément à vérifier** (`Alt+Maj+J`, ou `Option+Maj+J` sur macOS) rejoint l'attention non vue la plus ancienne, revalidée comme **Ouvrir la session** ; si cette vérification montre qu'elle n'est plus à vérifier, la suivante est essayée. S'il n'y a rien à vérifier, le panneau latéral s'ouvre. **Marquer tous les éléments à vérifier comme vus** n'a pas de touche par défaut ; attribuez-lui une touche, ou modifiez `Alt+Maj+J`, dans `chrome://extensions/shortcuts`. Dès que deux éléments ou plus sont à vérifier, le panneau propose aussi **Tout marquer comme vu**. Comme « Vu », cette action reste locale et signifie seulement que vous les avez remarqués.

Chrome peut laisser `Alt+Maj+J` sans attribution, par exemple si une autre extension l'utilise déjà ; le panneau masque alors l'indication du raccourci jusqu'à ce que vous en attribuiez un. Les raccourcis sont des commandes Chrome, pas des permissions, et ne donnent accès à aucun site.

### Marquer comme vu automatiquement

Ce réglage est non publié : il est disponible en compilant les sources, pas dans l'archive 0.4.0. Il est désactivé par défaut.

Dans **Paramètres**, rubrique **Activité**, **Marquer comme vu automatiquement** propose **Désactivé**, **5 s**, **15 s** et **30 s**. Un élément à vérifier est alors marqué comme vu dès que son propre onglet est resté aussi longtemps l'onglet actif de la fenêtre Chrome active, panneau latéral ouvert à côté ou non ; la vue complète de Pilovo, un autre onglet, une autre fenêtre ou une autre application au premier plan ne comptent pas. Changer d'onglet ou de fenêtre, quitter Chrome, naviguer, fermer l'onglet, retirer l'accès à ce site, un nouveau signal dans l'onglet ou un « Vu » manuel interrompt l'attente, qui repart de zéro lorsque l'onglet revient au premier plan ; juste avant de marquer l'élément, Pilovo redemande à Chrome quel onglet est au premier plan. Une fois le réglage activé, le bas de la page Activité rappelle ce délai. Comme un « Vu » manuel, ce « Vu » automatique reste local et signifie seulement que l'onglet était devant vous : il ne vérifie, n'approuve ni ne termine jamais la tâche. Pour savoir quel onglet est au premier plan, Pilovo lit uniquement les identifiants d'onglets et de fenêtres et leurs indicateurs « actif » et « active », dans la mémoire du service worker ; aucune nouvelle permission n'est nécessaire. Le réglage lui-même est enregistré avec vos autres préférences et figure dans l'export.

### Notifications système

Ces notifications sont non publiées et désactivées par défaut ; la version 0.4.0 n'envoie aucune notification système.

Dans **Paramètres**, rubrique **Activité**, **Notifications système** propose une case par service, **Claude** et **ChatGPT**. Quand vous cochez la première case, Pilovo demande à Chrome sa permission facultative `notifications` ; si vous refusez, rien ne change et Pilovo vous l'indique ; vous pourrez cocher la case plus tard. Pilovo affiche alors une notification de votre système quand un nouvel élément à vérifier apparaît pour un service coché : une réponse disponible, une intervention demandée ou une erreur visible. Elle contient seulement le service, le motif et le numéro de session, par exemple **ChatGPT** · *Intervention demandée · session 2*, jamais un nom de session, un titre d'onglet, une adresse ni le contenu d'une conversation. Aucune notification pour l'onglet que vous regardez (l'onglet actif de la fenêtre Chrome active) ni pour un élément déjà présent quand vous avez coché le service. Quand Chrome ralentit un onglet en arrière-plan et que la preuve expire, la notification reste au plus 35 secondes et continue de désigner le même signal si Pilovo le relit entre-temps dans cet onglet, sans notifier deux fois. Un clic l'efface et ouvre cette session avec la même revalidation que **Ouvrir la session** (en relisant d'abord l'onglet si sa preuve avait expiré), sans la marquer comme vue. Elle s'efface quand l'élément est vu (à la main, avec **Tout marquer comme vu** ou par le « Vu » automatique), à un nouveau signal, quand la preuve reste expirée plus de 35 secondes, à la navigation, à la fermeture de l'onglet, au retrait de l'accès au site ou en décochant le service.

Décocher le dernier service efface les notifications de Pilovo, puis retire la permission de Chrome. Vous pouvez aussi couper les notifications de Chrome dans les réglages de votre système. Si la permission est retirée autrement, par exemple dans les réglages des extensions de Chrome, Chrome ne laisse plus Pilovo effacer les notifications déjà affichées : votre système peut les garder jusqu'à ce que vous les fermiez (Pilovo les efface si vous autorisez de nouveau les notifications) ; les Paramètres montrent les deux services désactivés et vous laissent en cocher un à nouveau. Votre système décide de l'affichage des notifications et peut les conserver dans son centre de notifications.

### Durées écoulées

Ces durées sont non publiées : elles sont disponibles en compilant les sources, pas dans l'archive 0.4.0.

Une ligne en cours indique depuis combien de temps ce travail est observé, par exemple **En cours depuis 4 min** ; un élément à vérifier, vu ou non, indique depuis combien de temps son signal est affiché, par exemple **Réponse disponible depuis 2 min**. Ces durées, à la minute près, sont calculées dans la mémoire du panneau à partir du moment où Pilovo a observé l'état actuel dans cette page. Elles ne sont jamais enregistrées, exportées ni transmises. Comme le modèle de preuve est prudent, une durée repart de zéro dès que Pilovo perd la preuve de cet état : aucun signal reconnu, échec de la vérification de la page, preuve expirée, navigation ou rechargement, redémarrage du service worker. Elle peut donc être plus courte que la durée réelle et ne correspond pas à un temps de génération communiqué par le fournisseur. Si seul le panneau ne peut pas confirmer l'activité (actualisation en échec, service d'activité indisponible ou modification d'un accès en cours), les durées sont masquées ; elles réapparaissent inchangées dès que des données fraîches confirment la même observation continue.

### Numéros, positions et noms des sessions

Cette fonction est non publiée : elle est disponible en compilant les sources, pas dans l'archive 0.4.0. Dans la version 0.4.0, les lignes affichent déjà un numéro de session par service, qui peut changer quand d'autres onglets se ferment.

Chaque ligne garde un numéro stable par service, par exemple **Claude · session 3**. Pilovo l'attribue dès la première observation de l'onglet et le conserve tant que cet onglet reste ouvert sur ce service, même si d'autres onglets se ferment ou si la page navigue. La numérotation repart après un redémarrage du service worker de l'extension, et un onglet qui quitte le service puis y revient reçoit un nouveau numéro. Une ligne secondaire indique la position de l'onglet dans sa fenêtre, par exemple **Onglet 4**, et ajoute **autre fenêtre** quand l'onglet n'est pas dans la fenêtre qui affiche Pilovo. Pour distinguer vos sessions, choisissez le bouton crayon (**Nommer cette session**) et saisissez un nom de 40 caractères au plus, par exemple *Revue contrat* ; la ligne devient **Revue contrat — Claude · session 3**, en gardant le numéro qu'utilisent les notifications système. La touche Entrée ou la sortie du champ applique le nom, Échap annule, un nom vide l'efface. Comme l'ouverture d'une session, nommer demande une preuve à jour : une ligne dont la preuve a expiré peut être renommée dès que Pilovo l'observe à nouveau. Ce nom reste uniquement dans la mémoire de l'extension pour cet onglet : il survit à la navigation dans l'onglet, ne s'affiche que lorsque l'onglet est sur le service où vous l'avez nommé, et disparaît à la fermeture de l'onglet, au retrait de l'accès à ce site ou au redémarrage du service worker. Il n'est jamais stocké, exporté, transmis, ni affiché sur le badge ou son info-bulle. Pilovo n'affiche toujours ni titre d'onglet ni adresse.

### Couleurs et résumé du badge

Ces couleurs et ce résumé sont non publiés : ils sont disponibles en compilant les sources, pas dans l'archive 0.4.0.

Le nombre prend la couleur du motif le plus urgent, rouge pour une erreur visible, brun ambré pour une intervention demandée, olive pour une réponse disponible. S'il n'y a rien à vérifier mais qu'un travail est observé, il affiche « … » sur fond gris, sans nombre ; les éléments vus, les sessions en attente et les états inconnus ne l'allument jamais. Au survol de l'icône Pilovo, le même résumé apparaît en texte, dans la langue choisie dans les paramètres de Pilovo, par exemple « Pilovo — 3 à vérifier, dont 1 erreur visible · 1 en cours ». Le badge et son info-bulle ne contiennent que des nombres et ces mots fixes, jamais de titre, d'adresse ni de contenu de conversation.
