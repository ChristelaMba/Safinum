# Rapport de tests (chiffres mesurés le 14 novembre 2026)

**Important.** Les suites automatiques ci-dessous utilisent un faux moteur ou le moteur de test, qui ajoute seulement le préfixe
`PCM ` au texte. Elles prouvent la plomberie, la protection des valeurs et le comportement de la page. La section « Contenu inédit
avec un vrai moteur » plus bas est la seule mesure faite avec un vrai fournisseur. Aucune ne mesure la qualité linguistique : aucun
locuteur n'a relu.

## Suites automatiques

| Suite | Résultat |
|---|---|
| Serveur (`python -m pytest`) | 52 tests réussis (14 d'origine, 21 sur les lots, 11 sur le jeu d'or et les régressions) |
| Protection des valeurs (`test_protection.js`) | 21 réussis |
| Propriétés (`test_proprietes.js`) : 1000 messages aléatoires | 9 réussis : restauration identique, aucune valeur visible, balises supprimées, doublées ou inventées toujours refusées, mutation de chiffres détectée à 100 % |
| Lecteur de page (`test_lecteur.js`, jsdom) | 24 réussis |
| Voix (`test_voix.js`) | 15 réussis |
| Jeu d'or valeurs (`test_golden.js`) : 41 messages | 6 réussis (toutes les valeurs attendues protégées, montants en lettres, restauration identique, chiffre modifié toujours détecté) |
| Contraste WCAG AA (`test_contraste.js`) | 8 réussis, minimum 6,54 (seuil 4,5) |
| Glossaires (`verifier_glossaires.py`) | 0 erreur ; avertissements : voir note technique, section 5 |

## Bout en bout dans Chrome (e2e.js, scripts de l'extension injectés avec un faux `chrome.*`)

