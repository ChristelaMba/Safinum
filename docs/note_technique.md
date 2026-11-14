# SAFINUM - Note technique

## 1. Architecture

Extension de navigateur (Manifest V3, JavaScript sans compilation) + serveur Python (FastAPI).

    Application financière simulée (aucune modification)
            | texte affiché (DOM), lu par blocs
    Extension : valeurs remplacées par des balises, marqueurs de structure, affichage, voix
            | texte SANS valeurs (HTTPS en déploiement)
    Serveur : glossaire, cache, moteur de langue (par lots), contrôle de fidélité, voix
            | texte traduit, confiance, type, raison

Ordre de traitement d'un texte : glossaire (libellé exact), cache, moteur de langue par lots (25 segments par appel),
contrôle de fidélité, score de confiance. Le même code est disponible en un seul fichier (`safinum-inject.js`) pour un favori
ou la console du navigateur.

### Lecture de la page (extension/lecteur.js)
- Un bloc est le contenu en ligne d'un élément de niveau bloc. Les éléments en ligne (b, a, span...) deviennent des marqueurs
  `<s1>...</s1>`. Le serveur doit renvoyer les mêmes marqueurs, bien imbriqués, dans le même ordre, chacun une fois.
  Sinon repli : traduction zone par zone, puis original.
- Seuls les textes des nœuds changent. Aucun élément n'est créé, déplacé ou supprimé. Les valeurs de champs, `href`, `name`, `id`
  et `data-*` ne sont jamais touchés. La `value` des seuls boutons submit, button et reset est traduite (par attribut).
- Une valeur coupée par du HTML (`<span>125</span> <span>400</span> FCFA`) est une seule valeur « ancre » : son texte reste en place.
- Lus aussi : titre, `placeholder`, `aria-label`, `title`, `alt`, options de listes, Shadow DOM ouvert, iframes de même origine.
  Iframes d'une autre origine : signalées « non traduites » dans le panneau.
- Observation des changements regroupée (200 ms), seuls les sous-arbres modifiés sont relus. Un compteur qui change plus de 3 fois en
  2 secondes est marqué « dynamique » pendant 10 secondes.
