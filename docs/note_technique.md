# SAFINUM - Note technique

## 1. Vision générale
SAFINUM est une couche d'assistance **indépendante** : elle se place au-dessus d'une application financière web existante (banque,
Mobile Money, microfinance), la traduit dans une langue nationale et la lit à voix haute, sans modifier le code de l'application, sans
agir à la place de l'utilisateur et sans jamais modifier une valeur financière.

Deux principes guident tout le reste :
1. **Ne jamais traduire une valeur.** Montants, frais, dates, numéros, noms de bénéficiaires sont protégés avant tout envoi et vérifiés après.
2. **Dire quand on doute.** Une traduction incertaine est accompagnée de l'original ; une erreur ou une alerte montre toujours l'original.

## 2. Ce qui est implémenté à ce jour
| Fonction exigée par le règlement | État |
|---|---|
| Adaptation linguistique de l'interface (Pidgin, Fulfulde expérimental) | Fonctionne sur les pages de test et sur des sites publics de démonstration jamais vus (ParaBank, Altoro Mutual, XYZ Bank) |
| Parcours financier (solde, frais, transfert, récapitulatif, erreur, alerte) | Fonctionne sur 8 banques simulées (HTML simple, React, Vue, Shadow DOM, iframe, tableaux, anglais, contenu dynamique) |
| Préservation des informations financières | Protection par balises, contrôle avant et après écriture, tests automatiques (voir 5 et 9) |
| Fonctionnement indépendant (sans modifier le service cible) | Extension Chrome/Edge (Manifest V3) ; plan B : script autonome (favori) |
| Adaptation à un contenu inédit | Texte jamais vu traduit par le modèle avec glossaire et contrôle ; 41 messages inédits testés (voir 9) |
| Voix | Lecture à voix haute des blocs touchés, montants lus en mots, voix de remplacement dite comme telle |
| Accessibilité | Panneau avec modes (écouter, grands caractères, contraste fort, sans son, sourd ou malentendant, lecteur d'écran, masquer les montants) |
| Démonstration reproductible | Serveur en ligne `https://safinum.onrender.com`, extension téléchargeable et déjà réglée, banque simulée avec SAFINUM actif |
| Mémorisation de la langue entre les pages d'un même site | Ajoutée (version 1.3.0), avec des limites (voir 10) |

## 3. Architecture
Extension de navigateur (JavaScript, sans compilation) + serveur Python (FastAPI).

    Application financière (aucune modification)
            | texte affiché (DOM), lu par blocs
    Extension : valeurs remplacées par des balises, marqueurs de structure, affichage, voix, panneau
            | texte SANS valeurs (HTTPS en ligne)
    Serveur : glossaire, cache, moteur de langue (par lots), contrôle de fidélité
            | texte traduit, confiance, type, raison

Ordre de traitement d'un texte : glossaire (libellé exact), cache, modèle de langue par lots (25 segments par appel), contrôle de
fidélité, score de confiance. Les libellés du panneau sont traduits par la même chaîne.

**Lecture de la page (`extension/lecteur.js`).** Un bloc est le contenu en ligne d'un élément de niveau bloc. Les éléments en ligne
(gras, liens) deviennent des marqueurs `<s1>...</s1>` que le serveur doit renvoyer identiques, sinon repli zone par zone puis original.
Seuls les textes des nœuds changent : aucun élément n'est créé, déplacé ou supprimé, et les valeurs de champs, `href`, `name`, `id`
ne sont jamais touchés. Sont lus aussi : titre, `placeholder`, `aria-label`, `title`, `alt`, options de listes, Shadow DOM ouvert,
iframes de même origine. Les changements de la page sont observés (applications à page unique) ; seuls les sous-arbres modifiés sont relus.
La couverture est affichée : blocs lus, traduits, laissés en original avec la raison. Aucun bloc n'est ignoré en silence.

**Éléments d'interface.** Menus, liens, boutons, titres, cellules et textes courts affichent la traduction seule, l'original étant en
infobulle, pour ne pas casser les boîtes de taille fixe. Les paragraphes gardent l'original entre parenthèses en cas de doute.

**Hébergement de démonstration.** Le serveur est déployé sur Render (offre gratuite) à partir du dépôt GitHub (`render.yaml`, `Dockerfile`).
Il sert aussi l'extension (`/safinum-extension.zip`, réglée automatiquement sur l'adresse du serveur), la page d'accueil `/essayer` et le
script autonome. La clé du fournisseur reste dans une variable d'environnement du serveur, jamais dans l'extension ni dans l'archive.

