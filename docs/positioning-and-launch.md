# Briefoak — positionnement et lancement international

Document de travail du 9 octobre 2026. Les données concurrentes sont des observations datées, les cibles ci-dessous sont des objectifs d'apprentissage. Aucune traction de Briefoak n'est revendiquée. Aucun message, article ou campagne externe n'a été envoyé.

## Une promesse étroite et vérifiable

**A local prompt desk for Claude & ChatGPT.**

Pour les consultants, chercheurs et rédacteurs qui passent d'un compte web à l'autre, Briefoak propose un endroit où préparer les consignes, regrouper une mission et retrouver ce que l'on a soi-même déclaré envoyé ou terminé. Le produit conserve une séparation visible entre le travail préparé, l'action humaine et un résultat réellement observé.

Trois verbes organisent la présentation : **Prepare → Copy → Follow through**. En français : **Préparer → Copier → Garder le fil**. Les boutons de téléchargement dirigent vers la livraison GitHub à charger manuellement. Aucun bouton Chrome Web Store n'apparaît tant qu'il n'existe pas de fiche publiée.

Le bénéfice à tester est la continuité personnelle du travail, pas l'automatisation. Une personne peut préparer des consignes pour plusieurs fournisseurs, consigner sa décision et revenir à la mission. Elle copie, colle et envoie elle-même. L'extension ne lit aucune conversation ni réponse et ne vérifie pas l'exécution.

Cette cible et ce bénéfice sont des hypothèses. Le marché contient déjà des outils locaux et multifornisseurs : le caractère local n'est pas une preuve d'unicité.

## Ce que montrent des produits établis

Observations de sources primaires du 9 octobre 2026. Les chiffres affichés peuvent évoluer. Les utilisateurs d'une fiche Chrome Web Store, une note et une déclaration d'éditeur ne mesurent pas la même chose ; ils ne prouvent ni revenu, ni rétention, ni effet causal d'une décision de design.

