# SAFINUM - Description de la solution

**Problème.** Beaucoup de Camerounais ne lisent pas facilement le français ou l'anglais des applications financières. Une erreur
de compréhension sur un montant, des frais ou un avertissement de sécurité coûte de l'argent.

**Solution.** SAFINUM est une couche d'assistance indépendante qui s'ajoute à une application financière sans toucher à son code.
L'utilisateur choisit une langue nationale (Pidgin, Fulfulde en version expérimentale). SAFINUM lit le texte affiché, le traduit
sur place par phrases entières, suit la navigation page après page et lit à voix haute ce que l'utilisateur touche.
Il ne modifie jamais un montant, des frais, un bénéficiaire, une condition ou un avertissement de sécurité.

**Ce qui le distingue.**
- Fonctionne sur une page jamais vue : lecture par blocs, applications à page unique (React, Vue), Shadow DOM, iframes de même origine.
- Les valeurs ne quittent jamais le navigateur. Elles sont remplacées par des balises, contrôlées après traduction, et vérifiées
  une seconde fois sur la page. Une différence remet l'original.
- Il dit quand il doute : l'original est toujours accessible, les alertes et erreurs sont montrées en original et en version adaptée
  avec un bandeau rouge, une traduction n'est jamais présentée comme certifiée.
- Accessible : voix qui ne lit que ce qui est demandé, montants dits en mots puis répétés, modes pour personnes qui ne lisent pas,
  voient mal, n'entendent pas ou utilisent déjà un lecteur d'écran, récapitulatif en gros caractères avant confirmation.
- Aucune action automatique : SAFINUM ne clique, ne remplit et ne confirme jamais. Aucun champ secret n'est lu.

**Parcours démontrés (opérations simulées).** Consultation du solde, vérification des frais, préparation d'un transfert,
récapitulatif avant confirmation, erreur de PIN, alerte de sécurité, message inédit saisi par le jury.

**Architecture.** Extension Chrome et Edge (Manifest V3) + serveur FastAPI. Moteur de langage interchangeable (Anthropic, compatible
OpenAI, Ollama). Plan B : script autonome (favori ou console) et cache préchargé pour une démonstration hors connexion.

**Langues et limites.** Pidgin : glossaire de 500 termes, non encore validé par un locuteur. Fulfulde d'Adamaoua : expérimental, original
toujours affiché à côté. Voix du navigateur de repli, dite comme telle. Voir la note technique pour les limites.
