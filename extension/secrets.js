/*
 * secrets.js - detection des champs secrets (PIN, mot de passe, OTP, carte).
 * Plusieurs signaux : type, autocomplete, inputmode, nom, id, etiquette, profil du site.
 * Le contenu d'un champ secret n'est jamais lu, envoye ni prononce.
 */
(function (racine, fabrique) {
  if (typeof module === "object" && module.exports) {
    module.exports = fabrique();
  } else {
    racine.SafinumSecrets = fabrique();
  }
})(typeof self !== "undefined" ? self : this, function () {
  var AUTOCOMPLETE = /(one-time-code|current-password|new-password|cc-number|cc-csc|cc-exp|cc-name)/i;
  // Mots qui designent un secret quand ils sont seuls dans un nom, un id ou une etiquette
  var MOTS = /(^|[^a-z0-9])(pin|otp|cvv|cvc|password|passwd|passcode|mdp|secret|code[ _-]?secret|mot[ _-]de[ _-]passe)([^a-z0-9]|$)/i;
  var MOTS_NUMERIQUE = /(pin|otp|code|secret|mot[ _-]de[ _-]passe|password|cvv|cvc)/i;

  function etiquette(champ) {
    var t = "";
    try {
      if (champ.labels && champ.labels.length) {
        for (var i = 0; i < champ.labels.length; i++) t += " " + champ.labels[i].textContent;
      }
    } catch (e) {
      // pas d'etiquette lisible
    }
    return t + " " + (champ.getAttribute("aria-label") || "");
  }

  // Vrai si l'element est un champ de saisie secret. 'profil.secrets' = selecteurs en plus.
  function estSecret(champ, profil) {
    if (!champ || !champ.getAttribute) return false;
    var tag = (champ.tagName || "").toUpperCase();
    if (tag !== "INPUT" && tag !== "TEXTAREA" && tag !== "SELECT") {
      return champ.hasAttribute("data-secret");
    }
    var type = (champ.getAttribute("type") || "text").toLowerCase();
    if (type === "password") return true;
    if (champ.hasAttribute("data-secret")) return true;
    if (AUTOCOMPLETE.test(champ.getAttribute("autocomplete") || "")) return true;
    var nom = (champ.getAttribute("name") || "") + " " + (champ.id || "");
    var texte = nom + " " + etiquette(champ) + " " + (champ.getAttribute("placeholder") || "");
    if (MOTS.test(nom) || MOTS.test(etiquette(champ))) return true;
    var mode = (champ.getAttribute("inputmode") || "").toLowerCase();
    if ((mode === "numeric" || mode === "tel") && MOTS_NUMERIQUE.test(texte)) return true;
    if (profil && profil.secrets) {
      for (var i = 0; i < profil.secrets.length; i++) {
        try {
          if (champ.matches(profil.secrets[i])) return true;
        } catch (e) {
          // selecteur invalide : ignore
        }
      }
    }
    return false;
  }

  return { estSecret: estSecret };
});
