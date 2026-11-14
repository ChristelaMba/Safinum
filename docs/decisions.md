# Decisions

- Python 3.12 pour l'environnement (3.15 est trop recent). Tests lances par `python -m pytest`.
- Pytest d'origine : 14 tests, pas 15 comme annonce dans le cahier.
- Iframes de meme origine : lues directement depuis la page parente (pas de `all_frames: true`). Meme resultat,
  un seul etat et un seul panneau. Iframes d'une autre origine : signalees "non traduites".
- Lot par defaut : 25 segments par appel (permet 100 blocs en 8 appels au plus, retraduction comprise).
- La retraduction n'est demandee que pour les textes critiques (negation, statut, condition, alerte, texte long).
- `SAFINUM_MOTEUR=test` : moteur qui ne traduit pas (prefixe seulement), pour les tests sans cle. Pas pour la demo.
- Tests de bout en bout : Chromium de Playwright non telechargeable ici, et Chrome stable ignore `--load-extension`.
  Les scripts de l'extension sont donc injectes dans Chrome avec un faux `chrome.*`. Le chargement reel par le
  navigateur reste a verifier a la main.
- React 18.3.1 et Vue 3.5.13 (MIT) copies tels quels dans `pages_test/*/vendor/`.
- Aucune cle API dans le depot ni dans `.env` : les traductions du vrai modele n'ont pas pu etre testees ici.
- Voix des langues experimentales (Fulfulde) : la voix lit le texte ORIGINAL, dans sa langue (francais ou anglais), parce qu'aucune vraie voix
  Fulfulde n'existe et qu'une voix francaise prononcerait mal le Fulfulde. Decision de l'equipe le 14 novembre 2026. Le Pidgin garde la lecture de
  la traduction avec la voix anglaise de remplacement.
- Doute sur une traduction : la traduction est affichee avec l'original entre parentheses et une mention d'incertitude, sauf si une negation,
  un "jamais" ou un statut succes ou echec a ete perdu (l'original passe alors en premier).