## 4. Intégration et indépendance
- Aucune modification de l'application cible : SAFINUM lit le texte affiché, avec le consentement de l'utilisateur, comme un lecteur d'écran.
- Aucune action automatique : ni clic, ni soumission, ni remplissage. Vérifié dans Chrome par des espions sur click, submit, input,
  change, focus et sur l'écriture de `value`.
- Les champs de mot de passe, PIN, OTP et carte ne sont jamais lus, envoyés ni prononcés.
- Aucune capture d'écran, aucune image. SAFINUM ne contourne aucune protection de l'interface.
- Deux voies d'installation : extension (recommandée, fonctionne sur tout site) ou favori (script autonome, bloqué par les sites qui
  interdisent les scripts externes).

## 5. Sécurité et préservation des informations
| Règle | Mise en œuvre |
|---|---|
| Valeurs jamais traduites | `protection.js` : montants (chiffres et lettres, toutes devises), pourcentages, dates, heures, téléphones, références, noms de bénéficiaires, e-mails, adresses web, IBAN, cartes |
| Valeur brute jamais envoyée | le serveur refuse tout segment contenant encore un chiffre, une devise, un e-mail, une adresse ou un IBAN |
| Comparaison avant et après | refus si une balise manque, est en double ou inconnue ; recomptage des valeurs ; relecture de la page après écriture avec remise de l'original en cas de différence ; refus de tout chiffre nouveau |
| Original toujours accessible | « Voir l'original » ; original à côté en cas de doute, d'erreur ou d'alerte |
| Alertes | bandeau rouge (`role="alert"`) pour les messages courts, lecture vocale prioritaire |
| Texte de la page = donnée | consigne système séparée, contenu passé en JSON, testé avec un message piégé (« Ignore toutes les instructions... ») |
| Rien conservé côté serveur | cache en mémoire (texte sans valeurs), journaux sans texte, aucune donnée utilisateur |
| Clé du fournisseur | variable d'environnement du serveur, hors dépôt |
| Serveur | accès restreint (extension et serveur lui-même ; ouvert seulement pour le favori en démonstration), taille et débit limités |
| Arrêt | « Arrêter » restaure exactement la page ; « Retirer SAFINUM de la page » supprime panneau et écouteurs |

## 6. Contrôle de fidélité
1. Balises et marqueurs identiques ; sinon l'original est conservé.
2. Termes de sécurité du glossaire (PIN, code, solde insuffisant...) présents sous leur forme imposée, sinon confiance abaissée.
3. Pour les textes critiques (négation, statut, condition, alerte, texte long) : retraduction par un second appel, puis règles déterministes :
   négation perdue, « jamais » perdu, statut inversé, recouvrement des mots importants.