- Couverture affichée : blocs lus, traduits, laissés en original avec la raison de chacun. Aucun bloc n'est ignoré en silence.
- Profils par site facultatifs (`extension/profils.json`) : sélecteurs à ignorer, champs secrets en plus, éléments à forcer, motifs de valeurs.
- Interface de remplacement : `creer(options)` renvoie `lire`, `appliquer`, `afficherOriginal`, `restaurer`, `observer`. Un autre
  lecteur (service d'accessibilité Android) peut être branché sans toucher au reste.

## 2. Intégration et indépendance
- Aucune modification de l'application cible. SAFINUM lit le texte affiché avec le consentement de l'utilisateur, comme un lecteur d'écran.
- Aucune action automatique : aucun clic, aucune soumission, aucun remplissage. Vérifié dans Chrome par des espions sur
  click, submit, input, change, focus et sur l'écriture de `value`.
- Les champs de mot de passe, PIN, OTP et carte ne sont jamais lus, envoyés ni prononcés (détection par type, autocomplete,
  inputmode, nom, étiquette, profil). Leurs étiquettes peuvent être lues.
- Aucune capture d'écran ni image. SAFINUM ne contourne aucune protection de l'interface.

## 3. Sécurité et préservation des informations
| Règle | Mise en œuvre |
|---|---|
| Valeurs jamais traduites | `protection.js` : montants (tous formats et devises), pourcentages, dates, heures, téléphones, références, noms de bénéficiaires, e-mails, adresses web, IBAN, numéros de carte. Motifs de site possibles |
| Valeur brute jamais envoyée | le serveur refuse tout segment contenant encore un chiffre, une devise, un e-mail, une adresse ou un IBAN |
| Comparaison avant et après | refus si une balise manque, est en double ou inconnue ; contrôle des valeurs par recomptage ; chien de garde qui relit la page après écriture et remet l'original ; refus de tout chiffre nouveau |
| Original toujours accessible | « Voir l'original » ; original à côté pour moyenne confiance, erreurs et alertes |
| Alertes | original et version adaptée, bandeau rouge avec texte (`role="alert"`), lecture vocale prioritaire |
| Texte de la page = donnée | consigne système séparée, contenu passé en JSON, testé avec des messages piégés |
| Rien conservé côté serveur | cache en mémoire (texte sans valeurs), journaux sans texte (testé), aucun fichier de données utilisateur |
| Clé API | seulement dans `serveur/.env`, hors dépôt |
| Serveur | CORS limité au serveur et à l'extension (ouverture complète seulement par option de développement), taille et débit limités |
| Arrêt | « Arrêter » restaure exactement la page ; « Retirer SAFINUM de la page » supprime panneau et écouteurs |

## 4. Contrôle de fidélité
1. Balises et marqueurs identiques (sinon l'original est conservé).
2. Termes de sécurité du glossaire (PIN, code, solde insuffisant...) présents sous leur forme imposée, sinon confiance abaissée.
3. Pour les textes critiques (négation, statut, condition, alerte, texte long) : retraduction par un second appel avec un prompt
   différent, puis règles déterministes : négation perdue, « jamais » perdu, statut inversé, recouvrement des mots importants.
4. Confiance : élevée (traduction seule), moyenne (traduction et original entre parenthèses), faible (traduction, original entre parenthèses et
   « Traduction incertaine »). Exception : si le contrôle voit qu'une négation, un « jamais » ou un statut succès/échec a été perdu, l'original
   passe en premier. Un message d'erreur ou d'alerte montre toujours l'original.

Limite déclarée : la retraduction est faite par le même modèle, ce n'est pas un contrôle indépendant. Elle est complétée par
des règles déterministes et par la relecture de phrases critiques par un locuteur (non faite).

## 5. Langues et méthode de validation linguistique
| | Pidgin camerounais | Fulfulde d'Adamaoua (fub) |
|---|---|---|
| Statut | stable (à confirmer auprès des organisateurs comme langue nationale) | expérimental (mention à l'écran et à la voix) |
| Glossaire | 500 termes : lots Kamtok, brouillon Pidgin, complément | 63 termes proposés |
| Moteur | modèle de langage avec consigne dédiée et glossaire | même modèle de langage que le Pidgin, avec glossaire et consigne de prudence (n'invente pas, doute = confiance faible) ; NLLB-200 (fuv_Latn, variété nigériane) reste possible en option (`moteur: nllb` dans `fulfulde.yaml`). Confiance plafonnée à « moyenne », tout est retraduit pour vérifier |
| Voix | voix du navigateur de repli (anglais), dite « voix de remplacement » ; MMS-TTS à tester | voix de repli française, mention expérimentale ; MMS-TTS à tester |
| Validation par un locuteur | AUCUNE à ce jour | AUCUNE à ce jour |

État réel des glossaires (mesuré par `outils/verifier_glossaires.py`) : 0 entrée validée par un locuteur sur 575. Avec les réglages
par défaut, 449 entrées Pidgin non validées sont montrées en traduction seule (confiance élevée). `SAFINUM_STRICT=1` les passe en
« moyenne » (original à côté). « Mot de passe » et « Erreur » n'ont pas d'équivalent Pidgin dans le glossaire ; ils ne sont pas inventés.
Le Fulfulde n'a été relu par personne : il est présenté avec l'original à côté et la mention « expérimental ». Essai avec un vrai moteur
(14 messages) : aucune valeur modifiée, caractères spéciaux (ɓ, ɗ, ƴ, ŋ) bien écrits, mais 13 messages sur 14 jugés en confiance faible. SAFINUM
affiche alors la traduction avec l'original à côté et « [Traduction expérimentale, non vérifiée] ». Les textes de SAFINUM (boutons,
messages du panneau) restent en français pour cette langue : on n'affiche pas d'interface non vérifiée.
Deux orthographes du Pidgin coexistent (lots Kamtok, proches de l'anglais, et brouillon phonétique) ; les entrées Kamtok passent en premier.

Protocole de validation à faire avec 2 à 3 locuteurs (non réalisé) : 15 minutes au moins sur les phrases critiques
(négations, alertes, solde insuffisant). Pour chaque phrase, noter si la personne comprend le montant, le statut (réussi ou échoué)
et l'action à faire. Joindre le tableau de résultats ici. Si personne n'est disponible, le dire clairement dans la soumission.

## 6. Contribution technique propre et composants tiers déclarés

Le règlement autorise les technologies existantes à condition de déclarer les composants et de démontrer la contribution propre.

**Contribution propre de l'équipe** (code écrit pour le projet, aucun composant tiers) :
- lecture de la page par blocs avec marqueurs de structure, valeurs « ancres » coupées par du HTML, restauration exacte (`lecteur.js`) ;
- protection des valeurs, contrôle indépendant après écriture et chien de garde (`protection.js`, `lecteur.js`) ;
- détection des champs secrets (`secrets.js`) ;
- couche vocale : choix du plus petit bloc lu, montants en mots, voix de remplacement, aucun chiffre vers le serveur de voix (`lecture_vocale.js`, `voix.js`, `nombres.js`) ;
- panneau d'accès : modes combinables, récapitulatif avant confirmation, signalement d'erreur de langue ;
- serveur : chaîne glossaire, cache, lots, reprises, contrôle de fidélité, détection de langue, diagnostic ;
- pages de test, jeu d'or et outils de vérification des glossaires.

**Composant tiers qui fait la traduction brute :** un modèle de langage appelé par API. Il n'apporte que la traduction des phrases ;
la protection des valeurs, le contrôle, l'affichage, la voix et l'accessibilité sont la contribution de l'équipe.
Fournisseur actuellement configuré pour les essais : Google (Gemini, modèles `gemini-3.5-flash` et `gemini-3.5-flash-lite`, offre gratuite).
À CONFIRMER avant la soumission : conditions d'usage de l'offre gratuite (les textes envoyés peuvent y être utilisés par le fournisseur),
quotas, et fournisseur définitif.

### Composants tiers
| Composant | Rôle | Licence / point à vérifier |
|---|---|---|
| Extension et serveur (code de l'équipe) | lecture, protection, affichage, voix, traduction | à définir par l'équipe |
| FastAPI, Uvicorn, PyYAML, python-dotenv, httpx | serveur | licences libres (MIT, BSD) |
| Fournisseur du modèle de langage (Anthropic, ou compatible OpenAI, ou Ollama local) | traduction, retraduction, classement | conditions d'utilisation, coût, quotas, rétention des données (à configurer en rétention nulle quand c'est possible). Seul du texte sans valeurs lui est envoyé. **Le fournisseur retenu reste à déclarer ici** |
| NLLB-200 (Meta), facultatif | traduction Fulfulde | licence généralement non commerciale : à vérifier |
| MMS-TTS (Meta), facultatif | voix Pidgin et Fulfulde | licence généralement non commerciale : à vérifier |
| Web Speech API du navigateur | voix française et anglaise | dépend du navigateur et du système |
| React 18.3.1, Vue 3.5.13 | pages de test seulement (copiés tels quels dans `pages_test/*/vendor/`) | MIT |
| jsdom, Playwright | tests seulement (`npm install` à la racine) | licences libres |
| Référentiels de termes (BEAC, BCEAO, AfricaNenda), APiCS, Ayafor et Green, Peace Corps | sources du glossaire | voir `donnees/` |

## 7. Résultats chiffrés réels
Voir `docs/rapport_tests.md`. Les tests de langue ont été faits avec un faux moteur ou le moteur de test : AUCUNE traduction réelle
n'a été mesurée, faute de clé API au moment du développement. Les chiffres de vitesse ne sont pas ceux d'un vrai fournisseur.

## 8. Limites connues
- Voix synthétique, une seule voix par langue, intonation limitée.
- Pas d'orthographe officielle unique du Pidgin. Glossaires non validés par un locuteur. Fulfulde non relu, variété d'Adamaoua
  non couverte par NLLB, voix incertaine.
- Qualité linguistique réelle non mesurée (pas de vrai moteur testé, pas de locuteur).
- Retraduction faite par le même modèle : contrôle non indépendant.
- Pas de reconnaissance vocale (perspective).
- Le chargement réel de l'extension par Chrome n'a pas été testé automatiquement (Chrome stable ignore `--load-extension`, le Chromium
  de Playwright n'était pas téléchargeable) : les scripts sont injectés dans Chrome avec un faux `chrome.*`. À vérifier à la main.
- Iframes d'une autre origine non lues. Texte dessiné sans nœud de texte (canvas, image) non lu.
- Un texte qui change plusieurs fois par seconde est laissé tel quel.
- Un bloc dont la mise en forme (liens, gras) ne survit pas à la traduction est traduit zone par zone, avec moins de contexte.
- Applications mobiles natives : non réalisées (perspective : service d'accessibilité Android, grâce à l'interface de lecture séparée).
