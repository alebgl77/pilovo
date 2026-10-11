# FAQ Pilovo : activité des onglets ChatGPT et Claude dans Chrome

[English](faq.md) · Français · [README en français](README.fr.md)

Réponses sur la préversion 0.4.0 de Pilovo. Les fonctions marquées non publiées existent seulement dans les sources actuelles : compilez les sources pour les utiliser. Dernière revue : 11 octobre 2026.

## À propos de Pilovo

### Qu'est-ce que Pilovo ?

Pilovo est une extension Chrome open source (Manifest V3, licence MIT) qui indique si les onglets web ChatGPT et Claude que vous autorisez sont en cours, ont une réponse prête, demandent votre attention ou ne peuvent pas être confirmés. Elle les affiche dans le panneau latéral de Chrome, et son badge compte les éléments à vérifier : vous retrouvez ainsi le bon onglet. Pilovo observe localement un ensemble limité d'indicateurs d'état, avec un accès facultatif par site, et ne collecte ni vos consignes, ni les réponses, ni les titres de vos onglets.

La version 0.4.0 est une préversion expérimentale, à installer manuellement depuis GitHub. Voir le [README en français](README.fr.md).

### Pilovo est-il une extension officielle de ChatGPT ou de Claude ?

Non. Pilovo est un projet open source indépendant, sans lien avec les sociétés qui exploitent ChatGPT et Claude, et sans approbation ni parrainage de leur part ; ces noms servent uniquement à désigner les services observés. Les règles, abonnements et quotas de votre compte chez le fournisseur restent applicables.

### Pilovo est-il gratuit ? Faut-il un compte ou une clé API ?

Le cœur de Pilovo est gratuit sous licence MIT, sans compte Pilovo, clé API ni application compagnon. Vous continuez d'utiliser votre propre compte web ChatGPT ou Claude, avec ses abonnements et ses quotas. Node.js n'est nécessaire que pour compiler les sources.

### Pilovo est-il disponible en français ?

Oui : l'interface de Pilovo existe en français et en anglais ; elle s'ouvre en français par défaut, et le menu de langue en haut de la page de Pilovo, ou **Paramètres** › **Interface** › **Langue**, permet de passer à l'anglais. Les adaptateurs reconnaissent les interfaces de ChatGPT et de Claude en français et en anglais ; une interface du fournisseur dans une autre langue peut ne pas être reconnue : la ligne affiche alors **Observation interrompue**.

### Qu'était Briefoak ?

Briefoak est l'ancien nom de ce projet, dont la dernière version sous ce nom est la 0.3.0 ; l'observation d'activité commence avec Pilovo 0.4.0, et les versions Briefoak restent un historique distinct.

## Savoir quand une réponse est prête

### Comment savoir quand ChatGPT ou Claude a fini de répondre dans un autre onglet ?

