# Mise en ligne de la démonstration (pour que le jury n'installe rien)

Objectif : une adresse web unique. Le jury l'ouvre, clique sur « Ouvrir la banque de démonstration », choisit une langue.
Ni extension, ni serveur, ni clé à configurer de son côté.

## Ce qui est en ligne
Le serveur SAFINUM (FastAPI) qui sert aussi : la page d'accueil `/essayer`, les banques de démonstration `/banque/`, le script autonome
`/safinum-inject.js` (favori pour toute autre page) et `/health`. La clé du moteur reste sur le serveur, jamais dans l'archive ni dans la page.

## Étapes (Render, offre gratuite, environ 15 minutes)
1. Créer un dépôt GitHub privé avec le contenu du dossier `safinum` (le fichier `serveur/.env` est ignoré, ne jamais le déposer).
2. Sur render.com : New > Blueprint, choisir le dépôt. `render.yaml` crée le service. (Autre hébergeur : le `Dockerfile` suffit, le port vient de `$PORT`.)
3. Dans le service, renseigner la variable secrète **SAFINUM_LLM_KEY** avec la clé Google AI Studio. Les autres variables sont déjà dans `render.yaml`.
4. Attendre le déploiement, puis ouvrir `https://<nom>.onrender.com/health` : `"disponible": true`.
5. Ouvrir `https://<nom>.onrender.com/diagnostic?sonde=1` pour vérifier que le moteur répond.
6. Réveiller le service avant la présentation : l'offre gratuite s'endort après 15 minutes sans visite (premier chargement lent, environ 1 minute).
7. Précharger : lancer `node extension/tests/sites_publics.js` n'est pas nécessaire en ligne ; ouvrir une fois chaque page de démo en Pidgin et Fulfulde
   remplit le cache. (Le cache vit en mémoire : un redémarrage le vide. Pour un cache durable, `outils/precharger_cache.py` produit `serveur/cache_precharge.json`.)

## Réglages recommandés pour la démo
- `SAFINUM_MODEL=gemini-3.5-flash-lite` : évite l'appel qui échoue quand le quota du modèle principal est épuisé, donc plus rapide.
- `SAFINUM_STRICT=1` : le glossaire Pidgin non relu par un locuteur n'est pas présenté comme certain.
- `SAFINUM_CORS=*` : nécessaire seulement pour le favori sur d'autres sites ; aucune donnée sensible n'est exposée, le débit est limité par client (`SAFINUM_DEBIT`).

## Limites à connaître
- Quota gratuit de Google : si beaucoup de testeurs arrivent en même temps, des traductions seront lentes ou en original. Prévoir la vidéo comme secours.
- Hors ligne (pas d'Internet pendant la présentation) : lancer en local avec `demarrer.ps1` et un cache préchargé.
- Le favori ne marche pas sur les sites qui interdisent les scripts externes (politique de sécurité du site) ; l'extension Chrome du dossier `extension` marche partout.
- Extension : le serveur en ligne fournit `/safinum-extension.zip`, déjà réglée sur son adresse (fichier `config.json` généré à la volée). Le jury la télécharge depuis `/essayer`, aucune adresse à saisir. Pour une copie locale, `extension/config.json` vise `http://localhost:8000`.
- Installation en un clic (Chrome Web Store) : non faite, elle demande un compte développeur et une validation par Google ; le chargement en mode développeur est la voie prévue pour le jury.
