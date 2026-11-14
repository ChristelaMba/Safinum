# Journal des changements

## Lots 1 a 4 (partiels) - 14 novembre 2026

Fait :
- Lot 1 : `extension/lecteur.js` (lecture par blocs, marqueurs `<sN>`, valeurs coupees par du HTML, attributs, titre,
  boutons submit, options, Shadow DOM ouvert, iframes de meme origine, iframes externes signalees, observation avec
  regroupement, element dynamique marque apres plus de 3 changements en 2 s, restauration exacte, repli par zone).
  `extension/secrets.js` (detection des champs secrets par plusieurs signaux). `profils.json` (profils par site).
- Lot 2 : serveur reecrit autour de lots (25 segments par appel, reprises 2 fois avec attente croissante, element
  manquant retraite seul, retraduction en lot seulement pour les textes critiques), moteurs interchangeables
  (Anthropic, compatible OpenAI, Ollama, moteur de test), erreurs typees, cause dite en une phrase, `/diagnostic`,
  detection de langue, textes longs coupes par phrases, CORS restreint, limites de taille et de debit, cache extension
  persistant (sans valeurs).
- Lot 4 : 8 pages de test dans `pages_test/` (simple, React, Vue, Shadow DOM, iframe + variante autre origine,
  tableaux, anglais, dynamique).
- Tests : pytest 33 (14 d'origine + 19), Node 21 (protection) + 22 (lecteur), e2e Chrome sur 8 pages.

- Lot 3 : motifs elargis (IBAN, cartes, e-mails, adresses web, dates ISO, noms avec initiale), motifs de profil,
  test par proprietes (1000 messages), mutation, recomptage des valeurs (corrige "500" cache dans "25 500").
- Lot 5 : voix reecrite (lecture du plus petit bloc seulement, appui long, focus clavier, navigation, lire cet ecran,
  pause, phrases interruptibles, voix de remplacement dite une fois, aucun chiffre vers le serveur de voix).
- Lot 6 : panneau (modes combinables, langues du serveur, recapitulatif, signalement et export CSV, contraste verifie).
- Lot 7 : espions dans le test de bout en bout, retrait propre, journaux sans texte (teste).
- Lot 8 : jeu d'or de 41 messages, lexiques d'alerte, de succes et de condition. Lot 9 : verificateur de glossaires.
- Lot 10 : demarrer.ps1, demarrer.sh, dependances epinglees, Docker. Script autonome safinum-inject.js. Cache precharge.
- Corrections trouvees par les tests : regle "dynamique" trop large pour les applications a page unique, motif de carte qui
  avalait un telephone, etiquette "Code PIN" prise pour une alerte, caracteres de controle dans un motif Python.

Reste a faire : validation par des locuteurs, test avec un vrai moteur (cle API), test d'ecoute des voix MMS, chargement reel
de l'extension a la main, video, declaration du fournisseur retenu, decision sur SAFINUM_STRICT.

## Fulfulde (chemin modele de langage)
- `fulfulde.yaml` : moteur llm avec consigne de prudence, NLLB reste en option. Tout est retraduit pour verifier, une "traduction"
  identique a la source est refusee (non_traduit). Affichage : traduction + original + mention "non verifiee" meme en confiance faible.
  Textes de SAFINUM laisses en francais pour les langues experimentales. Tests : 4 pytest, controle e2e dans Chrome.

## Correctifs apres essais reels (14 novembre 2026)
- BUG GRAVE corrige : l'envoi par lots sautait les blocs 13 a 40 (le pas de la boucle changeait apres le premier lot). Sur une page de plus de
  12 blocs, la majeure partie restait en original, sans message. Le compteur de couverture ne voyait pas ces blocs (il ne comptait que les
  blocs tentes). Corrections : decoupage par index, "blocs lus" compte a la lecture, tout bloc lu mais non traite est compte "non_traite".
  Le test de bout en bout echoue maintenant si un paragraphe, bouton ou titre reste en original.
- Quota du modele principal epuise : basculement automatique sur le modele rapide (120 s), diagnostic qui le dit.
- SAFINUM_DEBIT : plancher a 120 requetes par minute (30 faisait refuser les requetes pendant une navigation normale).
- Voix : pour une langue experimentale, la voix lit l'original dans sa langue (francais ou anglais), annonce faite une fois.

## Version 1.2.0 (14 novembre 2026, soir) : vitesse et panneau
- Vitesse : raisonnement du modele reduit (reasoning_effort low pour Gemini, SAFINUM_RAISONNEMENT=off pour desactiver), bascule sur le modele
  rapide en cas de quota ou de surcharge (503), retraduction limitee aux textes critiques (y compris en langue experimentale), libelles du
  panneau traduits en parallele et mis en cache dans l'extension, delai du service worker porte de 20 a 120 secondes, progression affichee.
  Mesure avec la vraie extension (Edge) : premiere traduction 36 s -> 10 a 18 s, deuxieme visite 1,6 s.
- Panneau : redessins regroupes et differes pendant un appui (un clic pouvait etre perdu), focus clavier restaure, numero de version affiche.
- Outils : vraie_extension.js (charge la vraie extension dans Edge avec Playwright), vraie_boutons.js, sites_publics.js.

## 14/11/2026 (nuit) - langue conservee entre les pages, mise en page
- La langue choisie est retenue par site (`safinum_sessions`) : en changeant de page, la traduction reprend seule, sans clic. Un arret voulu (« Arreter ») l'efface.
- Elements d'interface (menus, liens, boutons, titres, cellules, libelles, textes de 35 caracteres ou moins, valeurs de boutons) : traduction seule, original en infobulle (retiree a l'arret) et lu par la voix. Les paragraphes gardent l'original entre parentheses. Cela evite les chevauchements dans les boites de taille fixe (ParaBank en Fulfulde).
- Version 1.3.0 (le numero change pour verifier que l extension est bien rechargee). Nouveau constat : `extension/tests/vraie_navigation.js` (vraie extension, navigation entre pages).

## 14/11/2026 (nuit) - demonstration sans installation
- Page `/essayer` (accueil du serveur) : un clic ouvre la banque de demonstration avec SAFINUM deja actif (`?safinum=1`, `pages_test/commun/auto.js`), favori pour les autres sites.
- Mise en ligne : Dockerfile (port `$PORT`, script autonome inclus), `.dockerignore` (jamais `.env`), `render.yaml`, `docs/mise_en_ligne.md`, `docs/guide_jury.md`.
- Un type « alerte » donne par le modele n'est retenu que si la phrase contient un mot d'alerte (plus de bandeau rouge sur une description technique).
- Nouveau constat : `extension/tests/demo_en_ligne.js`.
- Extension telechargeable depuis le serveur (`/safinum-extension.zip`), reglee sur l'adresse du serveur par `config.json` ; page `/essayer` avec les 4 etapes d'installation. Verifie avec la vraie extension decompressee dans Edge sur ParaBank.
