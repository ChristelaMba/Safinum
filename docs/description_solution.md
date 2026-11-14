# SAFINUM - Description de la solution

## Le problème
Les applications financières numériques (banques, Mobile Money, microfinance) sont écrites en français ou en anglais. Beaucoup de
Camerounais les lisent difficilement. Or une erreur de compréhension sur un montant, des frais ou un avertissement de sécurité coûte
de l'argent. Les solutions existantes demandent de refaire l'application, ce qu'un service financier ne fait pas pour une langue.

## La solution
SAFINUM est une extension de navigateur (Chrome, Edge) accompagnée d'un petit serveur. Elle s'ajoute à n'importe quelle application
web financière, **sans toucher à son code**, et la rend compréhensible dans une langue nationale :

- elle lit le texte affiché, le traduit sur place et suit l'utilisateur de page en page ;
- elle lit à voix haute ce que l'utilisateur touche, et dit les montants en mots ;
- elle ne modifie **jamais** un montant, des frais, un bénéficiaire, une condition ou un avertissement de sécurité ;
- elle n'effectue **aucune action** à la place de l'utilisateur (ni clic, ni saisie, ni confirmation) et ne lit jamais un champ secret
  (mot de passe, code PIN, OTP, carte).

## Langues prises en charge
- **Fulfulde (Adamaoua)** : la langue nationale visée par le projet. Elle est **expérimentale** : l'original reste toujours affiché à côté
  et la voix lit l'original (français ou anglais) pour ne pas faire entendre une prononciation non vérifiée.
- **Pidgin camerounais** : langue véhiculaire parlée par des locuteurs de toutes les ethnies du pays. Nous l'avons ajoutée parce qu'elle
  dispose de beaucoup plus de ressources et donne un résultat plus stable que le Fulfulde. Elle sert à démontrer que l'ensemble de la chaîne
  (protection des valeurs, contrôle de fidélité, voix, accessibilité) fonctionne dans une langue du pays.

Des glossaires de termes financiers imposent un vocabulaire unique : le modèle de traduction ne choisit pas entre plusieurs synonymes.

## Parcours démontrés (opérations simulées)
Consultation d'un solde, vérification des frais, préparation d'un transfert vers un bénéficiaire, lecture d'un récapitulatif avant
confirmation, message d'erreur, avertissement de sécurité, message inédit saisi par le jury.

## Ce qui rend la solution fiable
- Les valeurs financières quittent la page **sans leur valeur** : elles sont remplacées par des balises avant l'envoi, puis remises
  à l'identique, avec une seconde vérification sur la page. Toute différence ramène le texte d'origine.
- SAFINUM dit quand il doute : en cas d'incertitude, la traduction est suivie de l'original entre parenthèses ; un message d'erreur ou
  d'alerte montre toujours l'original ; une traduction n'est jamais présentée comme certifiée.
- Accessibilité : voix, grands caractères, contraste fort, mode sans son, compatibilité avec un lecteur d'écran, récapitulatif en
  gros caractères avant confirmation.

## Fonctionnement d'ensemble
L'utilisateur installe l'extension, choisit une langue, et la page se traduit. L'extension envoie au serveur uniquement du texte sans
valeurs financières. Le serveur traduit avec un glossaire, puis contrôle le résultat avant de le renvoyer. Le prototype est démontrable
en ligne sur `https://safinum.onrender.com` (extension à télécharger, banque simulée avec SAFINUM déjà actif).

## Limites principales (détail dans la note technique)
Fulfulde et glossaires Pidgin non relus par des locuteurs ; pas de dictionnaire financier en Fulfulde ; première traduction d'une page
jamais vue lente avec l'offre gratuite du fournisseur ; applications mobiles natives non prises en charge.
