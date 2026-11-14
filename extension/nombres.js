/*
 * nombres.js - lecture des nombres a voix haute (section 4.3 du cahier des charges).
 * Les moteurs de voix lisent mal les chiffres : on convertit chaque montant en mots.
 */
(function (racine, fabrique) {
  if (typeof module === "object" && module.exports) {
    module.exports = fabrique();
  } else {
    racine.SafinumNombres = fabrique();
  }
})(typeof self !== "undefined" ? self : this, function () {
  var U = ["zero", "un", "deux", "trois", "quatre", "cinq", "six", "sept", "huit", "neuf", "dix", "onze", "douze", "treize", "quatorze", "quinze", "seize"];
  var D = ["", "", "vingt", "trente", "quarante", "cinquante", "soixante"];

  function frMoinsDeCent(n, final) {
    if (n < 17) return U[n];
    if (n < 20) return "dix-" + U[n - 10];
    if (n < 70) {
      var d = Math.floor(n / 10);
      var u = n % 10;
      if (u === 0) return D[d];
      if (u === 1) return D[d] + " et un";
      return D[d] + "-" + U[u];
    }
    if (n < 80) {
      if (n === 71) return "soixante et onze";
      return "soixante-" + frMoinsDeCent(n - 60, final);
    }
    var r = n - 80;
    if (r === 0) return final ? "quatre-vingts" : "quatre-vingt";
    return "quatre-vingt-" + frMoinsDeCent(r, final);
  }

  function frMoinsDeMille(n, final) {
    var c = Math.floor(n / 100);
    var r = n % 100;
    if (c === 0) return frMoinsDeCent(r, final);
    var s = c === 1 ? "cent" : U[c] + " cent" + (r === 0 && final ? "s" : "");
    if (r > 0) s += " " + frMoinsDeCent(r, final);
    return s;
  }

  function fr(n) {
    if (n === 0) return "zero";
    var parts = [];
    var milliards = Math.floor(n / 1e9) % 1000;
    var millions = Math.floor(n / 1e6) % 1000;
    var milliers = Math.floor(n / 1e3) % 1000;
    var reste = n % 1000;
    if (milliards) parts.push(frMoinsDeMille(milliards, true) + " milliard" + (milliards > 1 ? "s" : ""));
    if (millions) parts.push((millions === 1 ? "un" : frMoinsDeMille(millions, true)) + " million" + (millions > 1 ? "s" : ""));
    if (milliers) parts.push(milliers === 1 ? "mille" : frMoinsDeMille(milliers, false) + " mille");
    if (reste) parts.push(frMoinsDeMille(reste, true));
    return parts.join(" ");
  }

  var EN_U = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen", "nineteen"];
  var EN_D = ["", "", "twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety"];

  function enMoinsDeMille(n) {
    var c = Math.floor(n / 100);
    var r = n % 100;
    var s = "";
    if (c) s = EN_U[c] + " hundred";
    if (r) {
      var reste = r < 20 ? EN_U[r] : EN_D[Math.floor(r / 10)] + (r % 10 ? "-" + EN_U[r % 10] : "");
      s += (s ? " " : "") + reste;
    }
    return s;
  }

  function en(n) {
    if (n === 0) return "zero";
    var parts = [];
    var milliards = Math.floor(n / 1e9) % 1000;
    var millions = Math.floor(n / 1e6) % 1000;
    var milliers = Math.floor(n / 1e3) % 1000;
    var reste = n % 1000;
    if (milliards) parts.push(enMoinsDeMille(milliards) + " billion");
    if (millions) parts.push(enMoinsDeMille(millions) + " million");
    if (milliers) parts.push(enMoinsDeMille(milliers) + " thousand");
    if (reste) parts.push(enMoinsDeMille(reste));
    return parts.join(" ");
  }

  // Normalise 10,000 / 10.000 / 25 000 / 12,50 en nombre. Retourne null si ce n'est pas un nombre.
  function lireNombre(brut) {
    var s = String(brut).replace(/[\u00a0\u202f]/g, " ").trim();
    var m = s.match(/^(\d{1,3}(?:[ .,]\d{3})+|\d+)(?:[.,](\d{1,2}))?$/);
    if (!m) {
      // cas '10.000' : le dernier groupe fait 3 chiffres, ce sont des milliers
      return null;
    }
    var entier = m[1].replace(/[ .,]/g, "");
    var decimale = m[2] ? parseInt(m[2].length === 1 ? m[2] + "0" : m[2], 10) : 0;
    return { entier: parseInt(entier, 10), centimes: decimale };
  }

  function enMots(nombre, langue) {
    var f = langue === "en" ? en : fr;
    var mots = f(nombre.entier);
    if (nombre.centimes) {
      mots += langue === "en" ? " point " : " virgule ";
      mots += f(nombre.centimes);
    }
    return mots;
  }

  function devisePrononcee(texte, langue) {
    if (/FCFA|CFA|XAF|XOF/i.test(texte)) return langue === "en" ? "CFA francs" : "francs CFA";
    if (/EUR|\u20ac/i.test(texte)) return langue === "en" ? "euros" : "euros";
    if (/USD|\$/i.test(texte)) return langue === "en" ? "dollars" : "dollars";
    if (/%/.test(texte)) return langue === "en" ? "percent" : "pour cent";
    return "";
  }

  // Transforme un montant ecrit ('25 000 FCFA') en mots ('vingt-cinq mille francs CFA')
  function montantEnMots(montant, langue) {
    var brut = montant.replace(/FCFA|F\.?\s?CFA|XAF|XOF|CFA|EUR|USD|\u20ac|\$|%/gi, "").trim();
    var n = lireNombre(brut);
    if (!n) return montant;
    return enMots(n, langue) + " " + devisePrononcee(montant, langue);
  }

  return { fr: fr, en: en, lireNombre: lireNombre, enMots: enMots, montantEnMots: montantEnMots };
});