Installez l'extension Chrome Pilovo et connectez le service, puis gardez le panneau latéral de Chrome ouvert ou surveillez le badge de Pilovo dans la barre d'outils : quand une réponse a fini de se générer, sa ligne passe à **À vérifier** avec **Réponse disponible**, et le badge compte les éléments que vous n'avez pas marqués comme vus. Pilovo ne l'indique qu'après avoir observé l'onglet en cours de travail, puis un signal de disponibilité stabilisé ; **Ouvrir la session** ramène cet onglet au premier plan. Une génération arrêtée avant que Pilovo ait observé l'onglet en cours de travail n'est pas signalée comme réponse prête. Voir [Les états affichés](README.fr.md#les-états-affichés).

### Pilovo envoie-t-il une notification ou émet-il un son quand ChatGPT ou Claude a fini ?

Pas dans la version 0.4.0 : la préversion publiée de l'extension Chrome Pilovo affiche le panneau latéral et le nombre sur le badge, sans notification système ni son. Les sources actuelles ajoutent des notifications système facultatives par service, désactivées par défaut (non publiées ; depuis les sources), qui contiennent seulement le service, le motif et le numéro de session. Votre fournisseur peut proposer ses propres notifications, que Pilovo ne modifie ni ne remplace. Avec les notifications non publiées, c'est votre système qui décide de leur affichage et d'un éventuel son ; Pilovo lui-même n'émet aucun son. Voir [Notifications système](installation.fr.md#notifications-système).

### Ai-je besoin de Pilovo si ChatGPT ou Claude peut déjà m'envoyer des notifications ?

Pas forcément. Votre fournisseur peut proposer ses propres notifications ; Pilovo ne les lit, ne les modifie ni ne les remplace. Pilovo réunit vos onglets ChatGPT et Claude autorisés dans un même panneau local, où un état inconnu reste affiché comme tel ; vous pouvez utiliser l'un, l'autre ou les deux.

### Pilovo peut-il suivre plusieurs onglets ChatGPT et Claude en même temps ?

Oui : l'extension Chrome Pilovo donne à chaque onglet ChatGPT ou Claude observé sur un site autorisé sa propre ligne dans le panneau latéral, par exemple **ChatGPT · session 2**, avec son état observé, et les éléments à vérifier apparaissent en premier. Pilovo suit des onglets, pas le contenu des conversations : ouvrez chaque conversation dans son propre onglet pour la suivre séparément. Chaque site demande son propre accord, et l'accès à l'un n'active pas l'autre. Dans la version 0.4.0, le panneau numérote les sessions d'après les onglets qu'il affiche, si bien qu'un numéro peut changer quand un autre onglet se ferme. Les numéros stables, la position de l'onglet et les noms que vous saisissez existent seulement dans les sources actuelles (non publiés ; depuis les sources). Voir [Numéros, positions et noms des sessions](installation.fr.md#numéros-positions-et-noms-des-sessions).

### « Réponse disponible » signifie-t-il que ma tâche a réussi ?

Non. **Réponse disponible** (réponse prête) signifie que la génération s'est arrêtée d'après la page ; Pilovo ne vérifie pas la réponse. Relisez-la dans le service, car votre tâche peut encore demander du travail. **Vu** indique seulement que vous avez remarqué l'élément. Une preuve d'erreur l'emporte : le 10 octobre 2026, une page Claude a gardé une annonce de fin après une demande bloquée par quota, contre-exemple consigné dans la [matrice de compatibilité](compatibility.md) (en anglais).

### Que signifient En cours, À vérifier, En attente et Observation interrompue ?

**En cours** : un indicateur reconnu montre une réponse en cours de génération ; **À vérifier** : une réponse est disponible, une intervention est demandée ou une erreur est visible ; **En attente** : la page est prête pour votre prochain message ; **Observation interrompue**, comptée dans **Non confirmées** : Pilovo ne peut pas confirmer l'état actuel. En cours, À vérifier et En attente viennent uniquement d'indicateurs reconnus dans la page. Voir [Les états affichés](README.fr.md#les-états-affichés).

### Existe-t-il un raccourci clavier pour rejoindre l'onglet qui m'attend ?

Pas dans Pilovo 0.4.0. Non publié (depuis les sources) : `Alt+Maj+J` (`Option+Maj+J` sur macOS) rejoint le prochain élément à vérifier, et vous pouvez le modifier dans `chrome://extensions/shortcuts`. S'il n'y a rien à vérifier, il ouvre le panneau latéral. Voir [Raccourcis clavier](installation.fr.md#raccourcis-clavier).

### Pilovo indique-t-il depuis combien de temps une réponse est en cours ?

Pas dans la version 0.4.0. Non publiées (depuis les sources) : les lignes affichent des durées écoulées à la minute près, par exemple **En cours depuis 4 min** ; elles repartent de zéro dès que la preuve est perdue, peuvent donc être plus courtes que la durée réelle et ne correspondent pas à un temps de génération du fournisseur. Voir [Durées écoulées](installation.fr.md#durées-écoulées).

## Confidentialité et permissions

### Pilovo lit-il mes conversations ?

Non. Après votre accord pour un site, l'observateur de Pilovo y lit un ensemble limité de contrôles et d'indicateurs d'état ; il ne collecte ni conversations complètes, ni texte des consignes ou des réponses, ni titres d'onglets, captures, cookies ou identifiants. Rien n'est envoyé à un serveur : Pilovo n'a ni backend ni télémétrie. Lire ces indicateurs reste un accès à la page : c'est pourquoi Chrome vous demande d'autoriser chaque site. Voir la [notice de confidentialité](privacy.md) (en anglais).

### Une extension Chrome peut-elle lire mes conversations ChatGPT ?

Une extension autorisée sur chatgpt.com ou claude.ai peut techniquement lire ces pages : vérifiez ce qu'elle demande et ce que fait son code avant de lui donner accès. Pilovo demande l'accès à chaque site séparément, seulement après un clic de votre part, et vous pouvez retirer cet accès à tout moment ; son code source est public sous licence MIT. Voir [Ce que Pilovo peut voir](README.fr.md#ce-que-pilovo-peut-voir).

### Quelles autorisations Pilovo demande-t-il ?

Pilovo exige exactement quatre autorisations Chrome (permissions) : `storage`, `sidePanel`, `alarms` et `scripting`. L'accès à `https://chatgpt.com/*` et à `https://claude.ai/*` est facultatif et demandé séparément pour chaque site ; les sources actuelles ajoutent une seule permission facultative, `notifications` (non publiée), demandée uniquement quand vous cliquez. Pilovo ne demande jamais `tabs`, l'accès à tous les sites ni `nativeMessaging` ; voir [Ce que Pilovo peut voir](README.fr.md#ce-que-pilovo-peut-voir).

### Pourquoi Chrome indique-t-il que Pilovo peut lire et modifier des données sur chatgpt.com ou claude.ai ?

C'est ainsi que Chrome décrit l'accès à un site ; Pilovo ne le demande que lorsque vous activez ce site d'un clic. Pilovo s'en sert pour reconnaître les onglets de ce site, lire les indicateurs d'état pris en charge et ramener un onglet au premier plan ; il n'envoie jamais de consigne et n'approuve aucune action chez le fournisseur. Vous pouvez retirer cet accès à tout moment depuis Pilovo ou dans `chrome://extensions`.

### Pilovo envoie-t-il des données ou utilise-t-il de la télémétrie ?

Non : Pilovo n'a ni backend, ni compte en ligne, ni synchronisation, ni publicité, ni télémétrie distante, ni API de modèle. L'activité observée reste dans la mémoire de l'extension et disparaît au redémarrage ; quand vous ouvrez ChatGPT ou Claude, votre navigateur contacte ces sites comme d'habitude. Voir la [notice de confidentialité](privacy.md) (en anglais).

### Pilovo enregistre-t-il mes consignes ?

Pas pour l'activité : l'activité observée reste en mémoire et disparaît au redémarrage. Une préparation manuelle ne garde sa consigne que si vous cochez l'option pour cette préparation ; cette option est désactivée par défaut. Les enregistrements restent dans votre profil Chrome, ne sont pas chiffrés par Pilovo et sont supprimés après 30 jours par défaut (durée réglable de 1 à 365 jours) ; ce nettoyage n'a lieu que lorsque l'extension est active. Voir la [notice de confidentialité](privacy.md) (en anglais).

### Comment retirer à Pilovo l'accès à un site ?

Cliquez sur **Déconnecter** pour ce service sous **Services connectés** dans Pilovo, ou retirez l'accès au site dans les réglages des extensions de Chrome. Les observations sont alors invalidées, les renouvellements s'arrêtent et le bail de l'observateur prend fin logiquement en 15 secondes au plus. Vos préparations enregistrées ne sont pas effacées.

## Installation et mises à jour

### Pilovo est-il sur le Chrome Web Store ?

Non. Pilovo 0.4.0 est une préversion publiée sur GitHub, à charger avec **Charger l'extension non empaquetée**, sans mise à jour automatique. Voir le [guide d'installation](installation.fr.md).

### Comment installer Pilovo depuis GitHub ?

Téléchargez `Pilovo_Chrome_v0.4.0.zip` dans la [préversion v0.4.0](https://github.com/alebgl77/pilovo/releases/tag/v0.4.0), décompressez-le dans un dossier que vous conservez, ouvrez `chrome://extensions`, activez le **Mode développeur**, choisissez **Charger l'extension non empaquetée** et sélectionnez le dossier qui contient `manifest.json`. Chrome 120 ou plus récent est requis, et les avertissements du mode développeur sont normaux. `Pilovo_SHA256_v0.4.0.json`, publié avec la même préversion, donne l'empreinte SHA-256 de l'archive : elle identifie des octets, pas l'éditeur. Voir le [guide d'installation](installation.fr.md).

### Comment mettre à jour ou désinstaller Pilovo ?

Exportez d'abord vos préparations, remplacez les fichiers dans le même dossier, puis rechargez Pilovo avec l'icône de rechargement de sa carte dans `chrome://extensions`. Gardez le même dossier et le même profil Chrome pour conserver votre historique. La désinstallation supprime le stockage de l'extension ; vos exports, sauvegardes et conversations chez le fournisseur restent à part.

### Comment compiler Pilovo depuis les sources ?

Avec Node.js 22.12 ou plus récent, lancez `npm ci`, `npm test` et `npm run build`, puis chargez le dossier `dist/` avec **Charger l'extension non empaquetée**. C'est le seul moyen d'utiliser les fonctions non publiées. Voir [Compiler depuis les sources](installation.fr.md#compiler-depuis-les-sources).

## Compatibilité

### Avec quels navigateurs, applications et sites Pilovo fonctionne-t-il ?

Pilovo vise Chrome 120 ou plus récent et observe uniquement les pages `chatgpt.com` et `claude.ai` ouvertes dans des onglets Chrome. Les autres navigateurs, y compris ceux basés sur Chromium, ne sont ni testés ni revendiqués ; Firefox et Safari ne sont pas pris en charge, et ni les applications de bureau ou mobiles ni les autres sites d'IA ne sont observés.

### Pilovo fonctionne-t-il avec ChatGPT agent, Claude in Chrome, Claude Code ou Codex ?

Non : ils ne sont pas pris en charge comme intégrations dédiées. Des indicateurs web ordinaires ne prouvent pas les tâches internes d'un agent, et aucun connecteur vers des processus externes n'est fourni. Voir la [matrice de compatibilité](compatibility.md) (en anglais).

## Ce que Pilovo ne fait pas

### Pilovo est-il un chatbot en barre latérale ou un gestionnaire d'onglets ?

Non : Pilovo est une extension Chrome dont le panneau latéral montre l'état de vos propres onglets ChatGPT et Claude ; elle n'intègre aucun chat, n'envoie aucune consigne, n'appelle aucune API de modèle et ne ferme, ne regroupe ni ne réordonne vos onglets.

### Pilovo peut-il arrêter ou lancer une génération, ou envoyer des consignes ?

Non : Pilovo affiche l'état observé, ramène le bon onglet au premier plan et enregistre des acquittements locaux, mais il n'envoie ni ne met en file d'attente aucune consigne, n'arrête, ne met en pause, ne reprend ni ne lance aucune génération et n'approuve aucune action chez le fournisseur.

### Pilovo peut-il garder un onglet ChatGPT ou Claude actif en arrière-plan ?

Non : Chrome peut ralentir ou décharger les onglets en arrière-plan, et Pilovo, une extension Chrome qui se contente d'observer des indicateurs d'état, n'y change rien. Quand la preuve expire, la ligne affiche **Observation interrompue** plutôt qu'une supposition.

### Pilovo peut-il exporter ou sauvegarder mes conversations ChatGPT ou Claude ?

Non : Pilovo ne lit pas les conversations et ne peut donc pas les exporter. Son export JSON couvre ce que vous avez enregistré dans Pilovo : préparations (avec les consignes que vous avez choisi de conserver), missions, notes, archives et réglages.

### Pilovo affiche-t-il les titres d'onglets ou les noms de conversations ?

Non : les lignes indiquent le service, un numéro de session et l'état observé, jamais un titre d'onglet ni une adresse. Les noms de session (non publiés ; depuis les sources) sont saisis par vous et restent dans la mémoire de l'extension.

### Pilovo se synchronise-t-il entre appareils ou propose-t-il une vue d'équipe ?

Non : Pilovo n'a ni compte ni synchronisation ; ses données restent dans votre profil Chrome, sur cet appareil, hormis les exports que vous téléchargez. Avec les notifications système non publiées, votre système peut en garder des copies ou les reproduire sur d'autres appareils, selon ses propres réglages.

## Dépannage

### Pourquoi Pilovo affiche-t-il « Observation interrompue » ?

Pilovo ne peut pas confirmer l'état actuel de l'onglet : aucun signal reconnu, une preuve de plus de 15 secondes, un onglet en arrière-plan ralenti par Chrome, ou une interface que l'adaptateur ne reconnaît pas. Ce n'est ni une fin ni un arrêt ; rejoignez l'onglet pour que Pilovo puisse l'observer de nouveau.

### Pourquoi le badge ne s'efface-t-il pas tout de suite ?

Le badge compte, d'après la dernière observation, les éléments à vérifier que vous n'avez pas encore marqués comme vus, et Chrome peut retarder le travail en arrière-plan de Pilovo : son effacement est donc fait au mieux. Pour le mettre à jour, ouvrez le panneau ou marquez l'élément comme vu.

### Pourquoi Pilovo ne détecte-t-il pas mon onglet ChatGPT ou Claude ?

Vérifiez d'abord que le service est connecté dans Pilovo : chaque site demande son propre accord. Vérifiez ensuite que la page est bien sur `chatgpt.com` ou `claude.ai`. Les adaptateurs sont expérimentaux et couvrent les interfaces en français et en anglais ; un changement de page chez le fournisseur peut donner un état inconnu (**Observation interrompue**) ou, tant que l'adaptateur n'est pas mis à jour, un état incorrect. Signalez-le avec les versions de Pilovo et de Chrome et les étapes suivies, sans contenu privé, dans les [tickets GitHub](https://github.com/alebgl77/pilovo/issues).

### Pourquoi Pilovo affiche-t-il « Cette session n'a pas pu être ouverte » ?

Dans Pilovo 0.4.0, **Ouvrir la session** peut afficher ce message sur un onglet inchangé quand des mises à jour courantes de la page arrivent pendant sa vérification ; la correction est dans les sources actuelles (non publiée ; depuis les sources). Il apparaît aussi quand l'onglet s'est fermé ou a changé depuis la dernière observation. Cliquez sur **Actualiser** puis réessayez, ou rejoignez vous-même l'onglet.
