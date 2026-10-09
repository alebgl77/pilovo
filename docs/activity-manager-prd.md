# Briefoak — cible produit : gestion de l’activité IA

Date : 10 octobre 2026. Statut : spécification future, aucune capacité nouvelle livrée par ce document.
Ce PRD remplace la préparation manuelle de prompts comme vision produit ; les documents de version restent descriptifs de leur livraison.
Nom de travail conservé : Briefoak. Signature cible : **See and manage AI activity in your browser.**
Cette signature exprime l’objectif, pas une promesse de couverture déjà disponible.

## Objectif et écart actuel

Permettre de comprendre **ce que les IA font maintenant**, de retrouver leur contexte et d’intervenir quand leur intégration le permet.
La cible englobe les conversations web, ChatGPT agent, Claude in Chrome et Claude Code/Codex reliés à Chrome.
Le produit reste une extension Chrome autonome : aucun nouveau compagnon obligatoire, backend ou clé API exigée.
La couverture complète dépend néanmoins des signaux et contrats d’interopérabilité accessibles à chaque fournisseur.
Briefoak 0.3.0 reconnaît des onglets et conserve des préparations avec des statuts déclarés manuellement.
Il n’observe pas l’exécution ni les demandes d’intervention : cette version ne satisfait donc pas l’objectif d’activité en direct.
Les préparations restent secondaires ; une déclaration humaine ne devient jamais une observation automatique.

## Écran d’entrée : Activité

À l’ouverture, afficher le flux d’activité courant et les demandes d’intervention, avant tout formulaire de préparation.
Regrouper par agent, tâche et onglet lorsque leur relation est établie ; afficher « Non attribué » sinon.
Une ligne montre le fournisseur, un identifiant ou libellé non sensible, l’état, sa source, sa fraîcheur et les commandes disponibles.
Le détail présente les transitions attestées et permet de rejoindre l’interface concernée.
Séparer « Présence détectée », « Activité observée » et « Connexion indisponible » dans les filtres et compteurs.
Un onglet ouvert ou une extension installée ne prouve ni une session authentifiée ni une exécution en cours.
Le chargement, le défilement ou le changement d’URL d’un onglet arbitraire ne permet pas d’attribuer son mouvement à une IA.

## Preuves, états et fraîcheur

Chaque état comporte obligatoirement une provenance et un horodatage de réception local.
Conserver aussi l’horodatage émis par la source lorsqu’il existe, en le distinguant de la réception.

| Provenance | Signification affichée |
| --- | --- |
| `observed_ui` | Un indicateur précis de l’interface du fournisseur a été observé. |
| `reported_by_connector` | Un connecteur identifié a déclaré cet état ; ce n’est pas une vérification indépendante. |
| `unknown` | Aucune preuve exploitable et actuelle ; préciser la cause connue. |

Afficher « observé/reçu il y a… » et signaler explicitement toute preuve périmée.
Chaque adaptateur doit documenter et tester sa durée de validité ; aucune durée universelle ne vaut preuve d’activité.
À expiration, perte de connexion, navigation invalidante ou révocation, l’état courant devient inconnu ; le dernier état reste daté comme historique.

| État normalisé | Condition nécessaire |
| --- | --- |
| `working` — En cours | Indicateur d’exécution reconnu ou événement explicite du connecteur. |
| `needs_user` — Intervention requise | Demande explicite d’information, de connexion, de reprise en main ou d’approbation. |
| `error` — Erreur | Indicateur d’erreur propre à cette activité, sans copier le contenu privé du message. |
| `ended` — Activité terminée | Signal de fin reconnu pour cette activité. |
| `unknown` — État inconnu | Signal absent, ambigu, périmé ou inaccessible. |

La disparition d’un bouton, le silence ou la fermeture d’un onglet ne suffisent pas seuls à conclure à une fin.
« Activité terminée » ne garantit jamais « tâche réussie », résultat correct ou objectif utilisateur atteint.
Les budgets, coûts et tokens n’apparaissent que si la source fournit réellement ces métadonnées, avec leur provenance ; sinon les omettre.

## Matrice des intégrations à qualifier

Les lignes suivantes définissent le périmètre futur, sans affirmer l’existence d’un connecteur Briefoak opérationnel.

