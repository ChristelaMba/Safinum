# Checklist avant la soumission (14 novembre 2026)

Ce qui est coché est vérifié par un test ou une commande. Ce qui ne l'est pas reste à faire par l'équipe.

## Questions à poser aux organisateurs (à faire en premier)
- [ ] L'environnement de test est-il une page web, une application mobile ou les deux ?
- [ ] Le Pidgin compte-t-il comme langue nationale ?
- [ ] Format des fichiers, modalités de dépôt et heure limite ?
- [ ] Quels appareils et navigateurs seront utilisés pour la démonstration ?
- [ ] Disponibilité de locuteurs pour la relecture, budget de l'API

## Mise en ligne (les organisateurs veulent tester sans manoeuvres)
- [ ] Déployer le serveur en ligne (`docs/mise_en_ligne.md`, `render.yaml`) et noter l'adresse dans le dépôt de soumission
- [ ] Ouvrir `/essayer`, `/health`, `/diagnostic?sonde=1` sur l'adresse en ligne ; refaire le parcours avec `node extension/tests/demo_en_ligne.js <port>` en local
- [ ] Réveiller le service juste avant la présentation (offre gratuite)
- [x] Page d'accueil jury `/essayer`, banque de démonstration avec SAFINUM déjà actif, guide `docs/guide_jury.md`

## Technique
- [x] `python -m pytest` dans `serveur` : tous les tests passent
- [x] Tests Node (`test_protection`, `test_proprietes`, `test_lecteur`, `test_voix`, `test_golden`, `test_contraste`) : tous passent
- [x] Test de bout en bout dans Chrome (`e2e.js`) sur les 8 pages de test, plus `e2e_inject.js` pour le script autonome
- [ ] Charger l'extension à la main dans Chrome (mode développeur) et refaire le parcours : le test automatique injecte les scripts, il ne charge pas l'extension
- [ ] Brancher un vrai moteur (clé API gratuite ou payante) et vérifier `/diagnostic?sonde=1`
- [ ] Refaire le parcours avec le vrai moteur : relire les traductions affichées
- [ ] Test d'écoute des voix pcm et ful (`outils/tester_voix.py`), résultat noté dans la note technique
- [ ] Cache préchargé (`outils/precharger_cache.py`) et démonstration enregistrée (plan B hors connexion)
- [ ] Message inédit du jury testé (page Jury) avec le vrai moteur
- [ ] Clé API hors du dépôt (`serveur\.env` ignoré par git), jamais dans l'archive
- [ ] Décider `SAFINUM_STRICT` : 0 montre 449 entrées Pidgin non relues en traduction seule, 1 montre l'original à côté

## Langues
- [ ] Fulfulde : un locuteur de l'Adamaoua relit les traductions (docs/resultats_inedit_fub.json) avant toute presentation
- [ ] Au moins une personne a relu les phrases critiques (onglet « Phrases critiques » de la fiche Excel)
- [ ] Si personne n'a relu : le dire dans la note technique (déjà écrit) et garder le Fulfulde « expérimental »
- [ ] `python outils/verifier_glossaires.py` puis `python outils/construire_glossaires.py` après chaque relecture
- [ ] Trancher avec un locuteur les conflits d'orthographe signalés par le vérificateur
- [ ] Équivalents Pidgin manquants (« Mot de passe », « Erreur ») : à fournir par un locuteur, pas à inventer

## Livrables
- [x] Description de la solution (`docs/description_solution.md`)
- [x] Prototype, démarrage en une commande (`demarrer.ps1`), `README.md`
- [x] Note technique (`docs/note_technique.md`), décisions, journal, rapport de tests, plan de la vidéo
- [ ] Déclarer le fournisseur de modèle retenu et ses conditions dans la note technique (section 6)
- [ ] Vidéo de 3 minutes au plus (plan dans `docs/plan_video.md`)
- [ ] Langues prises en charge et méthode de validation indiquées (note technique, section 5)
- [ ] Archive `safinum.zip` finale