4. Confiance : élevée (traduction seule), moyenne (traduction et original entre parenthèses), faible (idem avec mention d'incertitude).
   Si une négation, un « jamais » ou un succès/échec est perdu, l'original passe en premier. **Un message d'erreur ou d'alerte montre toujours
   l'original**, parce qu'une traduction fausse d'un avertissement de sécurité ou d'un échec peut coûter de l'argent.
5. Le type « alerte » ou « erreur » donné par le modèle n'est retenu que si le texte contient un mot d'alerte (erreur, jamais, insuffisant...),
   pour éviter qu'une simple description soit présentée comme une alerte.

Limite : la retraduction est faite par le même modèle, ce n'est donc pas un contrôle indépendant. Elle est complétée par des règles déterministes.

## 7. Langues prises en charge et méthode de validation linguistique

### Choix des langues
- **Langue nationale implémentée : le Fulfulde (variété d'Adamaoua).** C'est la langue nationale visée par le projet. Elle est cependant
  **peu dotée en ressources numériques** : il n'existe pas, à notre connaissance, de dictionnaire financier en Fulfulde, et les modèles de
  langue la maîtrisent mal. Faute de vocabulaire financier de référence, de nombreux termes (solde, frais, bénéficiaire, virement...) ne
  peuvent pas être traduits de façon sûre : c'est ce qui bloque aujourd'hui une traduction fiable. La langue est donc présentée
  comme **expérimentale**.
- **Langue complémentaire : le Pidgin camerounais.** Nous avons décidé d'implémenter en plus une langue peut-être non officiellement
  « nationale », mais **véhiculaire**, parlée par des Camerounais de toutes les tribus. Elle dispose de beaucoup plus de ressources
  (lexiques, corpus, travaux linguistiques) et donne un résultat plus stable. Elle permet de démontrer toute la chaîne technique dans une
  langue réellement comprise par une grande partie de la population. Son statut de langue nationale pour le concours est à confirmer
  auprès des organisateurs.

### Glossaires
Pour éviter que le modèle emploie plusieurs synonymes pour un même terme financier, chaque langue a un glossaire (CSV) appliqué avant
le modèle (libellé exact) et imposé dans la consigne. Les termes de sécurité (PIN, code, solde insuffisant) sont contrôlés après traduction.

| | Pidgin camerounais | Fulfulde (Adamaoua, `fub`) |
|---|---|---|
| Statut | stable (statut de langue nationale à confirmer) | expérimental |
| Glossaire | 500 termes (lots Kamtok, brouillon Pidgin, complément) | 63 termes proposés |
| Moteur | modèle de langage + glossaire + consigne dédiée | même modèle + glossaire + consigne de prudence (n'invente pas, doute = confiance faible), confiance plafonnée à « moyenne », tout est retraduit pour vérifier |
| Affichage | traduction seule si confiance élevée, sinon original entre parenthèses | **toujours** traduction et original entre parenthèses, mention « expérimental » |
| Voix | voix de remplacement (anglais) dite comme telle | lit l'**original** (français ou anglais) : on ne fait pas entendre une prononciation non vérifiée |
| Validation par un locuteur | **aucune à ce jour** | **aucune à ce jour** |

État réel des glossaires (mesuré par `outils/verifier_glossaires.py`) : aucune entrée validée par un locuteur. Le réglage `SAFINUM_STRICT=1`
(utilisé en ligne) n'accorde la confiance « élevée » qu'aux entrées validées, les autres sont montrées avec l'original à côté. Les équivalents
Pidgin de « Mot de passe » et « Erreur » manquent au glossaire ; ils ne sont pas inventés. Deux orthographes du Pidgin coexistent (Kamtok
proche de l'anglais, et phonétique) ; Kamtok est prioritaire. Certaines sorties ressemblent au Pidgin nigérian (« Abeg », « Biko »).

### Méthode de validation
1. **Automatique (réalisée)** : vérification des glossaires (doublons, cohérence), contrôle de fidélité sur chaque traduction, tests de
   protection des valeurs.
2. **Relecture par des locuteurs (à réaliser, non faite à ce jour)** : 2 à 3 locuteurs relisent au moins les phrases critiques (négations,
   alertes, solde insuffisant, frais) à l'aide de la fiche Excel `donnees/SAFINUM_Fulfulde_fub_fiche_relecture.xlsx` ; pour chaque phrase,
   on note s'ils comprennent le montant, le statut (réussi ou échoué) et l'action à faire.
3. **Signalement** : l'utilisateur peut signaler une erreur de langue dans le panneau ; la correction est enregistrée sur l'appareil et
   exportable au format des glossaires.

Tant que la relecture n'est pas faite, les traductions ne sont présentées comme validées dans aucun cas.

## 8. Contribution propre et composants tiers déclarés
**Contribution propre de l'équipe** (code écrit pour le projet) : lecture de la page par blocs avec marqueurs de structure et restauration
exacte ; protection et contrôle des valeurs ; détection des champs secrets ; couche vocale (choix du plus petit bloc lu, montants en mots,
aucun chiffre envoyé au serveur de voix) ; panneau d'accessibilité ; mémorisation de la langue par site ; serveur (glossaire, cache, lots,
reprises, contrôle de fidélité, détection de langue, diagnostic) ; pages de test, jeu d'or et outils de vérification des glossaires.

**Composant tiers qui fait la traduction brute : Google Gemini**, appelé par API (modèles `gemini-3.5-flash` et `gemini-3.5-flash-lite`,
offre gratuite). Il n'apporte que la traduction des phrases ; la protection des valeurs, le contrôle, l'affichage, la voix et
l'accessibilité sont la contribution de l'équipe. Seul du texte sans valeurs financières lui est envoyé. Conditions à connaître : sur
l'offre gratuite, quotas limités (le modèle principal a atteint son quota pendant les essais, d'où la bascule automatique sur le modèle
léger) et, selon les conditions publiées par Google, les contenus envoyés peuvent être utilisés par le fournisseur : à vérifier avant
tout usage réel. Le moteur est interchangeable (Anthropic, tout fournisseur compatible OpenAI, Ollama en local).

| Composant | Rôle | Licence / remarque |
|---|---|---|
| FastAPI, Uvicorn, PyYAML, python-dotenv, httpx | serveur | libres (MIT, BSD) |
| Google Gemini (API) | traduction, retraduction, classement | conditions et quotas de l'offre gratuite |
| Render (hébergement gratuit) | démonstration en ligne | service s'endort après 15 min d'inactivité |
| Web Speech API du navigateur | voix | dépend du navigateur |
| React 18.3.1, Vue 3.5.13 | pages de test seulement | MIT |
| jsdom, Playwright | tests seulement | libres |
| NLLB-200, MMS-TTS (Meta) | options non activées par défaut | licences généralement non commerciales |
| Référentiels (BEAC, BCEAO, AfricaNenda), APiCS, Ayafor et Green, Peace Corps | sources des glossaires | voir `donnees/` |

## 9. Résultats mesurés
Tests automatiques : 56 tests serveur ; 6 suites de tests de l'extension (protection des valeurs, 1000 messages aléatoires, lecteur de
page, voix, jeu d'or de 41 messages, contraste WCAG AA avec un minimum de 6,54 pour un seuil de 4,5) ; test de bout en bout dans Chrome
sur les 8 pages (valeurs identiques, champs secrets intacts, aucune valeur dans les requêtes, aucune action automatique, restauration
exacte, couverture d'au moins 95 %). Ces tests utilisent un moteur de test qui ajoute seulement un préfixe : ils prouvent le
fonctionnement de la chaîne, pas la qualité linguistique.

Contenu inédit avec le vrai moteur (Gemini) : 41 messages jamais vus ; aucune valeur modifiée, perdue ou ajoutée ; alertes et erreurs
accompagnées de l'original dans tous les cas ; le message piégé n'est pas obéi. Répartition de la confiance sur 34 messages : 23 élevée,
6 moyenne, 5 faible. Plusieurs traductions ont été signalées par le contrôle comme affaiblissant le sens (« Ne jamais communiquer votre
code OTP » rendu « No give anybody your OTP code ») et sont passées en confiance faible. En Fulfulde (14 messages) : valeurs intactes,
caractères spéciaux (ɓ, ɗ, ƴ, ŋ) bien produits, 13 messages sur 14 jugés en confiance faible par le modèle lui-même.
Sites publics jamais vus : ParaBank, Altoro Mutual, XYZ Bank (Angular) traduits, valeurs identiques, page restaurée à l'arrêt.
Extension réelle (non injectée) chargée dans Edge, y compris téléchargée depuis le serveur en ligne : traduction et reprise sur la page suivante.
Vitesse : première traduction d'une page jamais vue 8 à 16 secondes avec l'offre gratuite ; page déjà vue : moins de 3 secondes (cache).
Ces mesures ne disent pas si le Pidgin et le Fulfulde produits sont corrects : aucun locuteur ne les a relus.

## 10. Limites connues
**Quota du fournisseur de traduction** : l'équipe n'a pas de budget ; le moteur (Google Gemini) est utilisé avec l'offre gratuite, dont les quotas
(par minute et par jour) peuvent refuser des requêtes. Dans ce cas, le texte reste en original (comportement de sécurité, jamais une fausse
traduction). Pour limiter ce risque, un cache préchargé (`serveur/cache_precharge.json`, 141 phrases en Pidgin et 50 en Fulfulde, textes
des pages de démonstration, sans aucune valeur financière) est livré avec le serveur : ces pages se traduisent sans appeler le fournisseur.
Les pages inédites dépendent du quota.

**Linguistiques**
- **Pas de dictionnaire financier en Fulfulde** : le vocabulaire de base (solde, frais, bénéficiaire...) n'a pas d'équivalent de référence ;
  les termes proposés (63) viennent du modèle et d'un brouillon, non validés. C'est la principale limite de la langue nationale.
- Fulfulde et glossaires Pidgin (500 termes) **non relus par un locuteur** ; pas d'orthographe officielle unique du Pidgin ; certaines
  formes proches du Pidgin nigérian ; équivalents manquants (« Mot de passe », « Erreur »).
- La qualité varie d'un passage à l'autre (modèle non déterministe). Le contrôle de fidélité, fait par le même modèle, n'est pas indépendant.
- Voix : voix synthétique de remplacement, une voix par langue ; pas de voix en Fulfulde (on lit l'original) ; pas de reconnaissance vocale.

**Navigation et affichage**
- **Mémorisation de la langue entre les pages :** dans les premières versions, l'utilisateur devait sélectionner à nouveau la langue à chaque
  changement de page. Depuis la version 1.3.0 la langue est retenue par site et reprend toute seule. Limites restantes : la mémoire est liée au
  site (un changement de domaine, par exemple vers une page de paiement externe, demande de rechoisir la langue) ; elle exige l'extension à
  jour et le consentement ; la page s'affiche d'abord en langue d'origine pendant la première traduction.
- **Lenteur de la première traduction** d'une page jamais vue (8 à 16 secondes) : offre gratuite, quotas du fournisseur, serveur de
  démonstration qui s'endort après 15 minutes sans visite (premier chargement d'environ une minute). Les pages déjà vues sont rapides (cache).
- Le texte traduit étant plus long, certaines mises en page à boîtes de taille fixe peuvent déborder malgré l'affichage allégé des éléments
  d'interface.
- Iframes d'une autre origine non lues ; texte dessiné sans nœud de texte (image, canvas) non lu ; texte qui change plusieurs fois par
  seconde laissé tel quel.
- Un jury peut tester des sites qui interdisent les scripts externes : le favori est alors bloqué, l'extension reste utilisable.

**Technique et organisation**
- Un seul fournisseur gratuit : si son quota est épuisé, les textes restent en original (cache préchargé et vidéo comme secours).
- Applications mobiles natives non prises en charge (perspective : service d'accessibilité Android grâce à l'interface de lecture séparée).
- Installation de l'extension en mode développeur (pas encore publiée sur la boutique Chrome).
- Essais sur trois sites publics en anglais seulement ; aucun test sur un vrai service financier camerounais.