| Source | Observation envisageable | Contrôle et limite |
| --- | --- | --- |
| ChatGPT web | Indicateurs et contrôles d’état dans le DOM autorisé ; contenu des échanges exclu. | Focus ; commandes uniquement après validation de chaque contrôle exposé. |
| Claude web | Même périmètre : indicateurs d’interface, sans lire prompts ni réponses. | Même qualification par capacité ; aucune symétrie présumée avec ChatGPT. |
| ChatGPT agent | État et demandes exposés dans l’interface ChatGPT accessible localement. | Contrôles exposés seulement ; aucun accès implicite aux onglets ou actions internes du navigateur distant. |
| Claude in Chrome | Événements d’un contrat d’interopérabilité documenté et accepté, s’il existe. | L’isolation entre extensions empêche de présumer un accès à son état interne ; contrôle soumis au même contrat. |
| Claude Code relié à Chrome | Pont officiel existant vers Claude in Chrome ; signaux utilisables par Briefoak à établir séparément. | Ce pont ne prouve aucune API publique ni aucun droit de contrôle pour Briefoak. |
| Codex relié à Chrome | Métadonnées d’un pont existant seulement si un contrat accessible les expose. | Processus externe non gérable par Chrome seul ; capacité inconnue jusqu’à validation de ce contrat. |

