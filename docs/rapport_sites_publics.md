# Essai sur des pages publiques de démonstration (14 novembre 2026)

Outil de constat : `extension/tests/sites_publics.js`. Sites faits pour être testés, aucune donnée réelle, SAFINUM ne fait que lire et
traduire. Les requêtes de traduction passent par le script de test (comme le service worker de l'extension), donc la politique de
sécurité du site ne les bloque pas. Le navigateur de test ignore l'erreur de certificat du site Altoro Mutual (certificat invalide connu).
Résultats uniques, non répétés plusieurs fois, un seul poste.

| Site | Type | Langue | Blocs lus / traduits | Textes visibles changés | Valeurs | Arrêt |
|---|---|---|---|---|---|---|
| Altoro Mutual (demo.testfire.net) | HTML classique, anglais | Fulfulde, vrai moteur | 46 / 46 | 95 % | identiques | page restaurée |
| Altoro Mutual | idem | Pidgin, vrai moteur | 46 / 46 | 26 % (voir note) | identiques | page restaurée |
| ParaBank (parasoft) | HTML classique, anglais | Pidgin, vrai moteur | 44 / 44 | 21 % (voir note) | identiques | page restaurée |
| ParaBank | idem | Fulfulde | n'a pas répondu (délai dépassé côté site) | - | - | - |
| XYZ Bank (globalsqa, Angular) | application à page unique, anglais | Pidgin, vrai moteur | 5 puis 33 / 33 après navigation | contenu des nouvelles vues traduit | identiques | non mesuré |

Note : une source anglaise donne souvent un Pidgin identique ou presque pour les libellés courts (« Checking », « Insurance », « Home »),
donc la part de texte « changé » est basse sans qu'il y ait de panne. Elle est de 95 % en Fulfulde, langue très différente de l'anglais.

## Ce que cet essai confirme
- SAFINUM se charge et traduit sur de vraies pages jamais vues, sans modification de leur code, sans erreur JavaScript.
- Mise en page préservée : menus, liens, images, formulaires restent à leur place et utilisables.
- Aucune valeur modifiée. « Arrêter » remet la page exactement comme avant.
- Application à page unique : les vues ouvertes après l'activation sont traduites automatiquement (5 blocs, puis 33).

## Défauts trouvés et corrigés pendant l'essai
- Le texte juridique d'un site (« This site is not a real banking site... »), classé « alerte » par le modèle, déclenchait un grand bandeau rouge qui
  recouvrait l'écran. Le bandeau est maintenant réservé aux messages courts (400 caractères au plus) ; le texte long reste dans la page avec son original.
- Mon script cherchait des boutons par leur texte, qui est traduit : sélecteurs indépendants du texte pour la navigation.

## Limites constatées
- Le texte traduit et l'original entre parenthèses allongent les blocs : sur une vraie page, certaines zones deviennent plus hautes. Aucun style n'est ajouté à la page.
- Lenteur de la première traduction avec l'offre gratuite : environ 18 secondes (Pidgin) et 42 secondes (Fulfulde, où tout est retraduit) pour 46 blocs.
  L'affichage est progressif, et une seconde visite est quasi instantanée grâce au cache.
- Le panneau, lui, est traduit par le même moteur : des libellés comme « A prefer for listen » ne sont pas relus par un locuteur.
- Trois sites seulement, tous en anglais, tous simulés : ce n'est pas une preuve que « toute application » fonctionne.
- Non testé : un vrai site de banque ou de Mobile Money, une application mobile, un site avec connexion, un site français.
