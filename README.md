# SAFINUM

Extension de navigateur et serveur qui traduisent une application financière en Fulfulde (expérimental) ou en Pidgin, la lisent à voix
haute et ne modifient jamais un montant, des frais, un bénéficiaire ou un avertissement de sécurité. Projet du SAFINUM Innovate Challenge.
Description : `docs/description_solution.md`. Architecture, langues, validation et limites : `docs/note_technique.md`.

## Essayer la démonstration en ligne (recommandé, rien à configurer)
1. Ouvrir `https://safinum.onrender.com` (le premier chargement peut durer environ une minute : le service gratuit s'endort).
2. Cliquer sur **Télécharger l'extension SAFINUM**, décompresser le fichier.
3. Dans Chrome ou Edge : `chrome://extensions` (Edge : `edge://extensions`), activer le **mode développeur**, **Charger l'extension non
   empaquetée**, choisir le dossier `safinum-extension`. L'extension est déjà réglée sur le serveur en ligne.
4. Ouvrir un site, cliquer sur l'icône SAFINUM, accepter, choisir Fulfulde ou Pidgin. La langue reste active d'une page à l'autre.
   « Arrêter » remet la page exactement comme avant.

Sans rien installer : le bouton « Ouvrir la banque de démonstration » de la page d'accueil ouvre une banque simulée avec SAFINUM déjà actif.
Pour une autre page web, la page d'accueil propose aussi un favori (bloqué par les sites qui interdisent les scripts externes).

## Contenu du dossier

    serveur/          serveur FastAPI (glossaire, cache, moteurs de langue, contrôle de fidélité)
      langues/        un fichier YAML par langue (fulfulde, pidgin)
      glossaires/     un CSV par langue
      tests/          tests pytest et jeu d'or
    extension/        extension Chrome et Edge (Manifest V3, sans compilation)
      tests/          tests Node et test de bout en bout dans Chrome
    pages_test/       8 banques simulées (voir pages_test/index.html)
    donnees/          fichiers Excel sources des glossaires et fiche de relecture Fulfulde
    outils/           construction et vérification des glossaires, cache préchargé, script autonome
    docs/             description de la solution, note technique
    Dockerfile, render.yaml, docker-compose.yml, demarrer.ps1, demarrer.sh   lancement local et mise en ligne

## Lancer en local
Windows (PowerShell) : `.\demarrer.ps1` (Linux ou Mac : `./demarrer.sh`). Le script cherche Python 3.10 à 3.13, installe les dépendances,
crée `serveur\.env` et lance le serveur sur http://localhost:8000. Vérifier : http://localhost:8000/diagnostic.
Puis charger le dossier `extension` comme ci-dessus (l'extension vise `http://localhost:8000` par défaut, voir `extension/config.json`).

Moteur de traduction : éditer `serveur\.env` (jamais dans le dépôt) :
| Choix | Réglage |
|---|---|
| Google Gemini (offre gratuite, utilisé pour la démonstration) | `SAFINUM_MOTEUR=openai`, `SAFINUM_LLM_URL=https://generativelanguage.googleapis.com/v1beta/openai`, `SAFINUM_LLM_KEY=...`, `SAFINUM_MODEL=gemini-3.5-flash-lite` |
| Anthropic | `ANTHROPIC_API_KEY=...`, `SAFINUM_MODEL=...` |
| Local (Ollama) | `SAFINUM_MOTEUR=ollama`, `SAFINUM_MODEL=nom` |

`http://localhost:8000/diagnostic?sonde=1` fait un petit appel réel et donne la cause exacte d'un problème (`cle_absente`, `cle_invalide`,
`quota_epuise`, `delai_depasse`, `serveur_injoignable`). `.\demarrer.ps1 -Test` lance un moteur de test qui ajoute seulement un préfixe
aux textes : ne jamais l'utiliser pour une démonstration. `SAFINUM_STRICT=1` : seules les entrées de glossaire validées comptent en
confiance élevée.

## Mise en ligne (Render)
Dépôt GitHub, puis Render > New > Blueprint (fichier `render.yaml`). Renseigner la variable secrète `SAFINUM_LLM_KEY`. Vérifier `/health`
et `/diagnostic?sonde=1`. Chaque `git push` sur `main` redéploie. Le cache de traductions est vidé à chaque redéploiement.

## Utiliser SAFINUM
- Modes combinables : je préfère écouter, texte plus grand, sans le son, contraste fort, sourd ou malentendant, lecteur d'écran, masquer les montants.
- Voix : appui long sur une phrase, `Alt+flèche bas/haut` suivant et précédent, `Alt+R` répéter, `Alt+L` lire l'écran, `Échap` arrêt. Les
  montants sont lus en mots, lentement, puis répétés une fois. En Fulfulde, la voix lit l'original (français ou anglais).
- « Voir l'original » bascule sans perte ; « Retirer SAFINUM de la page » supprime le panneau.
- « Signaler une erreur de langue » enregistre la correction sur l'appareil (rien n'est envoyé) et l'exporte en CSV.

| Confiance | Affichage |
|---|---|
| élevée | traduction seule |
| moyenne | traduction suivie de l'original entre parenthèses |
| faible | idem avec mention d'incertitude (« non vérifiée » en langue expérimentale) |
| erreur ou alerte | traduction et original, bandeau rouge pour les messages courts |
| négation, « jamais » ou statut perdu | l'original d'abord |
| valeur modifiée ou structure perdue | l'original seul |

Menus, liens, boutons et textes courts : traduction seule, original en infobulle (pour ne pas casser la mise en page).

## Tests
Serveur (dans `serveur`) : `.venv\Scripts\python.exe -m pytest`.
Extension (à la racine, après `npm install` une fois) : `node extension/tests/test_protection.js`, `test_proprietes.js`, `test_lecteur.js`,
`test_voix.js`, `test_golden.js`, `test_contraste.js`.
Bout en bout dans Chrome : lancer un serveur de test dans `serveur` (`SAFINUM_MOTEUR=test`, port 8010), puis `node extension/tests/e2e.js`
et `node extension/tests/e2e_inject.js`. Avec la vraie extension dans le navigateur : `node extension/tests/vraie_navigation.js 8010`
(`NAVIGATEUR=msedge` pour Edge). Contenu inédit avec un vrai moteur : `node extension/tests/inedit.js`.

## Glossaires et langues
Vérifier : `python outils/verifier_glossaires.py`. Reconstruire depuis les Excel : `python outils/construire_glossaires.py`. Ajouter une
langue : déposer `serveur/langues/xxx.yaml` et `serveur/glossaires/xxx.csv`, relancer le serveur. Aucune entrée n'est `valide` tant
qu'un locuteur ne l'a pas relue.
Démonstration hors connexion : `python outils/precharger_cache.py pcm` (dans `serveur`, avec un moteur valide) produit
`serveur\cache_precharge.json`, chargé au démarrage.

## Dépannage
| Symptôme | Cause probable |
|---|---|
| Le panneau ne s'ouvre pas | page `chrome://` ou boutique Chrome : essayer un autre site |
| « Serveur injoignable » | serveur arrêté ou endormi (Render) ; ouvrir `/health` et patienter |
| « Clé API absente » ou « invalide » | clé non lue ou erronée : `serveur\.env` en local, variable d'environnement sur Render |
| « Quota épuisé » | limite du fournisseur gratuit : attendre ou changer de modèle |
| La page n'est pas traduite après un changement d'extension | recharger l'extension dans `chrome://extensions` et rouvrir l'onglet ; le panneau affiche la version |