Claude Code documente sa connexion à Claude in Chrome et des onglets locaux visibles regroupés par session : le pont existe bien. [Documentation Claude Code](https://code.claude.com/docs/en/chrome).
ChatGPT documente un navigateur virtuel et un navigateur cloud distinct du navigateur local. [ChatGPT agent](https://help.openai.com/en/articles/11752874-chatgpt-agent), [Cloud browser](https://help.openai.com/en/articles/20001280-using-cloud-browser-in-chatgpt).
Déduction pour Briefoak : ni ces onglets groupés ni l’existence de ces ponts ne constituent un contrat de supervision interopérable.
Sans contrat exploitable, afficher la limite et un accès au contexte disponible ; ne pas inventer d’activité ni imposer un nouveau compagnon.

## Commandes et intervention humaine

« Rejoindre » active l’onglet et sa fenêtre lorsqu’ils existent et sont accessibles ; cette action ne change pas l’état d’exécution.
Arrêter, mettre en pause, reprendre, réessayer ou lancer ne sont proposés que si le connecteur prend précisément cette commande en charge.
Une capacité non prise en charge reste absente ou désactivée avec une explication concrète.
Une demande envoyée, un accusé de réception et un effet confirmé sont trois faits distincts.
Après « Arrêter », afficher « Arrêt demandé » jusqu’à une preuve ; en cas de délai dépassé, afficher « Arrêt non confirmé ».
Ne jamais présenter la fermeture d’un onglet comme un arrêt du processus ou d’un agent distant.
Aucun faux bouton « Tout mettre en pause » : une commande collective doit annoncer ses cibles compatibles et les échecs individuels.
Toute commande part d’une action explicite de l’utilisateur ; lancer ou réessayer expose la cible et le risque de répéter une action.
Les approbations d’achat, d’envoi, de publication et autres actions conséquentes restent des décisions explicites dans l’interface du fournisseur.
Briefoak peut attirer l’attention et ouvrir cette interface ; il ne clique jamais automatiquement sur ses approbations.

## Adaptateurs, permissions et sécurité

Créer des adaptateurs distincts par fournisseur et surface ; déclarer séparément découverte, observation et commandes.
Avant activation, documenter les signaux réellement accessibles, les versions testées, les ambiguïtés et la perte de connexion.
N’inventer aucun sélecteur DOM, endpoint, identifiant d’extension ou API ; les établir sur une interface ou un contrat réellement inspecté.
Tout changement non reconnu doit dégrader l’état vers inconnu et désactiver la commande concernée.
Demander les permissions d’hôte optionnelles fournisseur par fournisseur, au moment où l’utilisateur active l’observation.
L’observation d’état est distincte de toute capture de conversation ; la seconde n’appartient pas au présent périmètre.
Limiter la lecture aux indicateurs et contrôles nécessaires ; ne collecter ni prompts, réponses, saisies, captures d’écran, cookies ni identifiants de connexion.
Avant d’activer un observateur, mettre à jour les informations de confidentialité, permissions et distribution : l’ancienne promesse « aucun accès au contenu de page » ne convient plus.
Valider l’émetteur de chaque message, son origine, l’onglet, le cadre/document et le schéma autorisé ; traiter les données de page comme non fiables.
Associer chaque observation à une époque de document/session ; rejeter les messages tardifs d’une navigation ou connexion précédente.
À révocation, interrompre l’observation, invalider les capacités et supprimer les associations devenues interdites.
Après redémarrage, reconstruire les connexions et exiger des preuves fraîches ; ne jamais restaurer un ancien état comme activité actuelle.

## Données et durée de vie

En session : identifiants locaux temporaires, relations agent/tâche/onglet, état, provenance, fraîcheur et suivi des commandes.
Les associations doivent venir d’une preuve de connecteur ou d’une liaison explicite de l’utilisateur, jamais du contenu d’une conversation.
Par défaut, aucun historique durable d’activité ; les données de session expirent avec la session ou leur révocation.
Si l’utilisateur active un historique minimal, ne conserver que les dates d’observation et de fin attestée, sans contenu, titre ni URL de conversation.
Cet historique est supprimable et soumis à une durée de rétention visible ; il ne permet pas de reconstituer une activité en cours.

## Cinq parcours d’acceptation

1. **Deux conversations simultanées.** Sur deux surfaces web autorisées avec indicateurs pris en charge, le flux distingue deux activités ; une demande d’intervention ne modifie pas l’autre. Chaque ligne fournit source et fraîcheur, et « Rejoindre » cible le bon onglet sans lire les échanges.
2. **Agent observable.** Pour ChatGPT agent ou un connecteur d’agent validé, un événement de travail puis d’intervention met à jour la bonne tâche. L’interface distingue l’observation locale du signal déclaré ; un onglet sans relation attestée reste non attribué.
3. **Perte d’observation.** Fermer, suspendre/geler l’onglet observateur ou révoquer son accès rend l’activité inconnue avec sa cause, sans déclarer l’agent terminé. Après navigation ou redémarrage, un événement ancien est rejeté et une preuve fraîche est nécessaire.
4. **Arrêt demandé puis confirmé.** Sur une capacité d’arrêt validée, le clic envoie une seule demande à la bonne activité. Un accusé seul ne vaut pas arrêt ; une preuve le confirme, un délai dépassé reste non confirmé, et aucune réussite de tâche n’est déduite.
5. **Processus externe non pris en charge.** Claude Code/Codex sans contrat accessible apparaît comme intégration indisponible ou état inconnu. L’installation d’une extension ou des mouvements d’onglets ne créent ni activité attribuée ni commande fictive.

## Ordre de livraison et qualification

1. Priorité : états web réellement observés, fraîcheur, dégradation vers inconnu et accès au bon contexte.
2. Ensuite : connecteurs d’agents validés individuellement, avec relations tâche/onglet et demandes d’intervention attestées.
3. Enfin : commandes qualifiées une par une, avec preuve d’effet et gestion des échecs.

Chaque version publie une ligne par couple intégration/capacité : `version | intégration | capacité | planifiée/expérimentale/disponible/non prise en charge | preuve datée | limites`.
« Disponible » exige les parcours pertinents réussis sur la version livrée ; « expérimental » exige aussi une preuve datée et ses limites.
La v0.3.0 reste qualifiée comme préparation manuelle et reconnaissance d’onglets ; ce PRD ne change pas son manifeste, ses permissions ni ses fonctionnalités.

## Fondements Chrome et limites des sources

Les content scripts peuvent lire le DOM autorisé et disposent d’un environnement isolé ; cela rend l’observation d’indicateurs envisageable, sans prouver leur disponibilité chez un fournisseur. [Chrome : content scripts](https://developer.chrome.com/docs/extensions/develop/concepts/content-scripts).
Chrome propose une messagerie entre composants et entre extensions, ainsi que des échanges avec un hôte natif enregistré. Un fournisseur doit exposer et accepter un contrat pour permettre une intégration ; aucune API Briefoak n’en découle automatiquement. [Chrome : messaging](https://developer.chrome.com/docs/extensions/develop/concepts/messaging).
L’API Tabs décrit des onglets, leur activation et leur suspension ; elle ne décrit pas l’intention d’un agent. Déduire une exécution IA de ces seuls événements serait une hypothèse non étayée. [Chrome : Tabs](https://developer.chrome.com/docs/extensions/reference/api/tabs).
Ces sources établissent des mécanismes généraux. La compatibilité, les signaux et les commandes de chaque adaptateur restent à vérifier avant toute annonce de livraison.
