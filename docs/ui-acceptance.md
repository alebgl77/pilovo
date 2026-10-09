# Acceptation UI — autonome 0.2.0

**Archive de validation historique.** Ces résultats ne valident pas Pilovo 0.4.0. Le nouveau pilote observe des indicateurs DOM autorisés ; voir [compatibilité actuelle](compatibility.md) et [gates de version](RELEASE.md). Les affirmations ci-dessous décrivent uniquement la livraison 0.2.0.

Validation du 9 octobre 2026 : 14 groupes UI synthétiques, 5 scans axe sans violation détectée, puis 15 groupes Chromium extension réussis sans erreur de page/console. Un contrôle du dialogue facultatif reste manuel. Chromium 148.0.7778.96 sous Windows, profils de test isolés. Les campagnes 0.1.0 ne sont pas utilisées comme preuve de ces parcours.

Présence d'onglet, préparation locale, envoi/fin déclarés par l'utilisateur, reçu historique et revue humaine restent distincts. Aucun résultat/conversation n'est lu, aucun état d'exécution déduit d'une navigation. Démarrage vide hors profils synthétiques.

| Parcours | Résultat attendu | État |
| --- | --- | --- |
| Installation | Vide, aucun compagnon ou accès de site accordé initialement | Réussi dans les tests 0.2.0 |
| Refus | Présence inconnue ; ouverture de l'adresse officielle fixe disponible | Absence de permission et ouverture vérifiées ; refus réel du dialogue encore manuel |
| Accord | Reconnaissance des seuls onglets du site ; mises à jour focus/onglets | Réussi dans les tests 0.2.0 |
| Révocation | Métadonnées reconnues retirées | Tests synthétiques/unitaires réussis ; révocation réelle après accord manuel à vérifier |
| Sans consentement | Case décochée ; consigne absente du stockage/export, copie possible avant fermeture | Réussi dans les tests 0.2.0 |
| Avec consentement | Consigne persistante après rechargement ; choix non hérité par la suivante | Réussi dans les tests 0.2.0 |
| Copier/ouvrir | Actions distinctes, aucune soumission ou transition induite | Réussi dans les tests 0.2.0 |
| Statuts | `prepared`, `sent_by_user`, `completed_by_user` qualifiés et persistants | Réussi dans les tests 0.2.0 |
| Notes/missions | Saisie explicite, association et rechargement | Réussi dans les tests 0.2.0 |
| Données | Export 2 web/ancien ; suppression, purge/rétention incluent web | Réussi dans les tests 0.2.0 |
| Ancien réglage | Passage explicite de conservation à faux efface aussi les consignes web | Réussi dans les tests 0.2.0 |
| Migration | Reçus et provenance conservés ; connexions natives inactives | Réussi dans les tests 0.2.0 |
| FR/EN/thèmes | Libellés, erreurs et préférences cohérents | Réussi dans les tests 0.2.0 |
| Panneau/clavier | 360 px sans débordement, focus/actions accessibles, zoom | 360 px/clavier/scans axe réussis ; zoom et technologie d'assistance restent manuels |
| Manifest/ZIP | 0.2.0, accès exacts, aucun script de contenu/compagnon compilé | Manifeste/bundle vérifiés ; ZIP exact à inspecter après création |

Routes simulées et profils jetables valident les comportements sans prétendre envoyer une tâche à un vrai fournisseur. Aucun compte réel n'est lu.

Une copie de manifeste avec hôtes obligatoires peut vérifier l'état après accord ; elle ne prouve pas l'acceptation d'un vrai dialogue facultatif. Identifier séparément prompts réels, refus/révocations et tests de technologie d'assistance exécutés ou restants.

Les captures synthétiques doivent être signalées. Les résultats navigateur restent dans des répertoires exclus des archives. Le bilan consolidé et la décision de publication appartiennent à [RELEASE](RELEASE.md).

Commande extension : `node tests/e2e/standalone-browser.mjs`. Preuve : `work/standalone-acceptance-2026-10-09T13-53-59-030Z/standalone-evidence.json`. Preuve UI : `extension/tests/ui/results/Autoporteur-ui-report.json`. Le test extension vérifie aussi un redémarrage réel du navigateur, un export JSON téléchargé et une tentative de restauration depuis une deuxième page avec une ancienne révision : rejet `preparation.conflict`, consigne toujours absente.
