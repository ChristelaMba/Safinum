# SAFINUM

Extension de navigateur et serveur qui traduisent une application financière en Pidgin ou en Fulfulde, la lisent à voix
haute et ne modifient jamais un montant, des frais, un bénéficiaire ou un avertissement de sécurité.
Projet du SAFINUM Innovate Challenge. Cahier des charges de référence : v2.0.

## Ce qu'il y a dans le dossier

    serveur/          serveur FastAPI (glossaire, cache, moteurs de langue, contrôle de fidélité, voix)
      langues/        un fichier YAML par langue
      glossaires/     un CSV par langue
      tests/          tests pytest (+ jeu d'or de 41 messages)
    extension/        extension Chrome et Edge (Manifest V3, sans compilation)
      lecteur.js      lecture de la page par blocs, application, observation, restauration
      lecture_vocale.js  ce qui est lu à voix haute (jamais un conteneur)
      voix.js         voix, montants en mots, voix de remplacement
      protection.js   valeurs remplacées par des balises avant tout envoi
      secrets.js      détection des champs secrets
      content.js      panneau et orchestration
      profils.json    profils par site (facultatif)
      safinum-inject.js  script autonome (plan B), construit par outils/construire_inject.py
      tests/          tests Node, test de bout en bout dans Chrome
    pages_test/       8 banques simulées pour tester (voir pages_test/index.html)
    donnees/          fichiers Excel de départ et fiche de relecture Fulfulde
    outils/           glossaires, vérification, cache préchargé, script autonome, test des voix
    docs/             description, note technique, décisions, journal, rapport de tests, plan de la vidéo

## Démarrer en une commande

Windows 11 (PowerShell) :

    .\demarrer.ps1

Si PowerShell refuse le script : `powershell -ExecutionPolicy Bypass -File .\demarrer.ps1`.
Linux ou Mac : `./demarrer.sh`. Option Docker : `docker compose up --build` (en plus, pas à la place).

Le script cherche Python 3.10 à 3.13, crée l'environnement, installe les dépendances (roues précompilées seulement),
crée `serveur\.env` à partir de `.env.example`, lance le serveur et affiche l'adresse de diagnostic.
Python 3.14 et plus n'est pas supporté (certaines bibliothèques n'ont pas de roue précompilée).

Pour vérifier que tout est branché sans clé : `.\demarrer.ps1 -Test`. Le moteur de test ne traduit pas, il ajoute
seulement le préfixe `PCM ` aux textes. Ne jamais l'utiliser pour une démonstration.

Vérifier : http://localhost:8000/diagnostic doit afficher la cause exacte de l'état du moteur.

## Brancher un moteur de langage (clé API)