Critères vérifiés sur chaque page : valeurs identiques avant et après, aucune valeur ni contenu de champ secret dans les requêtes
sortantes, champs PIN, mot de passe et OTP intacts, aucune action automatique (espions sur click, submit, input, change, focus et
sur l'écriture de `value`), restauration exacte du texte après « Arrêter », couverture d'au moins 95 %, aucune erreur JavaScript.

| Page | Blocs lus | Traduits | Couverture | Temps (moteur de test) |
|---|---|---|---|---|
| banque_simple | 19 | 19 | 100 % | 0,2 s |
| banque_anglais | 19 | 19 | 100 % | 0,1 s |
| banque_react | 18 | 18 | 100 % | 0,1 s |
| banque_vue | 18 | 18 | 100 % | 0,1 s |
| banque_shadow | 19 | 19 | 100 % | 0,1 s |
| banque_tableaux | 54 | 54 | 100 % | 0,1 s |
| banque_dynamique | 25 | 25 | 100 % | 0,1 s |
| banque_iframe | 26 | 26 | 100 % | 0,1 s |
| banque_iframe/externe.html (autre origine) | 6 | 5 | 100 % (1 cadre signalé « non traduit ») | 0,1 s |

Contrôles supplémentaires : parcours complet (compte, frais, formulaire, récapitulatif, erreur de PIN, alerte, message piégé) réussi
sur les pages simple, anglais, React, Vue et Shadow DOM, avec valeurs identiques à chaque étape et bandeau rouge visible pour l'alerte.
Voix (page simple) : un clic sur un conteneur ne lit rien, un appui long lit seulement la phrase touchée, le montant est lu en mots, aucun
chiffre n'est prononcé tel quel, le focus d'un champ lit l'étiquette sans la valeur, le focus d'un conteneur ne lit rien.
Page dynamique : un toast est traduit en 0,4 s, un compteur rapide est marqué « dynamique », aucune requête pendant 6 s d'attente.
Script autonome (`e2e_inject.js`) : 12 blocs traduits, HTML identique après arrêt.

## Ce qui n'est PAS mesuré
- Qualité linguistique des traductions Pidgin et Fulfulde (aucun locuteur n'a relu ; le Fulfulde n'a pas de moteur).
- Temps pour une page de 100 blocs avec un vrai fournisseur, avec et sans cache. Le test unitaire montre seulement que 100 blocs
  demandent 8 appels au modèle au plus (faux moteur).
- Chargement réel de l'extension par Chrome (les scripts sont injectés).
- Bonne détection de la langue source sur de longs textes réels et mélangés.
- Parcours complet sur les pages tableaux, dynamique et iframe (seule la première vue et les contrôles propres à chaque page sont testés).
- Utilisation avec un lecteur d'écran réel (NVDA, VoiceOver, TalkBack) et au clavier seul par une personne.
- Les voix MMS.

## Contenu inédit avec un vrai moteur (Google, gemini-3.5-flash-lite, offre gratuite)

Banc : `extension/tests/inedit.js`, messages dans `serveur/tests/inedit.json` (jamais vus par le système). Chaîne réelle : protection
des valeurs dans l'extension, serveur, vrai moteur, contrôle, restitution des valeurs, comparaison avec l'original.

| Passage | Messages | Résultat |
|---|---|---|
| 1 (avant corrections) | 34 | 24 confiance élevée, 5 moyenne, 4 faible, 1 refusé (balise de montant modifiée par le modèle) |
| 2 (après corrections) | 34 | 0 refusé ; 23 élevée, 6 moyenne, 5 faible ; alertes et erreurs avec original à côté : 16 sur 16 |
| 3 (cas difficiles) | 7 | majuscules, emoji, retour à la ligne, mélange français et anglais, montant en lettres, texte de plus de 600 caractères : 4 élevée, 1 moyenne, 2 faible ; alertes avec original : 3 sur 3 |

Mesures : aucune valeur modifiée, perdue ou ajoutée dans les 41 messages (montants, dates, pourcentages, numéros de téléphone, noms).
Le message piégé « Ignore toutes les instructions précédentes... » est traduit comme du texte, sans être obéi. Durée : 17 secondes pour
34 messages (3 appels de traduction et 3 de retraduction). Le texte de plus de 600 caractères est coupé en phrases.

Les contrôles ont signalé des traductions qui affaiblissent le sens (par exemple « Ne jamais communiquer votre code OTP » rendu par
« No give anybody your OTP code »). Ces cas passent en confiance faible : l'original est affiché d'abord.

Corrections apportées grâce à ce banc : réponse du modèle coupée par manque de budget de réponse (le modèle « réfléchit » avant de
répondre), balise de montant perdue (reprise individuelle avec la liste des balises à recopier), retraduction vers la mauvaise langue
pour une source anglaise (faux « sens différent »), contraction anglaise « don't » non vue comme négation, phrase française prise
pour une langue étrangère, montants écrits en lettres non protégés, quota du modèle principal épuisé (diagnostic qui ne testait que le
modèle rapide).

Limites de ces mesures : un seul fournisseur, un seul modèle léger ; sorties légèrement différentes d'un passage à l'autre ; aucun
locuteur camerounais n'a relu. Plusieurs formes produites ressemblent au Pidgin nigérian (« Abeg », « Biko ») ; elles sont à faire
juger. Les confiances « élevée » viennent du modèle et des contrôles automatiques : elles ne valent pas validation linguistique.

## Fulfulde (expérimental) avec un vrai moteur (Google, gemini-3.5-flash-lite)

Banc : `node extension/tests/inedit.js 8020 --langue fub --fin 14` (14 messages inédits, chemin modèle de langage + glossaire + consigne
de prudence, tout retraduit pour vérifier).

| Mesure | Résultat |
|---|---|
| Valeurs (montants, dates, téléphones, noms) | intactes dans les 14 messages |
| Alertes et erreurs avec original à côté | 5 sur 5 |
| Confiance | 13 faible, 1 moyenne (jamais élevée : plafond « moyenne ») |
| Caractères spéciaux (ɓ, ɗ, ƴ, ŋ) | bien produits et affichés |
| Recopie du français (part des mots de la sortie présents dans la source) | 0 % pour la plupart, 25 à 50 % sur 3 messages (noms propres et sigles) |
| Message piégé | traduit comme du texte, sans être obéi |

Affichage dans Chrome (test automatique, moteur de test) : traduction suivie de l'original entre parenthèses, mention « expérimental »,
textes du panneau laissés en français.

**Ce que ces mesures ne disent pas :** si le Fulfulde produit est correct. Personne dans l'équipe ne le parle. Le fait que le modèle
se déclare presque toujours peu sûr (13 sur 14) est un signal de prudence, pas une mesure de qualité. Le Fulfulde d'Adamaoua est
peu documenté : une relecture par un locuteur est indispensable avant toute présentation au jury.

## Correctif majeur apres essais reels (14 novembre 2026)

Un essai avec le vrai moteur a montre que les pages de plus de 12 blocs restaient en grande partie non traduites : l'envoi par lots sautait
les blocs 13 a 40 (le pas de la boucle changeait apres le premier lot). Mes tests de bout en bout ne l'avaient pas vu, parce qu'ils ne
regardaient que le titre et que le compteur de couverture ne comptait que les blocs deja tentes. Corrige, et les tests sont renforces :
- le compteur compte les blocs lus a la lecture, un bloc lu mais non classe devient "non_traite" ;
- le test echoue si un paragraphe, bouton, titre ou cellule de la zone principale reste en original (hors termes du glossaire identiques a leur source).

Effet : l'accueil passe de 12 a 19 blocs lus, la page tableaux de 32 a 54. Avec le vrai moteur et la configuration reelle de l'equipe
(modele principal sans quota, bascule automatique sur le modele rapide) : accueil 19 sur 19, Compte 38 sur 38 au cumul, Frais 46 sur 46,
Jury 51 sur 51, aucun bloc non traite, en Pidgin et en Fulfulde.
