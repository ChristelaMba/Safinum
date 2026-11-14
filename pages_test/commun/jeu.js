/*
 * jeu.js - parcours financier SIMULE, commun a plusieurs pages de test.
 * Aucune vraie operation, aucune donnee reelle. SAFINUM n'a besoin d'aucune modification ici.
 *
 * Usage : BanqueSimulee.demarrer({ racine: element ou shadowRoot, menu: element, lang: "fr" ou "en" })
 * Contient : solde, frais, preparation d'un transfert, recapitulatif, erreurs, alertes de securite,
 * message inedit, des champs secrets (mot de passe, PIN, OTP), des montants dans tous les formats,
 * des valeurs coupees par du HTML, des liens et du gras dans les phrases, des attributs title, aria-label, placeholder.
 */
var BanqueSimulee = (function () {
  var TEXTES = {
    fr: {
      titre: "Mon compte",
      solde: "Solde disponible",
      msgSolde: "Votre solde disponible est de {S}.",
      phraseLien: 'Consultez <a href="#conditions">nos conditions</a> : le solde affiché est <strong>disponible</strong> immédiatement.',
      plafond: 'Plafond du jour : <span class="m">200</span> <span class="m">000</span> FCFA, soit <b>1 %</b> de moins qu\'hier.',
      boutonFrais: "Consulter les frais",
      boutonEnvoyer: "Envoyer de l'argent",
      titreFrais: "Frais",
      operation: "Opération",
      colFrais: "Frais",
      t25: "Transfert jusqu'à 25 000 FCFA",
      t100: "Transfert jusqu'à 100 000 FCFA",
      tPlus: "Transfert au-dessus de 100 000 FCFA",
      retrait: "Retrait chez un agent",
      noteFrais: "Les frais sont affichés avant toute confirmation.",
      titreEnvoi: "Envoyer de l'argent",
      benef: "Bénéficiaire",
      montant: "Montant à envoyer",
      montantPh: "Entrez le montant en FCFA",
      mdp: "Mot de passe",
      pin: "Code PIN",
      otp: "Code reçu par SMS (OTP)",
      pinAide: "Code de démonstration : 1234",
      continuer: "Continuer",
      continuerTitre: "Passer au récapitulatif",
      titreRecap: "Récapitulatif",
      confirmer: "Confirmer",
      annuler: "Annuler",
      modifier: "Modifier le montant",
      recapMsg: "Confirmer le transfert de {M} à {B} ? Frais : {F}. Total : {T}.",
      insuffisant: "Solde insuffisant pour effectuer cette opération.",
      titreRes: "Résultat",
      resMsg: "Transfert de {M} vers {B} effectué. Frais : {F}.",
      valide: "Votre transaction a été validée.",
      retour: "Retour à l'accueil",
      montantInvalide: "Entrez un montant valide.",
      pinFaux: "Code PIN incorrect. Il vous reste {N} tentatives.",
      bloque: "Votre compte est bloqué. Contactez le service client.",
      titreMsg: "Messages",
      aideMsg: "Touchez un bouton pour afficher un message de l'application.",
      boutonsMsg: ["Code incorrect", "Solde insuffisant", "Alerte de sécurité", "Opération suspecte", "Message en anglais", "Demande en cours"],
      msgs: [
        ["Code PIN incorrect. Il vous reste 2 tentatives.", "erreur"],
        ["Solde insuffisant pour effectuer cette opération.", "erreur"],
        ["Attention : ne communiquez jamais votre code à un tiers.", "alerte"],
        ["Opération suspecte détectée sur votre compte. Contactez le service client.", "alerte"],
        ["Your transaction has been recorded. Amount: 10,000 XAF.", ""],
        ["Votre demande est en cours de traitement. Veuillez patienter 24 heures.", ""],
      ],
      titreJury: "Message du jury",
      aideJury: "Écrivez un message inédit puis affichez-le. Le texte s'affiche comme un vrai message de l'application.",
      messageLib: "Message",
      afficherMsg: "Afficher le message",
      titreCompte: "Détails du compte",
      compteLignes: [
        ["Titulaire", "Jean K."],
        ["Téléphone", "+237 655 12 34 56"],
        ["Dernier virement", "10,000 XAF le 12/11/2026"],
        ["Autre virement", "10.000 FCFA le 12 novembre 2026"],
        ["Virement épargne", "25 000,50 FCFA le 2026-11-12 à 14:35"],
        ["Montant en euros", "1 250 EUR"],
        ["Montant avec symbole", "$15"],
        ["Devise avant le montant", "FCFA 5000"],
        ["Taux de frais", "1 % avec un minimum de 100 FCFA"],
        ["Référence", "Réf. TX2026110112345"],
        ["Compte", "CM21 1000 2000 3000 4000 5000 678"],
        ["Carte", "4111 1111 1111 1111"],
        ["E-mail", "jean.k@exemple.cm"],
      ],
      aide: "Aide",
      aideTexte: 'Pour toute question, <a href="#contact">contactez le service client</a> ou lisez <em>les conditions d\'utilisation</em>.',
      menu: ["Accueil", "Compte", "Frais", "Envoyer", "Messages", "Jury"],
      menuLabel: "Menu principal",
      marque: "Mon Argent Mobile",
      sousTitre: "Application simulée pour la démonstration. Aucune vraie opération.",
    },
    en: {
      titre: "My account",
      solde: "Available balance",
      msgSolde: "Your available balance is {S}.",
      phraseLien: 'Read <a href="#conditions">our terms</a>: the balance shown is <strong>available</strong> immediately.',
      plafond: 'Daily limit: <span class="m">200</span> <span class="m">000</span> FCFA, which is <b>1 %</b> less than yesterday.',
      boutonFrais: "View fees",
      boutonEnvoyer: "Send money",
      titreFrais: "Fees",
      operation: "Operation",
      colFrais: "Fee",
      t25: "Transfer up to 25 000 FCFA",
      t100: "Transfer up to 100 000 FCFA",
      tPlus: "Transfer above 100 000 FCFA",
      retrait: "Withdrawal at an agent",
      noteFrais: "Fees are shown before any confirmation.",
      titreEnvoi: "Send money",
      benef: "Recipient",
      montant: "Amount to send",
      montantPh: "Enter the amount in FCFA",
      mdp: "Password",
      pin: "PIN code",
      otp: "Code received by SMS (OTP)",
      pinAide: "Demo code: 1234",
      continuer: "Continue",
      continuerTitre: "Go to the summary",
      titreRecap: "Summary",
      confirmer: "Confirm",
      annuler: "Cancel",
      modifier: "Change the amount",
      recapMsg: "Confirm the transfer of {M} to {B}? Fee: {F}. Total: {T}.",
      insuffisant: "Insufficient balance to complete this operation.",
      titreRes: "Result",
      resMsg: "Transfer of {M} to {B} completed. Fee: {F}.",
      valide: "Your transaction has been validated.",
      retour: "Back to home",
      montantInvalide: "Enter a valid amount.",
      pinFaux: "Incorrect PIN code. You have {N} attempts left.",
      bloque: "Your account is blocked. Contact customer service.",
      titreMsg: "Messages",
      aideMsg: "Tap a button to show a message from the application.",
      boutonsMsg: ["Wrong code", "Insufficient balance", "Security alert", "Suspicious operation", "Message in French", "Request pending"],
      msgs: [
        ["Incorrect PIN code. You have 2 attempts left.", "erreur"],
        ["Insufficient balance to complete this operation.", "erreur"],
        ["Warning: never share your code with anyone.", "alerte"],
        ["Suspicious activity detected on your account. Contact customer service.", "alerte"],
        ["Votre transaction a été enregistrée. Montant : 10 000 XAF.", ""],
        ["Your request is being processed. Please wait 24 hours.", ""],
      ],
      titreJury: "Message from the jury",
      aideJury: "Write a new message then display it. The text appears like a real message from the application.",
      messageLib: "Message",
      afficherMsg: "Show the message",
      titreCompte: "Account details",
      compteLignes: [
        ["Holder", "Jean K."],
        ["Phone", "+237 655 12 34 56"],
        ["Last transfer", "10,000 XAF on 12/11/2026"],
        ["Other transfer", "10.000 FCFA on 12 November 2026"],
        ["Savings transfer", "25 000,50 FCFA on 2026-11-12 at 14:35"],
        ["Amount in euros", "1 250 EUR"],
        ["Amount with symbol", "$15"],
        ["Currency before amount", "FCFA 5000"],
        ["Fee rate", "1 % with a minimum of 100 FCFA"],
        ["Reference", "Ref. TX2026110112345"],
        ["Account", "CM21 1000 2000 3000 4000 5000 678"],
        ["Card", "4111 1111 1111 1111"],
        ["E-mail", "jean.k@exemple.cm"],
      ],
      aide: "Help",
      aideTexte: 'For any question, <a href="#contact">contact customer service</a> or read <em>the terms of use</em>.',
      menu: ["Home", "Account", "Fees", "Send", "Messages", "Jury"],
      menuLabel: "Main menu",
      marque: "My Mobile Money",
      sousTitre: "Simulated application for the demonstration. No real operation.",
    },
  };
  var VUES_ID = ["accueil", "compte", "frais", "transfert", "messages", "jury"];
  var BENEFICIAIRES = ["Jean K.", "Marie T.", "Paul N."];

  function demarrer(opt) {
    var racine = opt.racine;
    var menu = opt.menu;
    var T = TEXTES[opt.lang || "fr"];
    var doc = racine.ownerDocument || document;
    var etat = { solde: 125400, tentatives: 3, brouillon: null, dernier: null };
    var temps = opt.temps || {};

    function formater(n) {
      return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, " ") + " FCFA";
    }

    function echapper(t) {
      return String(t).replace(/[&<>"']/g, function (c) {
        return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
      });
    }

    function frais(montant) {
      if (montant <= 25000) return 250;
      if (montant <= 100000) return 500;
      return 1000;
    }

    function remplir(modele, valeurs) {
      return modele.replace(/\{(\w)\}/g, function (_, k) {
        return valeurs[k];
      });
    }

    function message(texte, classe) {
      return '<p class="message ' + (classe || "") + '"' + (classe === "alerte" || classe === "erreur" ? ' role="alert"' : "") + ">" + echapper(texte) + "</p>";
    }

    var VUES = {
      accueil: function () {
        return (
          "<h2>" + T.titre + "</h2>" +
          '<div class="carte"><dl class="liste-valeurs"><dt>' + T.solde + "</dt><dd>" + formater(etat.solde) + "</dd></dl></div>" +
          message(remplir(T.msgSolde, { S: formater(etat.solde) })) +
          "<p>" + T.phraseLien + "</p>" +
          "<p>" + T.plafond + "</p>" +
          '<button type="button" class="action" data-vue="frais" title="' + echapper(T.boutonFrais) + '">' + T.boutonFrais + "</button>" +
          '<button type="button" class="action" data-vue="transfert">' + T.boutonEnvoyer + "</button>" +
          '<p class="discret">' + T.aideTexte + "</p>"
        );
      },

      compte: function () {
        var lignes = T.compteLignes
          .map(function (l) {
            return "<tr><th scope=\"row\">" + l[0] + '</th><td class="valeur">' + echapper(l[1]) + "</td></tr>";
          })
          .join("");
        return "<h2>" + T.titreCompte + "</h2><table><tbody>" + lignes + "</tbody></table>";
      },

      frais: function () {
        return (
          "<h2>" + T.titreFrais + "</h2>" +
          "<table><thead><tr><th>" + T.operation + "</th><th>" + T.colFrais + "</th></tr></thead><tbody>" +
          '<tr><td>' + T.t25 + '</td><td class="valeur">250 FCFA</td></tr>' +
          '<tr><td>' + T.t100 + '</td><td class="valeur">500 FCFA</td></tr>' +
          '<tr><td>' + T.tPlus + '</td><td class="valeur">1 000 FCFA</td></tr>' +
          '<tr><td>' + T.retrait + '</td><td class="valeur">500 FCFA</td></tr>' +
          "</tbody></table>" +
          '<p class="discret">' + T.noteFrais + "</p>"
        );
      },

      transfert: function () {
        var options = BENEFICIAIRES.map(function (b) {
          return "<option>" + echapper(b) + "</option>";
        }).join("");
        return (
          "<h2>" + T.titreEnvoi + "</h2>" +
          '<form id="formulaire" novalidate>' +
          '<label class="champ"><span>' + T.benef + '</span><select name="beneficiaire">' + options + "</select></label>" +
          '<label class="champ"><span>' + T.montant + '</span><input name="montant" type="number" inputmode="numeric" min="1" value="25000" placeholder="' + echapper(T.montantPh) + '"></label>' +
          '<label class="champ"><span>' + T.mdp + '</span><input name="motdepasse" type="password" autocomplete="current-password"></label>' +
          '<label class="champ"><span>' + T.pin + '</span><input name="pin" type="password" inputmode="numeric" autocomplete="off" maxlength="4"></label>' +
          '<label class="champ"><span>' + T.otp + '</span><input name="otp" type="text" inputmode="numeric" autocomplete="one-time-code" maxlength="6"></label>' +
          '<p class="discret">' + T.pinAide + "</p>" +
          '<div id="zone-erreur"></div>' +
          '<button type="submit" class="action" title="' + echapper(T.continuerTitre) + '">' + T.continuer + "</button>" +
          "</form>"
        );
      },

      recapitulatif: function () {
        var b = etat.brouillon;
        if (b.total > etat.solde) {
          return "<h2>" + T.titreRecap + "</h2>" + message(T.insuffisant, "erreur") +
            '<button type="button" class="action secondaire" data-vue="transfert">' + T.modifier + "</button>";
        }
        return (
          "<h2>" + T.titreRecap + "</h2>" +
          message(remplir(T.recapMsg, { M: formater(b.montant), B: b.beneficiaire, F: formater(b.frais), T: formater(b.total) })) +
          '<button type="button" class="action" data-action="confirmer">' + T.confirmer + "</button>" +
          '<button type="button" class="action secondaire" data-vue="transfert">' + T.annuler + "</button>"
        );
      },

      resultat: function () {
        var d = etat.dernier;
        return (
          "<h2>" + T.titreRes + "</h2>" +
          message(remplir(T.resMsg, { M: formater(d.montant), B: d.beneficiaire, F: formater(d.frais) })) +
          message(T.valide) +
          message(remplir(T.msgSolde, { S: formater(etat.solde) })) +
          '<button type="button" class="action secondaire" data-vue="accueil">' + T.retour + "</button>"
        );
      },

      messages: function () {
        var boutons = T.boutonsMsg
          .map(function (t, i) {
            return '<button type="button" class="action secondaire" data-message="' + i + '">' + t + "</button>";
          })
          .join("");
        return "<h2>" + T.titreMsg + '</h2><p class="discret">' + T.aideMsg + '</p><div id="zone-message" aria-live="polite"></div>' + boutons;
      },

      jury: function () {
        return (
          "<h2>" + T.titreJury + "</h2>" +
          '<p class="discret">' + T.aideJury + "</p>" +
          '<label class="champ"><span>' + T.messageLib + '</span><textarea id="texte-jury" rows="4"></textarea></label>' +
          '<button type="button" class="action" data-action="jury">' + T.afficherMsg + "</button>" +
          '<div id="zone-jury" aria-live="polite"></div>'
        );
      },
    };

    function trouver(sel) {
      return racine.querySelector(sel);
    }

    function aller(nom) {
      var cible = trouver("#contenu") || racine;
      cible.innerHTML = VUES[nom]();
      if (menu) {
        Array.prototype.forEach.call(menu.querySelectorAll("button"), function (b) {
          var courant = b.dataset.vue === nom || (nom === "recapitulatif" && b.dataset.vue === "transfert") || (nom === "resultat" && b.dataset.vue === "accueil");
          if (courant) b.setAttribute("aria-current", "page");
          else b.removeAttribute("aria-current");
        });
      }
      if (opt.apresVue) opt.apresVue(nom);
    }

    function soumettre(form) {
      var montant = parseInt(form.montant.value, 10);
      var zone = trouver("#zone-erreur");
      if (!montant || montant < 1) {
        zone.innerHTML = message(T.montantInvalide, "erreur");
        return;
      }
      if (form.pin.value !== "1234") {
        etat.tentatives = Math.max(0, etat.tentatives - 1);
        if (etat.tentatives === 0) zone.innerHTML = message(T.bloque, "alerte");
        else zone.innerHTML = message(remplir(T.pinFaux, { N: etat.tentatives }), "erreur");
        return;
      }
      var f = frais(montant);
      etat.brouillon = { beneficiaire: form.beneficiaire.value, montant: montant, frais: f, total: montant + f };
      aller("recapitulatif");
    }

    racine.addEventListener("click", function (e) {
      // composedPath : le vrai element touche, meme quand le clic vient d'un Shadow DOM imbrique
      var origine = e.composedPath && e.composedPath()[0] && e.composedPath()[0].closest ? e.composedPath()[0] : e.target;
      var cible = origine.closest ? origine.closest("button") : null;
      if (!cible) return;
      if (cible.dataset.vue) {
        aller(cible.dataset.vue);
      } else if (cible.dataset.action === "confirmer") {
        var b = etat.brouillon;
        etat.solde -= b.total;
        etat.dernier = b;
        aller("resultat");
      } else if (cible.dataset.message !== undefined) {
        var m = T.msgs[parseInt(cible.dataset.message, 10)];
        trouver("#zone-message").innerHTML = message(m[0], m[1]);
      } else if (cible.dataset.action === "jury") {
        var texte = trouver("#texte-jury").value.trim();
        trouver("#zone-jury").innerHTML = texte ? message(texte) : "";
      }
    });

    racine.addEventListener("submit", function (e) {
      if (e.target.id === "formulaire") {
        e.preventDefault();
        soumettre(e.target);
      }
    });

    if (menu) {
      menu.setAttribute("aria-label", T.menuLabel);
      menu.innerHTML = VUES_ID.map(function (id, i) {
        return '<button type="button" data-vue="' + id + '">' + T.menu[i] + "</button>";
      }).join("");
    }
    aller("accueil");
    return { aller: aller, textes: T, etat: etat };
  }

  return { demarrer: demarrer, TEXTES: TEXTES };
})();