Édition de `serveur\.env` (jamais dans le dépôt, jamais dans l'extension). Puis relancer le serveur.

| Choix | Réglage |
|---|---|
| Anthropic | `ANTHROPIC_API_KEY=...` et `SAFINUM_MODEL=...` |
| Fournisseur compatible OpenAI (Groq, Gemini en mode OpenAI, OpenRouter...) | `SAFINUM_MOTEUR=openai`, `SAFINUM_LLM_URL=https://adresse/v1`, `SAFINUM_LLM_KEY=...`, `SAFINUM_MODEL=nom` |
| Local avec Ollama | `SAFINUM_MOTEUR=ollama`, `SAFINUM_MODEL=nom` |

Contrôle : `http://localhost:8000/diagnostic?sonde=1` fait un tout petit appel réel et donne la cause exacte :
`cle_absente`, `cle_invalide`, `quota_epuise`, `delai_depasse`, `serveur_injoignable`.
Avec une offre gratuite, régler `SAFINUM_LOT` et `SAFINUM_CONCURRENCE` selon les limites du fournisseur. Ne pas descendre `SAFINUM_DEBIT`
(requêtes par minute acceptées par SAFINUM lui-même) sous 120 : naviguer dans une application envoie plusieurs requêtes, et une valeur trop
basse fait afficher les textes en original (« trop_de_requetes »). Le vrai plafond est celui du fournisseur.
Sans moteur, SAFINUM marche quand même : les libellés du glossaire sont traduits, le reste reste en original, et le
panneau dit pourquoi en une phrase.

## Installer l'extension (Chrome ou Edge)

1. Ouvrir `chrome://extensions` (ou `edge://extensions`), activer le mode développeur.
2. « Charger l'extension non empaquetée », choisir le dossier `extension`.
3. Ouvrir http://localhost:8000/banque/ et cliquer sur l'icône SAFINUM. Un panneau s'ouvre en bas à droite.

Chrome n'autorise pas les extensions sur `chrome://`, la boutique Chrome et quelques autres pages. Préférer `http://localhost`
aux fichiers `file://` (qui demandent une option spéciale). Aucune étape de compilation.

## Plan B : script autonome (si l'extension ne s'installe pas)

1. Construire le fichier (déjà fait dans le dépôt) : `python outils/construire_inject.py`
2. Le serveur le sert à `http://localhost:8000/safinum-inject.js`.
3. Favori : créer un favori dont l'adresse est
   `javascript:(function(){window.SAFINUM_URL='http://localhost:8000';var s=document.createElement('script');s.src='http://localhost:8000/safinum-inject.js';document.head.appendChild(s);})();`
   puis cliquer dessus sur la page à traduire. Autre possibilité : coller le contenu de `extension/safinum-inject.js` dans la console du navigateur.
4. Le site cible appelle le serveur directement : ajouter son adresse dans `SAFINUM_CORS` de `serveur\.env`
   (par exemple `SAFINUM_CORS=http://localhost:8000,https://site-du-jury.example`). `SAFINUM_DEV_CORS=1` ouvre tout (développement seulement).
5. Limite : un site avec une politique de sécurité stricte (CSP) peut bloquer le chargement du script ; la console reste possible.

## Pages de test

`http://localhost:8000/banque/` : simple, React, Vue, composants web (Shadow DOM), cadre (iframe de même origine et d'une autre
origine), tableaux et listes de 100 lignes, anglais, contenu dynamique. Chaque page contient un PIN, un mot de passe, un OTP,
des montants dans tous les formats, des valeurs coupées par du HTML, des liens et du gras dans les phrases.
PIN de démonstration : 1234. Aucune vraie opération.

## Utiliser SAFINUM

1. Lire et accepter le consentement, choisir une langue. La page se traduit, les montants restent en chiffres d'origine.
2. « Voir l'original » bascule sans perte. « Arrêter » remet la page exactement comme avant. « Retirer SAFINUM de la page »
   supprime le panneau et les écouteurs. Le bouton d'arrêt reste visible quand le panneau est réduit.
3. Modes combinables : je préfère écouter, texte plus grand (panneau jusqu'à 200 %), sans le son, contraste fort,
   sourd ou malentendant, j'utilise un lecteur d'écran (SAFINUM se tait), masquer les montants, zoom de la page (option).
4. Voix : appui long (0,5 s) sur une phrase pour l'entendre, focus clavier sur un bouton ou un champ (étiquette seulement),
   `Alt+flèche bas/haut` suivant et précédent, `Alt+R` répéter, `Alt+L` lire cet écran, `Échap` arrêt.
   Un clic ou un focus sur un conteneur ne lit rien. Les montants sont lus en mots, lentement, puis répétés une fois.
5. Une erreur de langue ? « Signaler une erreur de langue » enregistre la correction sur l'appareil (rien n'est envoyé).
   « Exporter en CSV » produit un fichier aux colonnes des glossaires.

## Tests

Serveur (dans `serveur`) :

    .venv\Scripts\python.exe -m pytest

Extension (à la racine, après `npm install` une fois pour jsdom et Playwright, outils de test seulement) :

    node extension/tests/test_protection.js
    node extension/tests/test_proprietes.js
    node extension/tests/test_lecteur.js
    node extension/tests/test_voix.js
    node extension/tests/test_golden.js

Bout en bout dans Chrome : lancer un serveur de test (`serveur`, avec `SAFINUM_MOTEUR=test` et `SAFINUM_CORS=http://localhost:8010`
sur le port 8010), puis `node extension/tests/e2e.js` et `node extension/tests/e2e_inject.js`.
Les scripts de l'extension sont injectés dans Chrome avec un faux `chrome.*` (voir `docs/decisions.md`).
`python -m pytest`, `python -m uvicorn` et `python -m pip` sont préférés aux exécutables `.exe`, parfois bloqués.

## Glossaires et langues

- Vérifier : `python outils/verifier_glossaires.py` (signale seulement, ne modifie rien).
- Reconstruire depuis les Excel : `python outils/construire_glossaires.py`.
- Statut d'une entrée : `brouillon` ou `valide`. Elle n'est `valide` que si un locuteur l'a relue (nom et date dans la fiche Excel).
- `SAFINUM_STRICT=1` : seules les entrées validées comptent en confiance élevée, les autres sont montrées avec l'original à côté.
- Fulfulde : expérimental, passe par le même modèle de langage que le Pidgin (glossaire + consigne de prudence). Original toujours à côté,
  confiance plafonnée à « moyenne », mention « non vérifiée » à l'écran et à la voix, textes de SAFINUM laissés en français. NLLB-200 reste
  possible en option (`moteur: nllb` dans `serveur/langues/fulfulde.yaml`, avec `transformers` et `torch`).
- Ajouter une langue : déposer `serveur/langues/xxx.yaml` et `serveur/glossaires/xxx.csv`, relancer le serveur. Aucun changement dans l'extension.

## Comment SAFINUM décide d'afficher une traduction

| Confiance | Affichage |
|---|---|
| élevée | la traduction seule |
| moyenne | la traduction, puis l'original entre parenthèses |
| faible | la traduction, l'original entre parenthèses, puis « [Traduction incertaine] » (« [Traduction expérimentale, non vérifiée] » pour une langue expérimentale) |
| alerte ou erreur | la traduction et « (Original : ... ) », plus un bandeau rouge avec texte |
| faible parce qu'une négation, un « jamais » ou un succès/échec a été perdu | l'original d'abord, puis « [Traduction incertaine] » |
| valeur modifiée, balise perdue ou mise en forme non conservée | l'original, sans traduction |

Une traduction n'est jamais présentée comme certifiée.

## Démonstration hors connexion (cache préchargé)

1. Une fois, avec un moteur valide : dans `serveur`, `.venv\Scripts\python.exe ..\outils\precharger_cache.py pcm`
2. Le serveur charge `serveur\cache_precharge.json` au démarrage et répond sans internet pour ces phrases.
3. Le fichier contient seulement du texte sans valeurs. Il n'est pas dans le dépôt.
4. Enregistrer aussi une vidéo de la démonstration.

## Voix

- Par défaut : voix du navigateur (anglais pour le Pidgin, français pour le Fulfulde), dite « voix de remplacement » une fois.
- Voix MMS du serveur (facultatif, désactivée par défaut) : `SAFINUM_TTS=1` dans `.env` (et `transformers`, `torch`, `scipy`),
  puis `VOIX_SERVEUR = true` dans `extension/content.js`. Aucun chiffre ni montant n'est jamais envoyé au serveur de voix.
- Test d'écoute obligatoire avant d'activer : `python outils/tester_voix.py`, puis le faire écouter à un locuteur.

## Dépannage

| Symptôme | Cause probable |
|---|---|
| Le panneau ne s'ouvre pas | page `chrome://` ou boutique Chrome : essayer une page `http://localhost` |
| « Serveur injoignable » | serveur arrêté ou mauvais port ; ouvrir `/health` |
| « Clé API absente » | clé non lue : bon fichier `serveur\.env`, serveur relancé |
| « Quota épuisé » ou « Délai dépassé » | limite du fournisseur : baisser `SAFINUM_CONCURRENCE`, attendre, ou changer de modèle |
| Port 8000 déjà pris | un ancien serveur tourne : le fermer, ou `.\demarrer.ps1 -Port 8010` |
| Le bandeau rouge cache le menu | le fermer avec « Fermer » ; il reste tant qu'on ne l'a pas fermé |
| Une iframe n'est pas traduite | d'une autre origine : signalé « non traduit » dans le panneau |

## Limites déclarées

Voir `docs/note_technique.md`, section 7. Résumé : voix synthétique, Fulfulde non relu par un locuteur, glossaires Pidgin non
validés, pas d'orthographe officielle du Pidgin, pas de reconnaissance vocale, pas de version mobile, retraduction faite par le
même modèle (contrôle non indépendant).