| Référence | Signal observé | Enseignement possible pour Briefoak |
| --- | --- | --- |
| [Sider](https://sider.ai/) | L'éditeur annonce 10 millions d'utilisateurs actifs ; ce n'est pas un compteur d'installations Chrome vérifié ici. | Expliquer un travail concret et montrer le produit immédiatement. |
| [AIPRM](https://chromewebstore.google.com/detail/aiprm-for-chatgpt/ojnbohmppadfgpejeebfnmnknjdlckgj) | Fiche affichant 1 million d'utilisateurs, note 3,9. | Une promesse autour de la préparation des prompts est compréhensible sans vocabulaire d'orchestration. |
| [Text Blaze](https://chromewebstore.google.com/detail/text-blaze-templates-and/idgadaccgipmpannjkmfddolnnhmeklj) | Fiche affichant 800 000 utilisateurs, note 4,9. | Illustrer les gestes et le temps de reprise du travail avec de vrais exemples. |
| [Raindrop.io](https://chromewebstore.google.com/detail/raindropio/ldgfbffkinooeloadekpmfoklnobpien) | Fiche affichant 500 000 utilisateurs, note 4,1. | Présenter l'organisation comme une activité familière. |
| [Todoist pour Chrome](https://chromewebstore.google.com/detail/todoist-for-chrome-planne/jldhpllghnbhlbpcmnajkpdmadaolakh) | Fiche affichant 500 000 utilisateurs, note 4,7. | Rendre le prochain geste visible et garder les états compréhensibles. |
| [Superpower ChatGPT](https://chromewebstore.google.com/detail/superpower-for-chatgpt/amhmeenmapldpjdedekalnfifgnpfnkc) | Fiche affichant 100 000 utilisateurs, note 4,5. | Nommer clairement le fournisseur concerné et la catégorie d'usage. |
| [Threadlane](https://chromewebstore.google.com/detail/threadlane/fgajmfkookghcacddnmhfkamefndgfei) | Présente déjà un espace local entre fournisseurs, notes/surlignage, consignes de révision et suivi automatique en bêta. | Éviter « premier espace local multifornisseur » et différencier précisément le périmètre d'accès. |

Ces références répondent à des besoins différents. Les chiffres ne constituent pas un classement de qualité ni une validation de Briefoak. La comparaison de fonctionnalités repose sur leurs descriptions publiques, sans audit de leur code ou de leurs pratiques de confidentialité.

Les motifs utiles observés sont une promesse lisible, des captures réelles, un premier parcours court et une explication des permissions. Ce sont des pistes de conception, pas une preuve que ces motifs ont causé leur popularité.

## Différenciation à éprouver

| Question d'un utilisateur | Réponse actuelle de Briefoak |
| --- | --- |
| Dois-je brancher une clé API ou payer un modèle via cette extension ? | Non. Le travail se déroule dans vos comptes web habituels ; leurs règles et quotas restent applicables. |
| Faut-il donner mes conversations à l'extension ? | Non. Elle ne lit ni pages de conversation ni réponses. L'accès de site facultatif sert aux métadonnées des onglets correspondants. |
| Peut-elle envoyer ou vérifier un travail à ma place ? | Non. Copie, navigation, envoi chez le fournisseur et déclarations de statut sont des actions distinctes. |
| Est-ce que « local » signifie chiffré ? | Non. Briefoak n'ajoute pas de chiffrement au profil Chrome ou aux exports. |
| Puis-je reprendre ma mission dans une autre machine ? | L'export JSON existe, mais import et synchronisation ne sont pas implémentés. |
| Est-ce un produit mature disponible en boutique ? | C'est une première livraison GitHub à installer manuellement. Les contrôles exécutés et manuels restants sont documentés. |

L'hypothèse de préférence est simple : certaines personnes accepteront un geste manuel supplémentaire en échange d'un périmètre facile à comprendre. Cette préférence doit être observée ; elle n'autorise aucune affirmation générale de supériorité ou de sécurité.

## Identité et preuves visuelles

Le nom **Briefoak** associe l'idée du brief à un endroit stable où revenir. Une recherche publique préliminaire n'a trouvé aucun exact homonyme dans les sources consultées. Cela ne constitue ni une recherche de marque exhaustive ni une garantie d'exclusivité.

Le README anglais porte la promesse internationale. Une documentation française équivalente accompagne le produit FR/EN. Le logo géométrique B et la palette olive restent indépendants des marques fournisseurs. Les captures montrent l'interface réelle en aperçu navigateur avec données locales fictives ; aucune conversation ou exécution fournisseur n'est représentée comme preuve.

La licence MIT facilite l'examen et la réutilisation du code. Les bibliothèques tierces conservent leurs licences et notices. La transparence du dépôt n'est ni une certification de sécurité ni une approbation de Chrome, Anthropic ou OpenAI.

## Cinq phases de lancement

| Phase | Action concrète proposée | Mesure et seuil de décision proposés |
| --- | --- | --- |
| 1 — Préparer la livraison | Publier le dépôt, le guide FR/EN, la notice, les captures, le ZIP et ses sommes de contrôle ; terminer les contrôles manuels prioritaires. | Zéro lien local cassé ; CI verte sur le commit publié ; 3 installations manuelles documentées sur profils vierges avant élargissement. |
| 2 — Observer le premier usage | Recruter volontairement 5 à 8 consultants/rédacteurs utilisant déjà les deux comptes web. Observer leur première préparation sans voir leurs vrais prompts. | Objectif : 4 personnes sur 5 terminent le parcours en moins de 3 minutes et expliquent correctement ce que l'extension peut voir. Si confusion sur les statuts, corriger avant acquisition. |
| 3 — Tester le message | Présenter deux formulations honnêtes à de petits groupes anglophones et francophones, avec le même produit et la même démonstration. | Compter les visites consenties de la page de lancement, téléchargements et installations auto-déclarées. Comparer compréhension et objections ; viser 10 retours qualitatifs avant de retenir un message. Aucun taux de conversion prétendu existant. |
| 4 — Publier dans quelques communautés pertinentes | Préparer un récit de création, une courte vidéo réelle et des exemples consultants/rédacteurs ; respecter les règles de chaque communauté et publier manuellement. | Objectif : 3 canaux pertinents maximum au départ, 15 retours exploitables, temps de support mesuré. Arrêter une diffusion si les personnes attendent une automatisation absente. |
| 5 — Consolider puis envisager la boutique | Prioriser les frictions récurrentes, documenter les évolutions et décider si une soumission Chrome Web Store est justifiée. | Enquête volontaire à J7 : retour au produit, mission reprise, raison d'abandon. Cible exploratoire : au moins 5 personnes reprennent une mission et 3 recommanderaient le parcours pour un besoin précis. Une petite cohorte n'est pas une preuve statistique. |

Les volumes et seuils sont des choix de travail, pas des engagements commerciaux. GitHub Stars, téléchargements et visites sont des signaux de découverte ; aucun ne mesure à lui seul un utilisateur actif. Les personnes ne sont jamais comptées deux fois comme preuve d'adoption.

## Mesurer sans modifier la promesse locale

Aucune télémétrie n'est ajoutée à l'extension. Pour les premières phases, privilégier entretiens volontaires, observations avec exemples fictifs et questionnaire séparé minimal. Ne pas demander les exports ou conversations privés. Compter les événements publics GitHub comme tels et expliquer leurs limites.

Toute future mesure dans le produit demanderait une proposition distincte, un consentement et une mise à jour des documents ; elle n'est pas implicitement autorisée par ce plan.

## Textes prêts à adapter

**Phrase de présentation anglaise :** “Briefoak is a local prompt desk for Claude & ChatGPT. Prepare a brief, copy it into your web account, and keep a personal record of what you sent.”

**Phrase de présentation française :** « Briefoak rassemble vos préparations Claude et ChatGPT dans un bureau local. Vous copiez et envoyez vous-même, puis gardez le fil de vos missions. »

**Invitation aux premiers retours :** “Try the unpacked preview with a fictional brief. Was it clear what Briefoak stores, what it can see, and which actions remain yours?”

Ces textes sont des brouillons : aucune publication externe n'a été effectuée. Ne pas ajouter d'avis inventé, compteur de clients, badge de certification ou promesse « premier/seul ».
