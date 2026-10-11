# Pilovo

**Gardez vos IA en vue.**
Activité IA pour Chrome · **Préversion 0.4.0**

Pilovo est une extension Chrome open source (Manifest V3, licence MIT) qui indique si les onglets web ChatGPT et Claude que vous autorisez sont en cours, ont une réponse prête, demandent votre attention ou ne peuvent pas être confirmés. Elle les affiche dans le panneau latéral de Chrome, et son badge compte les éléments à vérifier : vous retrouvez ainsi le bon onglet. Pilovo observe localement un ensemble limité d'indicateurs d'état, avec un accès facultatif par site, et ne collecte ni vos consignes, ni les réponses, ni les titres de vos onglets.

La version 0.4.0 est une préversion expérimentale pour Chrome 120 ou plus récent, proposée sur GitHub depuis le 10 octobre 2026 et à installer manuellement ; elle n'est pas publiée sur le Chrome Web Store. Le cœur de Pilovo est gratuit sous licence MIT ; Pilovo n'a ni backend ni télémétrie et ne demande ni compte Pilovo ni clé API. Pilovo est un projet indépendant, sans lien avec les sociétés qui exploitent ChatGPT et Claude, et sans approbation de leur part.

![Bannière Pilovo : logo P, slogan anglais « Keep your AI in view. », mentions « AI activity for Chrome » et « ChatGPT + Claude · Preview », à côté de lignes d'activité abstraites. Illustration, pas une capture du produit.](media/pilovo-github-banner.png)

[English](../README.md) · [Installation pas à pas](installation.fr.md) · [Questions fréquentes](faq.fr.md) · [Confidentialité (en anglais)](privacy.md) · [Compatibilité (en anglais)](compatibility.md) · [Journal des modifications (en anglais)](../CHANGELOG.md)

![Visite animée de l'extension Chrome Pilovo avec des données synthétiques : liste d'activité, Ouvrir la session et Marquer comme vu, numéros et noms de session, paramètres et panneau latéral. Les écrans marqués NON PUBLIÉ montrent des fonctions disponibles seulement en compilant les sources.](media/pilovo-tour-fr.gif)

*Interface réelle issue des sources actuelles, alimentée par des fixtures locales synthétiques. Ce n'est ni une session fournisseur réelle ni une preuve d'exécution. Les écrans marqués NON PUBLIÉ ne sont disponibles qu'en compilant depuis les sources.*

## Pilovo en bref

L'essentiel de la version 0.4.0. Dernière revue : 11 octobre 2026.

| Élément | Pilovo 0.4.0 |
| --- | --- |
| Catégorie | Extension Chrome (Manifest V3) avec panneau latéral et vue pleine page |
| Services observés | Pages web de ChatGPT (`https://chatgpt.com/*`) et de Claude (`https://claude.ai/*`) dans des onglets Chrome ; adaptateurs expérimentaux pour leurs interfaces en anglais et en français |
| États affichés | En cours, en attente, réponse prête (**Réponse disponible**), intervention demandée, erreur visible, inconnu (**Observation interrompue**) |
| Version | Préversion 0.4.0, publiée sur GitHub le 10 octobre 2026 ([page de la version v0.4.0](https://github.com/alebgl77/pilovo/releases/tag/v0.4.0)) ; installation manuelle avec **Charger l'extension non empaquetée** ; pas publiée sur le Chrome Web Store |
| Prérequis | Chrome 120 ou plus récent ; ni compte Pilovo, ni clé API, ni compagnon |
| Permissions | Requises : `storage`, `sidePanel`, `alarms`, `scripting`. Facultatives, site par site : `https://chatgpt.com/*`, `https://claude.ai/*` |
| Données | Ni consignes, ni réponses, ni titres d'onglets collectés ; activité gardée en mémoire ; ni backend, ni télémétrie, ni API de modèle |
| Interface | Français et anglais ; thème clair, sombre ou selon le système |
| Licence | MIT ; le cœur est gratuit |

## Suivre vos onglets ChatGPT et Claude

1. Ouvrez Pilovo et connectez **ChatGPT** ou **Claude** (bouton **Connecter**). Chaque site demande son propre accord.
2. Utilisez votre compte web habituel et envoyez vous-même une consigne chez le fournisseur.
3. Consultez l'état observé dans Pilovo. Rejoignez le bon onglet, puis marquez une demande d'attention comme vue si vous le souhaitez. « Vu » signifie seulement que vous l'avez remarquée, pas que la tâche a réussi.

### Les états affichés

Chaque onglet observé sur un site autorisé occupe une ligne. En cours, En attente, Réponse prête et les demandes d'attention viennent uniquement d'indicateurs reconnus dans la page ; tout le reste est affiché comme inconnu.

| État | Libellé dans le panneau | Signification |
| --- | --- | --- |
| En cours | **En cours** | Un indicateur reconnu montre qu'une réponse est en cours de génération dans la page. |
| Réponse prête | **À vérifier** · **Réponse disponible** | Pilovo a observé un travail, puis un signal de disponibilité stabilisé. La génération s'est arrêtée dans la page ; cela ne signifie pas que la réponse est juste ni que la tâche a réussi. |
| Demande d'attention | **À vérifier** · **Une intervention est demandée** ou **Une erreur est visible dans la page** | Une demande d'intervention ou une erreur visible explicitement reconnue. |
| En attente | **En attente** | La page est prête pour votre prochain message et aucun travail n'est observé. |
| Inconnu | **Observation interrompue** (comptée dans **Non confirmées**) | La preuve manque, a expiré après 15 secondes, est inaccessible ou n'est pas reconnue. Ce n'est ni un arrêt ni une fin. |
| Vu | **Vu** | L'élément a été marqué comme vu : un acquittement local, jamais une vérification. |

Un onglet ouvert, un bouton qui disparaît ou une vieille annonce de fin ne prouve ni exécution ni réussite.

Les onglets en arrière-plan peuvent être ralentis par Chrome. La preuve expire logiquement après 15 secondes. Le badge indique le nombre d'éléments à vérifier encore non vus, d'après la dernière observation. Son effacement dépend aussi du réveil du service worker et n'est pas garanti en temps réel. La version 0.4.0 n'envoie aucune notification système ; les notifications facultatives figurent dans les [fonctions non publiées](#fonctions-non-publiées-depuis-les-sources).

![Page Activité de Pilovo en français, thème clair, avec des données synthétiques : compteurs 1 à vérifier, 1 en cours, 1 non confirmée ; ChatGPT · session 2 à vérifier (Réponse disponible, avec Ouvrir la session et Marquer comme vu) ; ChatGPT · session 1 en cours ; Claude · session 1 en attente ; Claude · session 2 en observation interrompue.](media/screenshots/Pilovo_activity_desktop_synthetic.png)

*Interface réelle alimentée par des fixtures locales synthétiques. Cette capture ne représente pas une session fournisseur réelle ni une preuve d'exécution.*

## Fonctions non publiées (depuis les sources)

Ces fonctions existent dans les sources actuelles, pas dans la version 0.4.0 : compilez les sources pour les utiliser. Les écrans de la visite qui les montrent sont marqués NON PUBLIÉ.

- **Raccourcis clavier :** `Alt+Maj+J` (`Option+Maj+J` sur macOS) rejoint le prochain élément à vérifier ; **Tout marquer comme vu** apparaît dans le panneau dès que deux éléments ou plus sont à vérifier, et la commande **Marquer tous les éléments à vérifier comme vus** n'a pas de touche par défaut. [Détails](installation.fr.md#raccourcis-clavier)
- **« Vu » automatique**, désactivé par défaut : un élément est marqué comme vu quand son propre onglet reste au premier plan 5, 15 ou 30 secondes ; cela reste un acquittement local. [Détails](installation.fr.md#marquer-comme-vu-automatiquement)
- **Notifications système**, désactivées par défaut, par service : une notification de votre système pour un nouvel élément à vérifier dans un onglet que vous ne regardez pas, avec seulement le service, le motif et le numéro de session ; la permission facultative `notifications` n'est demandée que lorsque vous cliquez. [Détails](installation.fr.md#notifications-système)
- **Durées écoulées**, par exemple *En cours depuis 4 min* : à la minute près, jamais enregistrées, elles repartent de zéro quand la preuve est perdue. [Détails](installation.fr.md#durées-écoulées)
- **Numéros de session stables, positions et noms** : des numéros qui ne changent plus quand d'autres onglets se ferment, et un nom de 40 caractères au plus, gardé en mémoire tant que l'onglet reste ouvert, jamais enregistré ni exporté. [Détails](installation.fr.md#numéros-positions-et-noms-des-sessions)
- **Couleurs et résumé du badge** : le nombre prend la couleur du motif le plus urgent, « … » signale un travail observé, et l'info-bulle de l'icône ne donne que des nombres et des mots fixes. [Détails](installation.fr.md#couleurs-et-résumé-du-badge)

## Compatibilité de la préversion

Pilovo observe seulement les sites web de ChatGPT et de Claude dans des onglets Chrome : les applications de bureau ou mobiles et les autres sites d'IA ne sont pas pris en charge, et les navigateurs autres que Chrome 120+ ne sont pas testés.

Les adaptateurs EN/FR sont expérimentaux. Une inspection manuelle a vu les indicateurs ChatGPT FR le 10 octobre 2026. Le test Claude était bloqué par quota, et son annonce de fin contenait encore un message terminé ; son streaming n'a pas été capturé. Ces observations ne valident pas un parcours réel de bout en bout de l'extension. Voir la [matrice de compatibilité](compatibility.md) (en anglais).

Pilovo permet de rejoindre un onglet et d'acquitter localement l'attention. Il ne lance, n'arrête, ne met en pause ni ne reprend aucun agent, n'envoie aucune consigne, n'approuve aucune action chez le fournisseur, n'inspecte aucune autre extension et ne pilote aucune application native. La supervision de ChatGPT agent, de Claude in Chrome et de Claude Code/Codex reste un travail futur, avec des exigences d'intégration distinctes.

## Installer la préversion

L'extension Pilovo 0.4.0 s'installe manuellement dans Chrome 120 ou plus récent ; elle n'est pas publiée sur le Chrome Web Store et ne se met pas à jour automatiquement. Téléchargez `Pilovo_Chrome_v0.4.0.zip` dans la [préversion v0.4.0](https://github.com/alebgl77/pilovo/releases/tag/v0.4.0) ou [compilez les sources](installation.fr.md#compiler-depuis-les-sources). Décompressez le ZIP, ouvrez `chrome://extensions`, activez le **Mode développeur**, puis cliquez sur **Charger l'extension non empaquetée**. Sélectionnez le dossier qui contient directement `manifest.json` et épinglez Pilovo. Le [guide d'installation](installation.fr.md) explique les accords par site et leur retrait.

Les règles, abonnements et quotas de votre compte chez le fournisseur restent applicables. Ni CLI ni Node.js ne sont nécessaires pour utiliser l'archive ; Node.js sert seulement à compiler les sources.

## Ce que Pilovo peut voir

| Permission | Usage |
| --- | --- |
| `storage` | Préférences locales ; les préparations manuelles enregistrées sont dans IndexedDB. |
| `sidePanel` | Panneau latéral de Chrome. |
| `alarms` | Maintenance de la rétention et surveillance de l'activité, au mieux. |
| `scripting` | Enregistrer et interroger l'observateur isolé fourni avec l'extension, après l'accord pour un site. |
| `https://chatgpt.com/*` ou `https://claude.ai/*`, facultatives | Reconnaître les onglets correspondants, lire les indicateurs d'état pris en charge et ramener un onglet au premier plan ; demandées séparément. |
| `notifications`, facultative (non publiée) | Notifications système pour les services cochés dans les Paramètres, désactivées par défaut ; demandée quand vous cochez le premier service, retirée quand vous décochez le dernier. |

Pilovo ne demande jamais la permission `tabs`, l'accès à tous les sites ni `nativeMessaging`.

L'observateur isolé est activé uniquement sur le site autorisé. Il examine des contrôles et indicateurs d'état du DOM, sans collecter les consignes, réponses complètes, titres d'onglets, captures, cookies ou identifiants. Les métadonnées d'activité sont locales et temporaires ; elles sont reconstruites avec des preuves fraîches après redémarrage. Les noms de session que vous saisissez (non publiés) restent dans cette mémoire le temps de vie de leur onglet, sans jamais être enregistrés ni exportés. Le « Vu » automatique facultatif (non publié, désactivé par défaut) lit seulement quel onglet est actif dans la fenêtre active, sous forme d'identifiants et d'indicateurs gardés en mémoire. Les notifications système facultatives (non publiées, désactivées par défaut) contiennent seulement le service, le motif et le numéro de session ; votre système peut les conserver dans son centre de notifications. Ni backend, ni API de modèle, ni télémétrie distante, ni synchronisation cloud. Le retrait d'accès invalide l'observation ; le bail local impose une coupure logique sous 15 secondes, même si Chrome retarde le nettoyage. Voir la [notice de confidentialité](privacy.md) et le [contrat technique](core-contract.md), tous deux en anglais.

## Questions fréquentes

### Comment savoir quand ChatGPT ou Claude a fini de répondre dans un autre onglet ?

Installez l'extension Chrome Pilovo et connectez le service, puis gardez le panneau latéral de Chrome ouvert ou surveillez le badge de Pilovo dans la barre d'outils : quand une réponse a fini de se générer, sa ligne passe à **À vérifier** avec **Réponse disponible**, et le badge compte les éléments que vous n'avez pas marqués comme vus. Pilovo ne l'indique qu'après avoir observé l'onglet en cours de travail, puis un signal de disponibilité stabilisé ; **Ouvrir la session** ramène cet onglet au premier plan.

### Pilovo envoie-t-il une notification ou émet-il un son quand ChatGPT ou Claude a fini ?

Pas dans la version 0.4.0 : la préversion publiée de l'extension Chrome Pilovo affiche le panneau latéral et le nombre sur le badge, sans notification système ni son. Les sources actuelles ajoutent des notifications système facultatives par service, désactivées par défaut (non publiées ; depuis les sources), qui contiennent seulement le service, le motif et le numéro de session. Votre fournisseur peut proposer ses propres notifications, que Pilovo ne modifie ni ne remplace.

### Pilovo lit-il mes conversations ?

Non. Après votre accord pour un site, l'observateur de Pilovo y lit un ensemble limité de contrôles et d'indicateurs d'état ; il ne collecte ni conversations complètes, ni texte des consignes ou des réponses, ni titres d'onglets, captures, cookies ou identifiants. Rien n'est envoyé à un serveur : Pilovo n'a ni backend ni télémétrie. Voir la [notice de confidentialité](privacy.md) (en anglais).

### Quelles autorisations Pilovo demande-t-il ?

Pilovo exige exactement quatre autorisations Chrome (permissions) : `storage`, `sidePanel`, `alarms` et `scripting`. L'accès à `https://chatgpt.com/*` et à `https://claude.ai/*` est facultatif et demandé séparément pour chaque site ; les sources actuelles ajoutent une seule permission facultative, `notifications` (non publiée), demandée uniquement quand vous cliquez. Pilovo ne demande jamais `tabs`, l'accès à tous les sites ni `nativeMessaging` ; voir [Ce que Pilovo peut voir](#ce-que-pilovo-peut-voir).

### Pilovo est-il sur le Chrome Web Store ?

Non. Pilovo 0.4.0 est une préversion publiée sur GitHub, à charger avec **Charger l'extension non empaquetée**, sans mise à jour automatique. Voir le [guide d'installation](installation.fr.md).

### Pilovo est-il gratuit ? Faut-il un compte ou une clé API ?

Le cœur de Pilovo est gratuit sous licence MIT, sans compte Pilovo, clé API ni application compagnon. Vous continuez d'utiliser votre propre compte web ChatGPT ou Claude, avec ses abonnements et ses quotas.

### « Réponse disponible » signifie-t-il que ma tâche a réussi ?

Non. **Réponse disponible** (réponse prête) signifie que la génération s'est arrêtée d'après la page ; Pilovo ne vérifie pas la réponse. Relisez-la dans le service, car votre tâche peut encore demander du travail. **Vu** indique seulement que vous avez remarqué l'élément.

### Avec quels navigateurs, applications et sites Pilovo fonctionne-t-il ?

Pilovo vise Chrome 120 ou plus récent et observe uniquement les pages `chatgpt.com` et `claude.ai` ouvertes dans des onglets Chrome. Les autres navigateurs, y compris ceux basés sur Chromium, ne sont ni testés ni revendiqués ; Firefox et Safari ne sont pas pris en charge, et ni les applications de bureau ou mobiles ni les autres sites d'IA ne sont observés.

### Pilovo est-il une extension officielle de ChatGPT ou de Claude ?

Non. Pilovo est un projet open source indépendant, sans lien avec les sociétés qui exploitent ChatGPT et Claude, et sans approbation ni parrainage de leur part ; ces noms servent uniquement à désigner les services observés.

D'autres réponses, dont le dépannage : [Questions fréquentes](faq.fr.md).

## Vos préparations manuelles

Les préparations, notes et missions restent disponibles séparément. Copiez puis envoyez vous-même ; leurs statuts restent vos déclarations. Conserver une consigne exige un choix distinct, décoché à chaque création. Titres, dates, notes et liens de mission sont enregistrés même sans conservation de la consigne.

Le stockage et les exports ne sont pas chiffrés par Pilovo. La rétention de l'historique vaut 30 jours par défaut, lorsque l'extension est active. Export JSON 2 disponible, sans import ni synchronisation. La purge garde les préférences et les identifiants historiques minimaux contre le rejeu. Exports, sauvegardes, presse-papiers et conversations fournisseur se gèrent séparément. [Notice de confidentialité](privacy.md) (en anglais).

## Statut et contributions

Pilovo ne revendique ni approbation du Chrome Web Store, ni certification de production, ni taux de couverture, ni nombre d'utilisateurs. Les mesures de performance et les objectifs d'intégration plus larges décrits dans le [PRD](activity-manager-prd.md) et la [feuille de route](roadmap.md) (en anglais) sont des cibles futures. Les changements depuis la 0.4.0 figurent dans le [journal des modifications](../CHANGELOG.md) (en anglais).

[Contribuer](../CONTRIBUTING.md) (en anglais) · [Assistance](../SUPPORT.md) (en anglais) · [Sécurité](../SECURITY.md) (en anglais) · [Licence MIT](../LICENSE). Les anciennes livraisons Briefoak restent un historique distinct.
