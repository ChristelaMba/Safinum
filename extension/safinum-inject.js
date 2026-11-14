/* SAFINUM - script autonome (plan B). Genere par outils/construire_inject.py : ne pas modifier a la main. */
/* Avant de le charger, on peut ecrire : window.SAFINUM_URL = 'http://adresse-du-serveur:8000'; */

/* ---- Relais : remplace chrome.runtime et chrome.storage quand l'extension n'est pas installee ---- */
(function () {
  if (window.chrome && window.chrome.runtime && window.chrome.runtime.sendMessage) return;
  var SERVEUR = (window.SAFINUM_URL || "http://localhost:8000").replace(/\/$/, "");
  var PROFILS = {"_aide": "Profils par site. Aucun profil n'est requis : le cas general marche seul. 'ignorer' = selecteurs a ne pas lire. 'secrets' = selecteurs de champs secrets en plus. 'forcer' = selecteurs a lire meme si on les aurait ignores. 'motifs' = valeurs a proteger en plus : { type, motif, groupe }.", "defaut": {"ignorer": [], "secrets": [], "forcer": [], "motifs": []}, "domaines": {"exemple-banque.test": {"ignorer": [".publicite", "#bandeau-cookies"], "secrets": ["input.champ-code-carte"], "forcer": [], "motifs": []}}};
  window.SAFINUM_VISIBLE = true;

  function appeler(chemin, corps) {
    return fetch(SERVEUR + chemin, {
      method: corps ? "POST" : "GET",
      headers: corps ? { "Content-Type": "application/json" } : {},
      body: corps ? JSON.stringify(corps) : undefined,
    });
  }

  function profil(hote) {
    var p = { ignorer: [], secrets: [], forcer: [], motifs: [] };
    function fusion(src) {
      Object.keys(p).forEach(function (k) { if (src && src[k]) p[k] = p[k].concat(src[k]); });
    }
    fusion(PROFILS.defaut);
    Object.keys(PROFILS.domaines || {}).forEach(function (d) {
      if (hote === d || hote.endsWith("." + d)) fusion(PROFILS.domaines[d]);
    });
    return p;
  }

  var relais = {
    runtime: {
      lastError: null,
      id: "safinum-inject",
      onMessage: { addListener: function () {} },
      sendMessage: function (msg, rappel) {
        if (msg.type === "profil") return rappel({ profil: profil(msg.hote || "") });
        if (msg.type === "traduire") {
          appeler("/v1/translate", { langue_cible: msg.langue, segments: msg.segments })
            .then(function (r) { return r.ok ? r.json() : { erreur: "http_" + r.status }; })
            .then(rappel)
            .catch(function () { rappel({ erreur: "serveur_injoignable" }); });
        } else if (msg.type === "langues") {
          appeler("/v1/langues")
            .then(function (r) { return r.json(); })
            .then(function (l) { rappel({ langues: l }); })
            .catch(function () { rappel({ langues: [] }); });
        } else if (msg.type === "tts") {
          appeler("/v1/tts", { langue: msg.langue, texte: msg.texte })
            .then(function (r) { return r.ok ? r.blob() : null; })
            .then(function (b) {
              if (!b) return rappel({ erreur: "tts" });
              var lecteur = new FileReader();
              lecteur.onload = function () { rappel({ audio: lecteur.result }); };
              lecteur.readAsDataURL(b);
            })
            .catch(function () { rappel({ erreur: "serveur_injoignable" }); });
        } else {
          rappel({ erreur: "inconnu" });
        }
      },
    },
    storage: {
      local: {
        get: function (cles) {
          var r = {};
          [].concat(cles).forEach(function (k) {
            try {
              var v = localStorage.getItem("safinum:" + k);
              if (v !== null) r[k] = JSON.parse(v);
            } catch (e) { /* stockage indisponible */ }
          });
          return Promise.resolve(r);
        },
        set: function (obj) {
          Object.keys(obj).forEach(function (k) {
            try { localStorage.setItem("safinum:" + k, JSON.stringify(obj[k])); } catch (e) { /* plein ou bloque */ }
          });
          return Promise.resolve();
        },
      },
    },
  };
  window.chrome = Object.assign(window.chrome || {}, relais);
})();


/* ---- protection.js ---- */
/*
 * protection.js - protection des valeurs financieres (F2 et F4).
 * Les montants, frais, pourcentages, dates, numeros et noms de beneficiaires sont remplaces
 * par des balises [MONTANT_1], [FRAIS_1], [BENEF_1]... avant tout envoi au serveur.
 * Les balises sont remises a leur valeur d'origine ici, dans le navigateur.
 */
(function (racine, fabrique) {
  if (typeof module === "object" && module.exports) {
    module.exports = fabrique();
  } else {
    racine.SafinumProtection = fabrique();
  }
})(typeof self !== "undefined" ? self : this, function () {
  var DEVISE = "(?:FCFA|F\\.?\\s?CFA|XAF|XOF|CFA|EUR|USD|\\u20ac|\\$)";
  var NOMBRE = "\\d{1,3}(?:[\\s\\u00a0\\u202f.,]\\d{3})+(?:[.,]\\d{1,2})?|\\d+(?:[.,]\\d{1,2})?";
  var FIN = "(?![A-Za-z])";
  var CAP = "[A-Z\\u00c0-\\u00dd][\\p{L}'-]+";
  var INIT = "[A-Z\\u00c0-\\u00dd]\\.";
  var NOM = CAP + "(?:\\s+" + CAP + "){0,2}(?:\\s+" + INIT + ")?";
  var MOIS = "janvier|f\\u00e9vrier|fevrier|mars|avril|mai|juin|juillet|ao\\u00fbt|aout|septembre|octobre|novembre|d\\u00e9cembre|decembre|january|february|march|april|june|july|august|september|october|november|december";

  // Ordre de priorite : un texte deja pris par un motif ne peut pas etre repris par un autre
  // Montants ecrits en toutes lettres ("vingt mille francs CFA", "twenty thousand francs") : protege comme un montant
  var MOTS_NB_FR = "z\\u00e9ro|un|une|deux|trois|quatre|cinq|six|sept|huit|neuf|dix|onze|douze|treize|quatorze|quinze|seize|vingt|trente|quarante|cinquante|soixante|cent|cents|mille|million|millions";
  var MOTS_NB_EN = "one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|hundred|thousand|million";
  var DEVISE_MOTS = "francs?(?:\\s+CFA)?|euros?|dollars?";

  var MOTIFS_SITE = []; // motifs ajoutes par le profil du site : { type, re, groupe }

  var MOTIFS = [
    // Identifiants qui ne doivent jamais partir : e-mail, adresse web, IBAN, numero de carte (tous en balise REF)
    { type: "REF", re: /[\w.+-]+@[\w-]+(?:\.[\w-]+)+/gu },
    { type: "REF", re: /\bhttps?:\/\/[^\s<>"]+/gu },
    { type: "REF", re: /\b[A-Z]{2}\d{2}(?:[ ]?[A-Z0-9]{4}){2,7}(?:[ ]?[A-Z0-9]{1,4})?\b/gu },
    { type: "REF", re: /\b\d{4}(?:[ -]\d{4}){3}(?:[ -]\d{1,3})?\b|\b\d{13,19}\b/gu },
    { type: "MONTANT", re: new RegExp("\\b(?:" + MOTS_NB_FR + ")(?:[\\s-]+(?:" + MOTS_NB_FR + "|et))*[\\s-]+(?:" + DEVISE_MOTS + ")\\b", "giu") },
    { type: "MONTANT", re: new RegExp("\\b(?:" + MOTS_NB_EN + ")(?:[\\s-]+(?:" + MOTS_NB_EN + "|and))*[\\s-]+(?:" + DEVISE_MOTS + ")\\b", "giu") },
    { type: "MONTANT", re: new RegExp("(?:" + DEVISE + "\\s?(?:" + NOMBRE + ")|(?:" + NOMBRE + ")\\s?" + DEVISE + FIN + ")", "gu") },
    { type: "POURCENT", re: /\d+(?:[.,]\d+)?\s?%/gu },
    { type: "DATE", re: new RegExp("\\b\\d{1,2}[\\/.-]\\d{1,2}[\\/.-]\\d{2,4}\\b|\\b\\d{1,2}\\s(?:" + MOIS + ")\\s\\d{4}\\b|\\b\\d{4}-\\d{2}-\\d{2}\\b|\\b\\d{1,2}[:h]\\d{2}(?::\\d{2})?\\b", "giu") },
    { type: "TEL", re: /(?:\+|00)\d{1,3}[\s.-]?(?:\d[\s.-]?){8,10}\d|\b[26]\d{2}(?:[\s.-]?\d{2}){3}\b|\b[26]\s\d{2}(?:\s\d{2}){3}\b/gu },
    { type: "REF", re: /\b(?:REF|TXN|ID)[\s:#-]*[A-Z0-9-]{4,}\b|\b[A-Z]{2,4}[-_]?\d{5,}\b/gu },
    { type: "BENEF", groupe: 1, re: new RegExp("(?:\\b[Vv]ers|(?<![\\p{L}])[\\u00c0\\u00e0]|\\b[Tt]o|\\b[Ff]rom|\\b[Pp]our|[Bb]\\u00e9n\\u00e9ficiaire|[Bb]eneficiaire|[Bb]eneficiary|[Rr]ecipient|[Dd]estinataire)\\s*:?\\s+(" + NOM + ")", "gu") },
    // Un nom suivi d'une initiale (Marie T.), meme sans mot qui l'annonce
    { type: "BENEF", re: new RegExp(CAP + "\\s+[A-Z\\u00c0-\\u00dd]\\.(?![\\p{L}])", "gu") },
    { type: "NOMBRE", re: /\d+(?:[.,]\d+)?/gu },
  ];

  // Trouve toutes les valeurs d'un texte : liste triee de { type, debut, fin, valeur }
  function trouver(texte) {
    var pris = new Array(texte.length).fill(false);
    var trouves = [];
    MOTIFS_SITE.concat(MOTIFS).forEach(function (motif) {
      motif.re.lastIndex = 0;
      var m;
      while ((m = motif.re.exec(texte)) !== null) {
        if (m[0].length === 0) {
          motif.re.lastIndex++;
          continue;
        }
        var valeur = motif.groupe ? m[motif.groupe] : m[0];
        var debut = motif.groupe ? m.index + m[0].lastIndexOf(valeur) : m.index;
        var fin = debut + valeur.length;
        var libre = true;
        for (var i = debut; i < fin; i++) {
          if (pris[i]) {
            libre = false;
            break;
          }
        }
        if (!libre) continue;
        for (var j = debut; j < fin; j++) pris[j] = true;
        trouves.push({ type: motif.type, debut: debut, fin: fin, valeur: valeur });
      }
    });
    trouves.sort(function (a, b) {
      return a.debut - b.debut;
    });
    trouves.forEach(function (t) {
      // Un montant juste apres le mot 'frais' est un FRAIS
      if (t.type === "MONTANT") {
        var avant = texte.slice(Math.max(0, t.debut - 25), t.debut);
        if (/(frais|fees?|commission)[^.\[\]]{0,15}$/i.test(avant)) t.type = "FRAIS";
      }
    });
    return trouves;
  }

  // Remplace les valeurs par des balises numerotees par type
  function proteger(texte) {
    var trouves = trouver(texte);
    var compteurs = {};
    var valeurs = {};
    var sortie = "";
    var curseur = 0;
    trouves.forEach(function (t) {
      compteurs[t.type] = (compteurs[t.type] || 0) + 1;
      var balise = "[" + t.type + "_" + compteurs[t.type] + "]";
      valeurs[balise] = t.valeur;
      sortie += texte.slice(curseur, t.debut) + balise;
      curseur = t.fin;
    });
    sortie += texte.slice(curseur);
    return { texte: sortie, valeurs: valeurs };
  }

  // Les modeles abiment parfois les balises : on accepte [montant 1] mais on les remet sous forme canonique
  function canoniser(texte) {
    return texte.replace(/\[\s*(MONTANT|FRAIS|BENEF|NOMBRE|DATE|TEL|REF|POURCENT)[\s_]*(\d+)\s*\]/gi, function (_, t, n) {
      return "[" + t.toUpperCase() + "_" + n + "]";
    });
  }

  // Remet les valeurs d'origine. ok=false si une balise manque, est en double ou est inconnue.
  function restaurer(traduit, valeurs) {
    var t = canoniser(traduit);
    var attendues = Object.keys(valeurs);
    var presentes = t.match(/\[(?:MONTANT|FRAIS|BENEF|NOMBRE|DATE|TEL|REF|POURCENT)_\d+\]/g) || [];
    var ok = presentes.length === attendues.length;
    attendues.forEach(function (b) {
      var n = presentes.filter(function (p) {
        return p === b;
      }).length;
      if (n !== 1) ok = false;
    });
    if (!ok) return { ok: false, texte: traduit };
    var sortie = t;
    attendues.forEach(function (b) {
      sortie = sortie.split(b).join(valeurs[b]);
    });
    return { ok: true, texte: sortie };
  }

  // F2 : toutes les valeurs de depart doivent se retrouver dans le texte affiche
  // Compte les valeurs d'un texte, par valeur exacte (les noms sont comptes a part : ils n'ont pas de forme propre)
  function compter(texte) {
    var c = {};
    trouver(texte).forEach(function (t) {
      if (t.type === "BENEF") return;
      c[t.valeur] = (c[t.valeur] || 0) + 1;
    });
    return c;
  }

  // Chaque valeur du texte d'origine doit encore etre dans le texte affiche, au moins aussi souvent.
  // On recompte les valeurs du texte affiche : "500 FCFA" cache dans "25 500 FCFA" ne suffit pas.
  function valeursIdentiques(original, affiche) {
    var avant = compter(original);
    var apres = compter(affiche);
    var bon = Object.keys(avant).every(function (v) {
      return (apres[v] || 0) >= avant[v];
    });
    if (!bon) return false;
    return trouver(original).every(function (t) {
      return t.type !== "BENEF" || affiche.indexOf(t.valeur) !== -1;
    });
  }

  // Motifs en plus pour un site (profil) : [{ type, motif, groupe }]. Le type doit etre un type de balise connu.
  function ajouterMotifs(liste) {
    MOTIFS_SITE = [];
    (liste || []).forEach(function (m) {
      try {
        MOTIFS_SITE.push({ type: m.type || "REF", groupe: m.groupe, re: new RegExp(m.motif, "gu") });
      } catch (e) {
        // motif invalide : ignore
      }
    });
  }

  // Regex des montants, reutilisee par la voix
  // La voix convertit les montants en chiffres : on prend le motif numerique (le dernier des motifs MONTANT)
  var MONTANT_RE = MOTIFS.filter(function (m) { return m.type === "MONTANT"; }).pop().re;

  return { ajouterMotifs: ajouterMotifs, trouver: trouver, proteger: proteger, restaurer: restaurer, canoniser: canoniser, valeursIdentiques: valeursIdentiques, MONTANT_RE: MONTANT_RE };
});


/* ---- secrets.js ---- */
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


/* ---- nombres.js ---- */
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


/* ---- lecteur.js ---- */
/*
 * lecteur.js - LecteurDePage : lire la page par blocs, appliquer les textes, observer, restaurer.
 *
 * Un bloc = le contenu en ligne d'un element de niveau bloc (p, li, td, h1, button...).
 * Les elements en ligne (b, a, span...) deviennent des marqueurs <s1>...</s1> envoyes au serveur.
 * Les valeurs financieres deviennent des balises [MONTANT_1]. Une valeur coupee par du HTML
 * (par exemple <span>25</span> <span>000</span> FCFA) est une seule valeur "ancre" : son texte
 * reste en place dans la page et n'est jamais reecrit.
 * Seuls les textes des noeuds changent. Aucun element n'est cree, deplace ou supprime.
 *
 * Interface (pour brancher un autre lecteur plus tard, par exemple un service d'accessibilite) :
 *   creer(options) -> { lire, appliquer, afficherOriginal, restaurer, observer, arreterObservation }
 */
(function (racine, fabrique) {
  if (typeof module === "object" && module.exports) {
    module.exports = fabrique(require("./protection.js"), require("./secrets.js"));
  } else {
    racine.SafinumLecteur = fabrique(racine.SafinumProtection, racine.SafinumSecrets);
  }
})(typeof self !== "undefined" ? self : this, function (P, S) {
  var ELEMENTS_EN_LIGNE = {
    A: 1, ABBR: 1, B: 1, BDI: 1, BDO: 1, CITE: 1, DFN: 1, EM: 1, FONT: 1, I: 1, MARK: 1, Q: 1,
    S: 1, SMALL: 1, SPAN: 1, STRONG: 1, SUB: 1, SUP: 1, TIME: 1, U: 1, VAR: 1,
  };
  // Elements dont le contenu n'est jamais lu : ils coupent aussi le bloc en cours
  var ELEMENTS_OPAQUES = {
    SCRIPT: 1, STYLE: 1, NOSCRIPT: 1, TEXTAREA: 1, CODE: 1, PRE: 1, TEMPLATE: 1, SVG: 1, CANVAS: 1,
    INPUT: 1, IMG: 1, BR: 1, HR: 1, OBJECT: 1, EMBED: 1, AUDIO: 1, VIDEO: 1, MATH: 1, WBR: 1, LINK: 1, META: 1,
  };
  var ATTRIBUTS_TEXTE = ["placeholder", "aria-label", "title", "alt"];
  var BALISES_RE = /\[(?:MONTANT|FRAIS|BENEF|NOMBRE|DATE|TEL|REF|POURCENT)_\d+\]/g;
  var MARQUEUR_RE = /<\s*(\/?)\s*s\s*(\d+)\s*>|\[\s*(MONTANT|FRAIS|BENEF|NOMBRE|DATE|TEL|REF|POURCENT)[\s_]*(\d+)\s*\]/gi;
  var A_DES_LETTRES = /\p{L}/u;

  function nomBalise(el) {
    return (el.tagName || "").toUpperCase();
  }

  function creer(options) {
    var opt = options || {};
    var profil = opt.profil || {};
    var suivis = new WeakMap(); // noeud de texte -> { brut, traduit, ecrit }
    var liste = new Set(); // noeuds modifies
    var attributs = new Map(); // element -> { nom: { brut, traduit, ecrit } }
    var langues = new Set(); // elements auxquels on a ajoute lang
    var observateurs = []; // { obs, racine }
    var dynamiques = new WeakMap(); // element -> date de fin du statut dynamique
    var historique = new WeakMap(); // element -> dates des changements
    var rappel = null;
    var minuteur = null;
    var enAttente = new Set();
    var afficheOriginal = false;

    // ------------------------------------------------------------ regles d'exclusion

    function selecteurCorrespond(el, liste_) {
      if (!liste_) return false;
      for (var i = 0; i < liste_.length; i++) {
        try {
          if (el.matches(liste_[i])) return true;
        } catch (e) {
          // selecteur de profil invalide : ignore
        }
      }
      return false;
    }

    function estCache(el) {
      if (el.hidden) return true;
      if (opt.estCache) return opt.estCache(el);
      var vue = el.ownerDocument && el.ownerDocument.defaultView;
      if (!vue || !vue.getComputedStyle) return false;
      try {
        return vue.getComputedStyle(el).display === "none";
      } catch (e) {
        return false;
      }
    }

    function editable(el) {
      var v = el.getAttribute("contenteditable");
      return v !== null && v !== "false";
    }

    // Vrai si l'element ne doit pas etre lu (le bloc en cours est alors coupe)
    function ignore(el) {
      var tag = nomBalise(el);
      // Profil du site : un element force est lu meme si on l'aurait ignore (sauf champ secret)
      if (selecteurCorrespond(el, profil.forcer) && !S.estSecret(el, profil) && !ELEMENTS_OPAQUES[tag]) return false;
      if (ELEMENTS_OPAQUES[tag]) return true;
      if (el.hasAttribute("data-safinum-ignore") || el.hasAttribute("data-secret")) return true;
      if (editable(el)) return true;
      if (selecteurCorrespond(el, profil.ignorer) || selecteurCorrespond(el, profil.secrets)) return true;
      if (S.estSecret(el, profil)) return true;
      return false;
    }

    function enLigneBrut(el) {
      return !!ELEMENTS_EN_LIGNE[nomBalise(el)] && !el.shadowRoot;
    }

    // Un element est "en ligne" si lui et tout ce qu'il contient sont du texte et des elements en ligne
    function estEnLigne(el) {
      if (!enLigneBrut(el) || ignore(el)) return false;
      if (opt.enLigne && !opt.enLigne(el)) return false;
      for (var c = el.firstChild; c; c = c.nextSibling) {
        if (c.nodeType === 1 && !estEnLigne(c)) return false;
      }
      return true;
    }

    function estDynamique(el) {
      for (var e = el; e; e = e.parentElement) {
        var fin = dynamiques.get(e);
        if (fin && Date.now() < fin) return true;
      }
      return false;
    }

    // ------------------------------------------------------------ etat des noeuds

    // Texte d'origine d'un noeud : si on l'a deja traduit et que personne ne l'a change, c'est 'brut'
    function brutDe(noeud) {
      var rec = suivis.get(noeud);
      if (rec && noeud.nodeValue === rec.ecrit) return rec.brut;
      return noeud.nodeValue;
    }

    function dejaFait(noeud) {
      var rec = suivis.get(noeud);
      return !!rec && noeud.nodeValue === rec.ecrit;
    }

    // ------------------------------------------------------------ construction d'un bloc

    function enleverEnveloppes(items) {
      var cur = items;
      for (;;) {
        var debut = 0;
        var fin = cur.length - 1;
        while (debut <= fin && cur[debut].t === "texte" && !A_DES_LETTRES.test(cur[debut].noeud.nodeValue) && !/\d/.test(cur[debut].noeud.nodeValue)) debut++;
        while (fin >= debut && cur[fin].t === "texte" && !A_DES_LETTRES.test(cur[fin].noeud.nodeValue) && !/\d/.test(cur[fin].noeud.nodeValue)) fin--;
        if (debut < fin && cur[debut].t === "ouvre" && cur[fin].t === "ferme" && cur[debut].el === cur[fin].el) {
          cur = cur.slice(debut + 1, fin);
        } else {
          return cur;
        }
      }
    }

    function construireBloc(itemsBruts, conteneur) {
      var items = enleverEnveloppes(itemsBruts);
      var plat = "";
      var decalage = 0;
      var i;
      var it;
      for (i = 0; i < items.length; i++) {
        it = items[i];
        if (it.t === "texte") {
          it.raw = brutDe(it.noeud);
          it.debut = decalage;
          decalage += it.raw.length;
          it.fin = decalage;
          plat += it.raw;
        }
      }
      if (!A_DES_LETTRES.test(plat)) return null;

      // Tout est deja traduit et inchange : rien a faire
      var tout = true;
      var avecTexte = false;
      items.forEach(function (x) {
        if (x.t === "texte" && A_DES_LETTRES.test(x.raw)) {
          avecTexte = true;
          if (!dejaFait(x.noeud)) tout = false;
        }
      });
      if (avecTexte && tout) return null;

      var spans = P.trouver(plat);
      spans.forEach(function (s) {
        var n = 0;
        items.forEach(function (x) {
          if (x.t === "texte" && x.debut < s.fin && x.fin > s.debut) n++;
        });
        s.ancre = n > 1;
      });

      // Noms des balises, par type, dans l'ordre du texte
      var compteurs = {};
      var valeurs = {};
      spans.forEach(function (s) {
        compteurs[s.type] = (compteurs[s.type] || 0) + 1;
        s.balise = "[" + s.type + "_" + compteurs[s.type] + "]";
        valeurs[s.balise] = s.valeur;
      });

      // Fragments de chaque noeud : "libre" (traduisible, avec ses valeurs internes) ou "verrou" (jamais reecrit)
      items.forEach(function (x) {
        if (x.t !== "texte") return;
        x.frags = [];
        var pos = x.debut;
        var courant = null;
        function fermer() {
          courant = null;
        }
        function libre(a, b) {
          if (!courant) {
            courant = { type: "libre", a: a - x.debut, b: b - x.debut, vals: [], noeudItem: x };
            x.frags.push(courant);
          } else {
            courant.b = b - x.debut;
          }
        }
        while (pos < x.fin) {
          var s = null;
          for (var k = 0; k < spans.length; k++) {
            if (spans[k].fin > pos) {
              s = spans[k];
              break;
            }
          }
          if (!s || s.debut >= x.fin) {
            libre(pos, x.fin);
            pos = x.fin;
            break;
          }
          if (s.debut > pos) {
            libre(pos, s.debut);
            pos = s.debut;
          }
          var finPart = Math.min(x.fin, s.fin);
          if (s.ancre) {
            fermer();
            x.frags.push({ type: "verrou", a: pos - x.debut, b: finPart - x.debut, span: s, noeudItem: x });
          } else {
            libre(pos, finPart);
            courant.vals.push(s);
          }
          pos = finPart;
        }
      });

      // Appariement des ouvertures et fermetures, et choix des elements a ne pas envoyer
      var pile = [];
      items.forEach(function (x, idx) {
        if (x.t === "ouvre") {
          pile.push({ item: x, idx: idx });
        } else if (x.t === "ferme") {
          var o = pile.pop();
          if (o) {
            o.item.fermeIdx = idx;
            o.item.ferme = x;
            x.ouvre = o.item;
          }
        }
      });
      items.forEach(function (x, idx) {
        if (x.t !== "ouvre") return;
        var utile = false;
        for (var j = idx + 1; j < (x.fermeIdx === undefined ? items.length : x.fermeIdx); j++) {
          var y = items[j];
          if (y.t !== "texte") continue;
          y.frags.forEach(function (f) {
            if (f.type === "libre" && (f.vals.length || A_DES_LETTRES.test(y.raw.slice(f.a, f.b)))) utile = true;
          });
        }
        x.omis = !utile || x.fermeIdx === undefined;
        if (x.ferme) x.ferme.omis = x.omis;
        if (x.omis) {
          // Le contenu d'un element omis ne bouge pas
          for (var j2 = idx + 1; j2 < (x.fermeIdx === undefined ? items.length : x.fermeIdx); j2++) {
            var z = items[j2];
            if (z.t === "texte") z.frags.forEach(function (f) { if (f.type === "libre") f.type = "verrou"; });
          }
        }
      });

      // Flux envoye au serveur
      var flux = "";
      var structure = [];
      var slots = [{ frags: [] }];
      var idMarqueur = 0;
      var ancresEmises = {};
      var contenues = [];
      items.forEach(function (x) {
        if (x.t === "ouvre" && !x.omis) {
          idMarqueur++;
          x.marqueur = idMarqueur;
          structure.push("o" + idMarqueur);
          flux += "<s" + idMarqueur + ">";
          slots.push({ frags: [] });
        } else if (x.t === "ferme" && !x.omis && x.ouvre && x.ouvre.marqueur) {
          structure.push("c" + x.ouvre.marqueur);
          flux += "</s" + x.ouvre.marqueur + ">";
          slots.push({ frags: [] });
        } else if (x.t === "texte") {
          x.frags.forEach(function (f) {
            if (f.type === "libre") {
              var morceau = "";
              var cur = f.a;
              f.vals.forEach(function (s) {
                morceau += x.raw.slice(cur, s.debut - x.debut) + s.balise;
                contenues.push(s.balise);
                cur = s.fin - x.debut;
              });
              morceau += x.raw.slice(cur, f.b);
              f.slot = slots.length - 1;
              f.texteFlux = morceau;
              slots[slots.length - 1].frags.push(f);
              flux += morceau;
            } else if (f.span && !ancresEmises[f.span.balise]) {
              ancresEmises[f.span.balise] = true;
              structure.push("a" + f.span.balise);
              flux += f.span.balise;
              slots.push({ frags: [] });
            }
          });
        }
      });

      var bloc = {
        conteneur: conteneur,
        items: items,
        noeuds: items.filter(function (x) { return x.t === "texte"; }).map(function (x) { return x.noeud; }),
        plat: plat,
        texte: flux.replace(/\s+/g, " ").trim(),
        structure: structure,
        slots: slots,
        valeurs: valeurs,
        slotsActifs: null,
        contenues: contenues,
      };
      // Le texte envoye doit contenir au moins une lettre en dehors des balises et des marqueurs
      var visible = bloc.texte.replace(BALISES_RE, "").replace(/<\/?s\d+>/g, "");
      if (!A_DES_LETTRES.test(visible)) return null;
      slots.forEach(function (sl) {
        var avec = sl.frags.filter(function (f) { return A_DES_LETTRES.test(f.texteFlux); })[0];
        sl.principal = avec || sl.frags[0] || null;
      });
      return bloc;
    }

    // ------------------------------------------------------------ application d'une sortie

    function nombres(texte) {
      var m = texte.match(/\d[\d\s  .,]*\d|\d/g) || [];
      return m.map(function (v) { return v.replace(/\D/g, ""); });
    }

    // Controle independant des valeurs : tout ce qui etait la y est encore, rien de nouveau n'apparait
    function valeursIdentiques(avant, apres) {
      if (!P.valeursIdentiques(avant, apres)) return false;
      var permis = nombres(avant);
      var vus = nombres(apres);
      for (var j = 0; j < vus.length; j++) {
        if (permis.indexOf(vus[j]) === -1) return false;
      }
      return true;
    }

    function espaces(raw) {
      return { debut: (raw.match(/^\s*/) || [""])[0], fin: (raw.match(/\s*$/) || [""])[0] };
    }

    // Verifie la sortie du serveur et calcule les nouvelles valeurs des noeuds. Ne touche pas a la page.
    function calculer(bloc, sortie, suffixe) {
      var texte = String(sortie || "");
      // Reperer marqueurs et balises
      var attendus = {};
      Object.keys(bloc.valeurs).forEach(function (b) { attendus[b] = 0; });
      var struct = [];
      var pieces = [""];
      var curseur = 0;
      var m;
      MARQUEUR_RE.lastIndex = 0;
      while ((m = MARQUEUR_RE.exec(texte)) !== null) {
        var avant = texte.slice(curseur, m.index);
        curseur = m.index + m[0].length;
        if (m[3]) {
          var nom = "[" + m[3].toUpperCase() + "_" + m[4] + "]";
          if (!(nom in attendus)) return { ok: false, raison: "balise_inconnue" };
          attendus[nom]++;
          if (bloc.structure.indexOf("a" + nom) !== -1) {
            pieces[pieces.length - 1] += avant;
            struct.push("a" + nom);
            pieces.push("");
          } else {
            pieces[pieces.length - 1] += avant + nom;
          }
        } else {
          pieces[pieces.length - 1] += avant;
          struct.push((m[1] ? "c" : "o") + m[2]);
          pieces.push("");
        }
      }
      pieces[pieces.length - 1] += texte.slice(curseur);
      var cle;
      for (cle in attendus) {
        if (attendus[cle] !== 1) return { ok: false, raison: "balise_modifiee" };
      }
      if (struct.join(",") !== bloc.structure.join(",")) return { ok: false, raison: "marqueurs_modifies" };
      if (/<\/?[a-zA-Z][^>]*>/.test(pieces.join(""))) return { ok: false, raison: "html_inattendu" };

      // Remettre les valeurs dans les morceaux
      pieces = pieces.map(function (p) {
        bloc.contenues.forEach(function (b) { p = p.split(b).join(bloc.valeurs[b]); });
        return p;
      });

      // Repli : un seul texte en sortie, qui va dans la zone active
      if (bloc.slotsActifs) {
        var seul = pieces.join("");
        pieces = bloc.slots.map(function () { return ""; });
        pieces[bloc.slotsActifs[0]] = seul;
      }

      // Dernier morceau qui recoit du texte : on y ajoute le suffixe (original entre parentheses...)
      var dernier = -1;
      bloc.slots.forEach(function (sl, k) { if (sl.principal && (!bloc.slotsActifs || bloc.slotsActifs.indexOf(k) !== -1)) dernier = k; });
      if (suffixe && dernier >= 0) pieces[dernier] = pieces[dernier].replace(/\s+$/, "") + suffixe;

      var nouvelles = new Map();
      bloc.items.forEach(function (x) {
        if (x.t === "texte") nouvelles.set(x, x.frags.map(function (f) { return x.raw.slice(f.a, f.b); }));
      });
      for (var k = 0; k < bloc.slots.length; k++) {
        if (bloc.slotsActifs && bloc.slotsActifs.indexOf(k) === -1) continue;
        var sl = bloc.slots[k];
        var piece = pieces[k].replace(/\s+/g, " ");
        if (!sl.principal) {
          if (A_DES_LETTRES.test(piece)) return { ok: false, raison: "texte_sans_place" };
          continue;
        }
        var avait = sl.frags.some(function (f) { return A_DES_LETTRES.test(f.texteFlux); });
        if (avait && !A_DES_LETTRES.test(piece.replace(BALISES_RE, ""))) {
          // Le texte existait et la sortie n'en a plus : on refuse
          var seulValeur = sl.frags.some(function (f) { return f.vals.length > 0; }) && piece.trim().length > 0;
          if (!seulValeur) return { ok: false, raison: "texte_perdu" };
        }
        sl.frags.forEach(function (f) {
          var x = f.noeudItem;
          var arr = nouvelles.get(x);
          var idx = x.frags.indexOf(f);
          var brut = x.raw.slice(f.a, f.b);
          if (f === sl.principal) {
            if (!piece.trim() && !A_DES_LETTRES.test(brut)) return;
            var e = espaces(brut);
            var lead = e.debut || (/^\s/.test(piece) ? " " : "");
            var trail = e.fin || (/\s$/.test(piece) ? " " : "");
            arr[idx] = lead + piece.trim() + trail;
          } else if (A_DES_LETTRES.test(brut) || f.vals.length) {
            arr[idx] = "";
          }
        });
      }
      var modifs = [];
      var apres = "";
      bloc.items.forEach(function (x) {
        if (x.t !== "texte") return;
        var arr = nouvelles.get(x);
        var valeur = "";
        var pos = 0;
        x.frags.forEach(function (f, idx) {
          valeur += x.raw.slice(pos, f.a) + arr[idx];
          pos = f.b;
        });
        valeur += x.raw.slice(pos);
        apres += valeur;
        if (valeur !== x.raw) modifs.push({ noeud: x.noeud, valeur: valeur });
      });
      if (!valeursIdentiques(bloc.plat, apres)) return { ok: false, raison: "valeur_modifiee" };
      return { ok: true, modifs: modifs, apres: apres };
    }

    // Un morceau de bloc, pour le repli : un segment par zone de texte, sans marqueur
    function decouper(bloc) {
      var morceaux = [];
      bloc.slots.forEach(function (sl, k) {
        var avec = sl.frags.some(function (f) { return A_DES_LETTRES.test(f.texteFlux); });
        if (!avec) return;
        var flux = sl.frags.map(function (f) { return f.texteFlux; }).join("").replace(/\s+/g, " ").trim();
        var balises = flux.match(BALISES_RE) || [];
        var vals = {};
        balises.forEach(function (b) { vals[b] = bloc.valeurs[b]; });
        morceaux.push({
          conteneur: bloc.conteneur,
          items: bloc.items,
          noeuds: bloc.noeuds,
          plat: bloc.plat,
          texte: flux,
          structure: [],
          slots: bloc.slots,
          valeurs: vals,
          slotsActifs: [k],
          contenues: balises,
          parent: bloc,
        });
      });
      return morceaux;
    }

    // ------------------------------------------------------------ ecriture dans la page

    function ecrireLot(f) {
      f();
      observateurs.forEach(function (o) { o.obs.takeRecords(); });
    }

    function appliquer(bloc, sortie, suffixe) {
      var r = calculer(bloc, sortie, suffixe);
      if (!r.ok) return r;
      var ecrits = [];
      ecrireLot(function () {
        r.modifs.forEach(function (mo) {
          var rec = suivis.get(mo.noeud);
          var brut = rec && mo.noeud.nodeValue === rec.ecrit ? rec.brut : mo.noeud.nodeValue;
          var ecrit = afficheOriginal ? brut : mo.valeur;
          suivis.set(mo.noeud, { brut: brut, traduit: mo.valeur, ecrit: ecrit });
          liste.add(mo.noeud);
          if (mo.noeud.nodeValue !== ecrit) mo.noeud.nodeValue = ecrit;
          ecrits.push(mo.noeud);
        });
        if (bloc.conteneur && bloc.conteneur.nodeType === 1 && !bloc.conteneur.hasAttribute("lang") && opt.langue) {
          bloc.conteneur.setAttribute("lang", opt.langue());
          langues.add(bloc.conteneur);
        }
      });
      // Chien de garde : on relit la page, et on remet l'original si une valeur a bouge
      if (!afficheOriginal) {
        var affiche = bloc.noeuds.map(function (n) { return n.nodeValue; }).join("");
        if (!valeursIdentiques(bloc.plat, affiche)) {
          ecrireLot(function () {
            ecrits.forEach(function (n) {
              var rec = suivis.get(n);
              if (rec) {
                n.nodeValue = rec.brut;
                rec.ecrit = rec.brut;
                rec.traduit = rec.brut;
              }
            });
          });
          return { ok: false, raison: "chien_de_garde" };
        }
      }
      return { ok: true, change: r.modifs.length > 0 };
    }

    function afficherOriginal(valeur) {
      afficheOriginal = !!valeur;
      ecrireLot(function () {
        liste.forEach(function (n) {
          var rec = suivis.get(n);
          if (!rec || !n.isConnected) {
            liste.delete(n);
            return;
          }
          if (n.nodeValue !== rec.ecrit) return;
          rec.ecrit = afficheOriginal ? rec.brut : rec.traduit;
          n.nodeValue = rec.ecrit;
        });
        attributs.forEach(function (noms, el) {
          Object.keys(noms).forEach(function (nom) {
            var rec = noms[nom];
            if (lireAttribut(el, nom) !== rec.ecrit) return;
            rec.ecrit = afficheOriginal ? rec.brut : rec.traduit;
            ecrireAttribut(el, nom, rec.ecrit);
          });
        });
      });
    }

    function restaurer() {
      ecrireLot(function () {
        liste.forEach(function (n) {
          var rec = suivis.get(n);
          if (rec && n.nodeValue === rec.ecrit) n.nodeValue = rec.brut;
          suivis.delete(n);
        });
        liste.clear();
        attributs.forEach(function (noms, el) {
          Object.keys(noms).forEach(function (nom) {
            var rec = noms[nom];
            if (lireAttribut(el, nom) === rec.ecrit) ecrireAttribut(el, nom, rec.brut);
          });
        });
        attributs.clear();
        langues.forEach(function (el) { el.removeAttribute("lang"); });
        langues.clear();
      });
      afficheOriginal = false;
    }

    // ------------------------------------------------------------ attributs, titre, boutons

    function lireAttribut(el, nom) {
      if (nom === "#titre") return el.title;
      return el.getAttribute(nom);
    }

    function ecrireAttribut(el, nom, valeur) {
      if (nom === "#titre") el.title = valeur;
      else el.setAttribute(nom, valeur);
    }

    function blocAttribut(el, nom, valeur) {
      var plat = valeur;
      if (!A_DES_LETTRES.test(plat)) return null;
      var rec0 = attributs.get(el) && attributs.get(el)[nom];
      if (rec0 && plat === rec0.ecrit) return null;
      var p = P.proteger(plat);
      if (!A_DES_LETTRES.test(p.texte.replace(BALISES_RE, ""))) return null;
      return { attribut: { el: el, nom: nom }, conteneur: el, texte: p.texte, plat: plat, valeurs: p.valeurs, structure: [], noeuds: [] };
    }

    function appliquerAttribut(bloc, sortie, suffixe) {
      var res = P.restaurer(sortie, bloc.valeurs);
      if (!res.ok) return { ok: false, raison: "balise_modifiee" };
      var texte = res.texte.replace(/\s+/g, " ").trim() + (suffixe || "");
      if (!valeursIdentiques(bloc.plat, texte)) return { ok: false, raison: "valeur_modifiee" };
      var el = bloc.attribut.el;
      var nom = bloc.attribut.nom;
      ecrireLot(function () {
        var noms = attributs.get(el) || {};
        var rec = noms[nom];
        var brut = rec && lireAttribut(el, nom) === rec.ecrit ? rec.brut : lireAttribut(el, nom);
        noms[nom] = { brut: brut, traduit: texte, ecrit: afficheOriginal ? brut : texte };
        attributs.set(el, noms);
        ecrireAttribut(el, nom, noms[nom].ecrit);
      });
      return { ok: true, change: true };
    }

    function lireAttributsDe(el, blocs) {
      ATTRIBUTS_TEXTE.forEach(function (nom) {
        var v = el.getAttribute(nom);
        if (v) {
          var b = blocAttribut(el, nom, v);
          if (b) blocs.push(b);
        }
      });
      var tag = nomBalise(el);
      if (tag === "INPUT") {
        var type = (el.getAttribute("type") || "").toLowerCase();
        if (type === "button" || type === "submit" || type === "reset") {
          var val = el.getAttribute("value");
          if (val) {
            var b2 = blocAttribut(el, "value", val);
            if (b2) blocs.push(b2);
          }
        }
      }
    }

    // ------------------------------------------------------------ lecture d'un arbre

    function lireArbre(cont, ctx) {
      var run = [];
      function vider() {
        if (run.length) {
          var b = construireBloc(run, cont);
          run = [];
          if (b) {
            if (estDynamique(b.conteneur && b.conteneur.nodeType === 1 ? b.conteneur : cont)) {
              ctx.exclus.push({ raison: "dynamique", texte: b.texte });
            } else {
              ctx.blocs.push(b);
            }
          }
        }
      }
      function empiler(el) {
        run.push({ t: "ouvre", el: el });
        for (var c = el.firstChild; c; c = c.nextSibling) {
          if (c.nodeType === 3) run.push({ t: "texte", noeud: c });
          else if (c.nodeType === 1) empiler(c);
        }
        run.push({ t: "ferme", el: el });
      }
      for (var c = cont.firstChild; c; c = c.nextSibling) {
        if (c.nodeType === 3) {
          run.push({ t: "texte", noeud: c });
        } else if (c.nodeType === 1) {
          if (!c.hasAttribute("data-safinum-ignore") && !selecteurCorrespond(c, profil.ignorer)) lireAttributsDe(c, ctx.blocs);
          var tag = nomBalise(c);
          if (tag === "IFRAME" || tag === "FRAME") {
            vider();
            traiterIframe(c, ctx);
          } else if (ignore(c)) {
            vider();
          } else if (estEnLigne(c)) {
            if (!estCache(c)) empiler(c);
          } else {
            vider();
            if (estCache(c) || selecteurCorrespond(c, profil.ignorer)) continue;
            lireArbre(c, ctx);
            if (c.shadowRoot) lireArbre(c.shadowRoot, ctx);
          }
        }
      }
      vider();
    }

    function traiterIframe(cadre, ctx) {
      var doc = null;
      try {
        doc = cadre.contentDocument;
      } catch (e) {
        doc = null;
      }
      if (!doc || !doc.body) {
        // Autre origine, ou pas encore chargee
        var externe = false;
        try {
          externe = !cadre.contentDocument;
        } catch (e2) {
          externe = true;
        }
        ctx.exclus.push({ raison: externe ? "iframe_externe" : "iframe_vide", texte: cadre.getAttribute("src") || "" });
        return;
      }
      ctx.documents.push(doc);
      if (doc.title) {
        var bt = blocAttribut(doc.documentElement, "#titre", doc.title);
        if (bt) ctx.blocs.push(bt);
      }
      lireArbre(doc.body, ctx);
    }

    // Lit une partie de la page (ou toute la page) et renvoie { blocs, exclus, documents }
    function lire(depart) {
      var ctx = { blocs: [], exclus: [], documents: [] };
      var doc = (depart && depart.ownerDocument) || (depart && depart.nodeType === 9 && depart) || opt.document || document;
      var base = depart && depart.nodeType === 1 ? depart : doc.body;
      if (!depart || depart.nodeType === 9 || base === doc.body) {
        ctx.documents.push(doc);
        if (doc.title) {
          var bt = blocAttribut(doc.documentElement, "#titre", doc.title);
          if (bt) ctx.blocs.push(bt);
        }
      }
      if (base) {
        if (!estCache(base) && !estDynamique(base)) {
          if (base !== doc.body && estEnLigne(base)) {
            // On remonte jusqu'au bloc complet
            var haut = base;
            while (haut.parentElement && haut !== doc.body && enLigneBrut(haut)) haut = haut.parentElement;
            base = haut;
          }
          lireAttributsDe(base, ctx.blocs);
          lireArbre(base, ctx);
          if (base.shadowRoot) lireArbre(base.shadowRoot, ctx);
        }
      }
      return ctx;
    }

    // ------------------------------------------------------------ observation des changements

    function racineBloc(noeud) {
      var el = noeud.nodeType === 1 ? noeud : noeud.parentElement;
      while (el && el.parentElement && enLigneBrut(el)) el = el.parentElement;
      return el;
    }

    function surMutations(liste_) {
      var maintenant = Date.now();
      var comptes = new Set(); // un element compte une seule fois par lot de changements
      liste_.forEach(function (mu) {
        var cible = mu.target;
        var el = racineBloc(cible);
        if (!el) return;
        if (el.closest && el.closest("[data-safinum-ignore]")) return;
        // Compteur ou minuterie : le texte d'une feuille change plus de 3 fois en 2 secondes. On arrete de la suivre
        // pendant 10 secondes. Un changement de vue d'une application a page unique (zone avec des sous-elements)
        // n'est pas un compteur.
        var feuille = mu.type === "characterData" || (mu.type === "childList" && cible.nodeType === 1 && cible.children.length === 0);
        if (feuille && !comptes.has(el)) {
          comptes.add(el);
          var h = (historique.get(el) || []).filter(function (t) { return maintenant - t < 2000; });
          h.push(maintenant);
          historique.set(el, h);
          if (h.length > 3) {
            var avant = dynamiques.get(el);
            dynamiques.set(el, maintenant + 10000);
            if ((!avant || avant < maintenant) && opt.surDynamique) opt.surDynamique(el);
            return;
          }
        }
        enAttente.add(el);
      });
      if (!enAttente.size) return;
      clearTimeout(minuteur);
      minuteur = setTimeout(function () {
        var racines = Array.from(enAttente).filter(function (e) { return e.isConnected && !estDynamique(e); });
        enAttente.clear();
        // On garde seulement les elements qui ne sont pas dans un autre element de la liste
        racines = racines.filter(function (e) {
          return !racines.some(function (o) { return o !== e && o.contains(e); });
        });
        if (racines.length && rappel) rappel(racines);
      }, opt.delai || 200);
    }

    function observerDocument(racineObs) {
      if (observateurs.some(function (o) { return o.racine === racineObs; })) return;
      var vue = (racineObs.ownerDocument || racineObs).defaultView || (typeof window !== "undefined" ? window : null);
      var MO = (vue && vue.MutationObserver) || (typeof MutationObserver !== "undefined" ? MutationObserver : null);
      if (!MO) return;
      var obs = new MO(surMutations);
      obs.observe(racineObs, {
        childList: true,
        subtree: true,
        characterData: true,
        attributes: true,
        attributeFilter: ["hidden", "style", "class", "aria-hidden", "placeholder", "aria-label", "title", "alt", "value"],
      });
      observateurs.push({ obs: obs, racine: racineObs });
    }

    function observer(fonction, documents) {
      rappel = fonction;
      (documents || []).forEach(function (d) {
        if (d.body) observerDocument(d.body);
      });
      // Racines Shadow DOM ouvertes deja presentes
      (documents || []).forEach(function (d) {
        var tous = d.querySelectorAll ? d.querySelectorAll("*") : [];
        for (var i = 0; i < tous.length; i++) {
          if (tous[i].shadowRoot) observerDocument(tous[i].shadowRoot);
        }
      });
    }

    function arreterObservation() {
      clearTimeout(minuteur);
      enAttente.clear();
      observateurs.forEach(function (o) { o.obs.disconnect(); });
      observateurs = [];
      rappel = null;
    }

    return {
      lire: lire,
      appliquer: function (bloc, sortie, suffixe) {
        return bloc.attribut ? appliquerAttribut(bloc, sortie, suffixe) : appliquer(bloc, sortie, suffixe);
      },
      decouper: decouper,
      afficherOriginal: afficherOriginal,
      restaurer: restaurer,
      observer: observer,
      observerDocument: observerDocument,
      arreterObservation: arreterObservation,
      calculer: calculer,
      valeursIdentiques: valeursIdentiques,
      estCache: estCache,
    };
  }

  return { creer: creer };
});


/* ---- lecture_vocale.js ---- */
/*
 * lecture_vocale.js - qu'est-ce qui est lu quand l'utilisateur touche, survole ou navigue ?
 * Regle : le plus petit bloc de texte significatif. Jamais un conteneur de page.
 * Pour un champ de saisie : son ETIQUETTE, jamais sa valeur. Un champ secret n'est jamais lu (etiquette seule).
 */
(function (racine, fabrique) {
  if (typeof module === "object" && module.exports) {
    module.exports = fabrique(require("./secrets.js"));
  } else {
    racine.SafinumLecture = fabrique(racine.SafinumSecrets);
  }
})(typeof self !== "undefined" ? self : this, function (S) {
  var EN_LIGNE = { A: 1, ABBR: 1, B: 1, BDI: 1, CITE: 1, EM: 1, FONT: 1, I: 1, MARK: 1, Q: 1, S: 1, SMALL: 1, SPAN: 1, STRONG: 1, SUB: 1, SUP: 1, TIME: 1, U: 1 };
  var CHAMPS = { INPUT: 1, TEXTAREA: 1, SELECT: 1 };
  var INTERACTIFS = { BUTTON: 1, A: 1 };
  var IGNORES = { SCRIPT: 1, STYLE: 1, NOSCRIPT: 1, TEMPLATE: 1, SVG: 1, svg: 1 };

  function tag(el) {
    return (el.tagName || "").toUpperCase();
  }

  function ignore(el) {
    return !!(el.closest && el.closest("[data-safinum-ignore], [data-secret], [aria-hidden='true']"));
  }

  function propre(t) {
    return String(t || "").replace(/\s+/g, " ").trim();
  }

  // Etiquette d'un champ : aria-label, etiquette associee, title. Jamais sa valeur.
  function etiquette(champ) {
    var t = champ.getAttribute("aria-label") || "";
    if (!t && champ.labels && champ.labels.length) {
      // Le texte de l'etiquette sans le contenu des champs qu'elle contient
      var clone = champ.labels[0].cloneNode(true);
      Array.prototype.forEach.call(clone.querySelectorAll("input, select, textarea"), function (x) { x.remove(); });
      t = clone.textContent;
    }
    if (!t) t = champ.getAttribute("title") || champ.getAttribute("placeholder") || "";
    return propre(t);
  }

  // Un bloc de texte : un element sans enfant de niveau bloc (donc pas un conteneur de page)
  function aEnfantBloc(el) {
    for (var c = el.firstElementChild; c; c = c.nextElementSibling) {
      var t = tag(c);
      if (IGNORES[t]) continue;
      if (!EN_LIGNE[t] || aEnfantBloc(c)) return true;
    }
    return false;
  }

  function aDuTexteDirect(el) {
    for (var c = el.firstChild; c; c = c.nextSibling) {
      if (c.nodeType === 3 && /\S/.test(c.nodeValue)) return true;
    }
    return false;
  }

  // Remonte jusqu'au plus petit bloc de texte qui contient l'element
  function blocDe(el) {
    var cur = el;
    while (cur && cur.nodeType === 1) {
      var t = tag(cur);
      if (EN_LIGNE[t] && cur.parentElement && !INTERACTIFS[t]) {
        cur = cur.parentElement;
        continue;
      }
      break;
    }
    return cur && cur.nodeType === 1 ? cur : null;
  }

  // Texte a lire pour un element, ou "" si c'est un conteneur ou s'il ne faut rien lire
  function texteDe(el) {
    if (!el || el.nodeType !== 1 || ignore(el)) return "";
    var t = tag(el);
    if (CHAMPS[t]) return etiquette(el);
    if (t === "BODY" || t === "HTML" || t === "MAIN" || t === "NAV" || t === "SECTION" || t === "ARTICLE" || t === "HEADER" || t === "FOOTER" || t === "FORM") return "";
    var bloc = blocDe(el);
    if (!bloc || ignore(bloc)) return "";
    var tb = tag(bloc);
    if (CHAMPS[tb]) return etiquette(bloc);
    if (INTERACTIFS[tb] || bloc.getAttribute("role") === "button") {
      return propre(bloc.getAttribute("aria-label") || bloc.textContent);
    }
    if (aEnfantBloc(bloc)) return ""; // conteneur : on ne lit rien
    return propre(bloc.textContent);
  }

  // Le noeud de texte sous un point de l'ecran (appui long)
  function elementSousLePoint(doc, x, y) {
    var el = doc.elementFromPoint ? doc.elementFromPoint(x, y) : null;
    if (!el) return null;
    // Shadow DOM ouvert : on descend jusqu'au vrai element
    while (el && el.shadowRoot && el.shadowRoot.elementFromPoint) {
      var interieur = el.shadowRoot.elementFromPoint(x, y);
      if (!interieur || interieur === el) break;
      el = interieur;
    }
    return el;
  }

  // Tous les blocs lisibles de la page, dans l'ordre visuel (haut puis gauche)
  function blocsLisibles(doc, seulementVisibles, sansMesure) {
    var liste = [];
    function parcourir(noeud) {
      var enfants = noeud.children || [];
      for (var i = 0; i < enfants.length; i++) {
        var el = enfants[i];
        if (IGNORES[tag(el)] || el.id === "safinum-hote" || ignore(el)) continue;
        if (el.shadowRoot) parcourir(el.shadowRoot);
        if (tag(el) === "IFRAME") {
          try {
            if (el.contentDocument && el.contentDocument.body) parcourir(el.contentDocument.body);
          } catch (e) {
            // autre origine : rien a lire
          }
          continue;
        }
        var t = tag(el);
        var estChamp = !!CHAMPS[t] && el.type !== "hidden";
        var estBloc = !EN_LIGNE[t] && !aEnfantBloc(el) && (aDuTexteDirect(el) || el.textContent.trim() !== "");
        if (estChamp || estBloc || INTERACTIFS[t]) {
          if (!EN_LIGNE[t] || INTERACTIFS[t]) {
            var texte = texteDe(el);
            if (texte) liste.push({ el: el, texte: texte });
          }
          if (estBloc || estChamp) continue;
        }
        parcourir(el);
      }
    }
    parcourir(doc.body || doc);
    if (sansMesure) return liste; // environnement sans mise en page (tests)
    liste = liste.filter(function (b) {
      try {
        var r = b.el.getBoundingClientRect();
        b.haut = r.top;
        b.gauche = r.left;
        if (r.width === 0 && r.height === 0) return false;
        if (seulementVisibles) {
          var vue = b.el.ownerDocument.defaultView;
          return r.bottom >= 0 && r.top <= vue.innerHeight;
        }
        return true;
      } catch (e) {
        return true;
      }
    });
    liste.sort(function (a, b) {
      return Math.abs(a.haut - b.haut) < 4 ? a.gauche - b.gauche : a.haut - b.haut;
    });
    return liste;
  }

  return {
    texteDe: texteDe,
    etiquette: etiquette,
    blocDe: blocDe,
    elementSousLePoint: elementSousLePoint,
    blocsLisibles: blocsLisibles,
    aEnfantBloc: aEnfantBloc,
  };
});


/* ---- voix.js ---- */
/*
 * voix.js - moteur de voix de SAFINUM.
 * Chaine de voix par langue (donnee par le serveur, fichier YAML de la langue) :
 *   1. voix MMS du serveur, seulement si activee ET si l'utilisateur l'a choisie ;
 *   2. sinon voix du navigateur de repli (anglais pour le Pidgin, francais pour le Fulfulde) ;
 *   3. sinon texte seulement.
 * Les montants sont convertis en mots, lus lentement puis repetes une fois, toujours en local.
 * Aucun chiffre, montant, date ou numero n'est envoye au serveur de voix.
 */
var SafinumVoix = (function () {
  var etat = {
    vitesse: 0.85,
    volume: 1,
    muet: false,
    desactive: false, // lecteur d'ecran deja present : SAFINUM se tait
    annule: false,
    pause: false,
    audio: null,
    serveur: false,
    dernier: null,
    langues: { pcm: { repli: "en" }, fub: { repli: "fr" } },
    annonce: {}, // langues pour lesquelles "voix de remplacement" a deja ete dit
    surRemplacement: null,
    numero: 0, // change a chaque nouvelle lecture : une ancienne lecture s'arrete toute seule
  };
  var REPETE = { fr: "Je répète : ", en: "I repeat: " };
  var REMPLACEMENT = { fr: "Voix de remplacement.", en: "Replacement voice." };
  var EXPERIMENTAL = { fr: "Langue expérimentale.", en: "Experimental language." };

  function synthese() {
    return typeof speechSynthesis !== "undefined" ? speechSynthesis : null;
  }

  // Langue de la voix du navigateur pour une langue cible : la langue elle-meme si c'est fr ou en, sinon le repli du serveur
  function langueVoix(cible) {
    if (cible === "fr" || cible === "en") return cible;
    var cfg = etat.langues[cible];
    return cfg && cfg.repli ? cfg.repli : "fr";
  }

  function parlerNavigateur(texte, lv, facteur) {
    return new Promise(function (fini) {
      var s = synthese();
      if (!s || !texte.trim()) return fini();
      var u = new SpeechSynthesisUtterance(texte);
      u.lang = lv === "en" ? "en-GB" : "fr-FR";
      u.rate = Math.max(0.4, Math.min(1.4, etat.vitesse * (facteur || 1)));
      u.volume = etat.volume;
      u.onend = fini;
      u.onerror = fini;
      s.speak(u);
    });
  }

  // Un morceau peut partir au serveur de voix seulement s'il ne contient aucune valeur
  function sansValeur(texte) {
    if (/\d/.test(texte)) return false;
    return SafinumProtection.trouver(texte).length === 0;
  }

  function jouerServeur(texte, langue) {
    return new Promise(function (fini) {
      try {
        chrome.runtime.sendMessage({ type: "tts", langue: langue, texte: texte }, function (r) {
          if (!r || !r.audio) return fini(false);
          var a = new Audio(r.audio);
          a.volume = etat.volume;
          a.playbackRate = Math.max(0.5, Math.min(1.3, etat.vitesse));
          etat.audio = a;
          a.onended = function () {
            fini(true);
          };
          a.onerror = function () {
            fini(false);
          };
          a.play().catch(function () {
            fini(false);
          });
        });
      } catch (e) {
        fini(false);
      }
    });
  }

  // Coupe le texte en morceaux : texte normal et montants (convertis en mots)
  function decouper(texte, lv) {
    var re = new RegExp(SafinumProtection.MONTANT_RE.source, "giu");
    var morceaux = [];
    var curseur = 0;
    var m;
    while ((m = re.exec(texte)) !== null) {
      if (m.index > curseur) morceaux.push({ valeur: false, texte: texte.slice(curseur, m.index) });
      morceaux.push({ valeur: true, texte: SafinumNombres.montantEnMots(m[0], lv) });
      curseur = m.index + m[0].length;
    }
    if (curseur < texte.length) morceaux.push({ valeur: false, texte: texte.slice(curseur) });
    return morceaux;
  }

  // Phrases d'un long texte (plus de 300 caracteres) : lues une par une, interruptibles
  function phrases(texte, maxi) {
    if (texte.length <= (maxi || 300)) return [texte];
    return texte.split(/(?<=[.!?])\s+/).filter(function (p) { return p.trim(); });
  }

  function arreter() {
    etat.annule = true;
    etat.pause = false;
    etat.numero++;
    var s = synthese();
    if (s) s.cancel();
    if (etat.audio) {
      etat.audio.pause();
      etat.audio = null;
    }
  }

  async function attendreFinPause(mon) {
    while (etat.pause && mon === etat.numero) await new Promise(function (r) { setTimeout(r, 150); });
  }

  async function lire(texte, cible, options) {
    arreter();
    etat.annule = false;
    if (etat.muet || etat.desactive || !texte) return;
    var mon = etat.numero;
    var opt = options || {};
    etat.dernier = { texte: texte, cible: cible };
    var lv = langueVoix(cible);
    var cfg = etat.langues[cible];
    // Voix de remplacement : on le dit une seule fois par langue (a l'ecran et a la voix)
    if ((cible === "pcm" || cible === "fub") && !etat.annonce[cible] && !(etat.serveur && cfg && cfg.serveurOk)) {
      etat.annonce[cible] = true;
      if (etat.surRemplacement) etat.surRemplacement(cible, lv);
      await parlerNavigateur(REMPLACEMENT[lv] + (cible === "fub" ? " " + EXPERIMENTAL[lv] : ""), lv, 1);
      if (mon !== etat.numero) return;
    }
    var montants = [];
    var liste = opt.phrases === false ? [texte] : phrases(texte);
    for (var p = 0; p < liste.length; p++) {
      var morceaux = decouper(liste[p], lv);
      for (var i = 0; i < morceaux.length; i++) {
        if (mon !== etat.numero) return;
        await attendreFinPause(mon);
        var m = morceaux[i];
        if (m.valeur) {
          montants.push(m.texte);
          await parlerNavigateur(m.texte, lv, 0.85);
        } else if (etat.serveur && (cible === "pcm" || cible === "fub") && sansValeur(m.texte)) {
          var ok = await jouerServeur(m.texte, cible);
          if (!ok) await parlerNavigateur(m.texte, lv, 1);
        } else {
          await parlerNavigateur(m.texte, lv, 1);
        }
      }
    }
    if (montants.length && mon === etat.numero) {
      await parlerNavigateur(REPETE[lv] + montants.join(", "), lv, 0.85);
    }
  }

  function parler(texte, cible) {
    // Petit message de l'interface (nom d'une langue, bouton), sans conversion des montants
    arreter();
    etat.annule = false;
    if (etat.muet || etat.desactive) return Promise.resolve();
    return parlerNavigateur(texte, langueVoix(cible), 1);
  }

  return {
    lire: lire,
    parler: parler,
    arreter: arreter,
    phrases: phrases,
    sansValeur: sansValeur,
    langueVoix: langueVoix,
    configurerLangues: function (liste) {
      (liste || []).forEach(function (l) {
        var v = l.voix || {};
        etat.langues[l.code] = { repli: v.repli || "fr", serveurOk: false };
      });
    },
    surRemplacement: function (f) {
      etat.surRemplacement = f;
    },
    repeter: function () {
      if (etat.dernier) lire(etat.dernier.texte, etat.dernier.cible);
    },
    pause: function () {
      etat.pause = true;
      var s = synthese();
      if (s) s.pause();
      if (etat.audio) etat.audio.pause();
    },
    reprendre: function () {
      etat.pause = false;
      var s = synthese();
      if (s) s.resume();
      if (etat.audio) etat.audio.play();
    },
    plusLent: function () {
      etat.vitesse = Math.max(0.5, etat.vitesse - 0.15);
    },
    plusRapide: function () {
      etat.vitesse = Math.min(1.3, etat.vitesse + 0.15);
    },
    plusFort: function () {
      etat.volume = Math.min(1, etat.volume + 0.25);
    },
    moinsFort: function () {
      etat.volume = Math.max(0.25, etat.volume - 0.25);
    },
    muet: function (v) {
      etat.muet = !!v;
      if (v) arreter();
    },
    desactiver: function (v) {
      etat.desactive = !!v;
      if (v) arreter();
    },
    voixServeur: function (v) {
      etat.serveur = !!v;
      Object.keys(etat.langues).forEach(function (k) { etat.langues[k].serveurOk = !!v; });
    },
    reglages: function () {
      return { vitesse: etat.vitesse, volume: etat.volume };
    },
    appliquerReglages: function (r) {
      if (r && r.vitesse) etat.vitesse = r.vitesse;
      if (r && r.volume) etat.volume = r.volume;
    },
  };
})();


/* ---- content.js ---- */
/*
 * content.js - SAFINUM dans la page (F1, F4, F5, F6, F7, F9, F10, F11).
 * Lit le texte de la page (DOM), protege les valeurs, demande la traduction au serveur,
 * remplace le texte affiche et suit les changements de page.
 * Il ne clique jamais, ne lit jamais un champ de saisie et ne prend aucune capture d'ecran.
 */
(function () {
  if (window.__safinumCharge) return;
  window.__safinumCharge = true;

  // Numero de version affiche dans le panneau : permet de verifier que la derniere version est bien chargee
  var VERSION = "1.3.0 - 14/11/2026 nuit";

  var P = SafinumProtection;
  var V = SafinumVoix;

  // Mettre true si la voix MMS du serveur est activee (SAFINUM_TTS=1) et que le test d'ecoute est bon
  var VOIX_SERVEUR = false;

  var IMPORTANTS = { erreur: 1, alerte: 1, transfert_reussi: 1, confirmation: 1, attente: 1 };

  var LIBELLES = {
    consentement:
      "SAFINUM lit le texte de cette page pour le traduire et le lire à voix haute. Les montants, les frais et les noms restent dans votre navigateur. Aucun code secret, mot de passe ou capture d'écran n'est lu. SAFINUM ne clique jamais à votre place.",
    accepter: "J'accepte",
    fermer: "Fermer",
    langue: "Choisissez votre langue",
    ecouter: "Je préfère écouter",
    grand: "Texte plus grand",
    sansSon: "Sans le son",
    contraste: "Contraste fort",
    original: "Voir l'original",
    traduction: "Voir la traduction",
    arreter: "Arrêter",
    repeter: "Répéter",
    pluslent: "Plus lent",
    plusfort: "Plus fort",
    plusrapide: "Plus rapide",
    sourd: "Sourd ou malentendant",
    lecteurEcran: "J'utilise un lecteur d'écran",
    masquer: "Masquer les montants",
    zoomPage: "Zoom de la page",
    lireEcran: "Lire cet écran",
    suivant: "Suivant",
    precedent: "Précédent",
    pause: "Pause",
    reprendre: "Reprendre",
    stopVoix: "Arrêt de la voix",
    recap: "Récapitulatif avant confirmation",
    lireRecap: "Lire le récapitulatif",
    montant: "Montant",
    frais: "Frais",
    total: "Total",
    benef: "Bénéficiaire",
    avertissement: "Avertissement",
    jamaisConfirme: "SAFINUM ne confirme jamais à votre place.",
    signaler: "Signaler une erreur de langue",
    exporter: "Exporter en CSV",
    enregistrer: "Enregistrer",
    correction: "Correction proposée",
    avertPublic: "Attention : la voix peut être entendue par les personnes autour de vous.",
    voixRemplacement: "Voix de remplacement utilisée.",
    retirer: "Retirer SAFINUM de la page",
    nonCertifie: "Les textes de SAFINUM sont traduits automatiquement. Ils ne sont pas certifiés.",
  };
  var A_TRADUIRE = ["langue", "ecouter", "grand", "sansSon", "contraste", "original", "traduction", "arreter", "repeter", "pluslent", "plusfort", "plusrapide", "sourd", "lecteurEcran", "masquer", "zoomPage", "lireEcran", "suivant", "precedent", "pause", "reprendre", "stopVoix", "recap", "lireRecap", "montant", "frais", "total", "benef", "avertissement", "jamaisConfirme", "signaler", "exporter", "enregistrer", "correction", "avertPublic", "voixRemplacement"];

  var LANGUES = [
    { code: "pcm", nom: "Pidgin", icone: "\uD83D\uDCAC", voix: "Pidgin" },
    { code: "fub", nom: "Fulfulde", icone: "\uD83D\uDDE3", voix: "Fulfulde", experimental: true },
  ];

  var etat = {
    visible: false,
    consentement: false,
    actif: false,
    langue: null,
    modes: { ecouter: false, grand: 0, sansSon: false, contraste: false, sourd: false, lecteurEcran: false, masquer: false, zoomPage: false },
    langues: null,
    recap: null,
    dernierBloc: null,
    signal: false,
    afficherOriginal: false,
    statut: "",
    degrade: false,
    alerte: null,
    libelles: {},
    enCours: false,
    reessayer: false,
    racinesEnAttente: [],
    raisonDegrade: "",
    premierePasse: true,
  };
  var lecteur = null;
  var lisibles = new WeakMap(); // element -> [{ trad, orig, brut, tradBrut }] : ce qui est lu a voix haute
  var minuteur = null;
  var hote = null;
  var racine = null;
  var profil = { ignorer: [], secrets: [], forcer: [], motifs: [] };
  var cacheLocal = {};
  var cacheModifie = false;
  var stats = nouvellesStats();
  var generation = 0; // change a chaque activation : une reponse tardive d'une ancienne activation est ignoree
  var exclusVus = {};
  var cadresSuivis = new WeakSet();

  // Raisons pour lesquelles un bloc reste en original, dites en une phrase
  var RAISONS = {
    confiance_faible: "traduction incertaine",
    valeur_modifiee: "une valeur aurait changé",
    serveur_injoignable: "serveur injoignable",
    cle_absente: "clé API absente",
    cle_invalide: "clé API refusée",
    quota_epuise: "quota épuisé",
    delai_depasse: "délai dépassé",
    fournisseur_surcharge: "fournisseur surchargé",
    reponse_invalide: "réponse illisible",
    moteur_indisponible: "moteur indisponible",
    non_traite: "bloc lu mais non envoyé",
    iframe_externe: "cadre d'une autre origine",
    iframe_vide: "cadre vide",
    dynamique: "texte qui change sans cesse",
    langue_non_geree: "autre langue",
    valeur_non_protegee: "valeur non protégée",
    marqueurs_modifies: "mise en forme non conservée",
    texte_sans_place: "mise en forme non conservée",
    texte_perdu: "texte perdu par la traduction",
    html_inattendu: "mise en forme non conservée",
  };
  var PHRASES_DEGRADE = { fournisseur_surcharge: "Fournisseur surchargé",  serveur_injoignable: "Serveur injoignable", cle_absente: "Clé API absente", cle_invalide: "Clé API refusée", quota_epuise: "Quota épuisé", delai_depasse: "Délai dépassé" };
  // Si l'une de ces raisons revient, on retente la traduction zone par zone
  var REPLI = { marqueurs_modifies: 1, texte_sans_place: 1, texte_perdu: 1, html_inattendu: 1 };

  function nouvellesStats() {
    return { lusBruts: 0, traduits: 0, sansBesoin: 0, originaux: {}, gardeFou: 0 };
  }

  function noter(bloc, issue, raison) {
    var cible = bloc.parent || bloc;
    if (bloc.parent) {
      cible.restePieces = (cible.restePieces || 1) - 1;
      if (issue === "traduit") cible.pieceOk = true;
      if (cible.restePieces > 0) return;
      issue = cible.pieceOk ? "traduit" : issue;
    }
    if (issue === "traduit") stats.traduits++;
    else if (issue === "sans_besoin") stats.sansBesoin++;
    else stats.originaux[raison || "confiance_faible"] = (stats.originaux[raison || "confiance_faible"] || 0) + 1;
  }

  function nbOriginaux() {
    var n = 0;
    Object.keys(stats.originaux).forEach(function (k) { n += stats.originaux[k]; });
    return n;
  }

  function totalLus() {
    return stats.traduits + stats.sansBesoin + nbOriginaux();
  }

  function resumeCouverture() {
    var detail = Object.keys(stats.originaux).map(function (k) { return stats.originaux[k] + " " + (RAISONS[k] || k); });
    return (
      totalLus() + " blocs lus, " + stats.traduits + " traduits" +
      (stats.sansBesoin ? ", " + stats.sansBesoin + " sans besoin" : "") +
      (nbOriginaux() ? ", " + nbOriginaux() + " en original (" + detail.join(", ") + ")" : "") + "."
    );
  }

  function publierEtat(fini) {
    if (!hote) return;
    hote.setAttribute("data-safinum-stats", JSON.stringify({ lus: Math.max(stats.lusBruts, totalLus()), nonTraites: Math.max(0, stats.lusBruts - totalLus()), traduits: stats.traduits, sansBesoin: stats.sansBesoin, originaux: stats.originaux, gardeFou: stats.gardeFou }));
    hote.setAttribute("data-safinum-fini", fini ? "1" : "0");
    hote.setAttribute("data-safinum-actif", etat.actif ? etat.langue : "");
  }

  // ---------------------------------------------------------------- cache persistant (texte SANS valeurs seulement)

  function cleCache(texte) {
    return etat.langue + "|" + texte.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
  }

  function chargerCache() {
    return chrome.storage.local.get("safinum_cache").then(function (r) {
      cacheLocal = r.safinum_cache || {};
    }).catch(function () {});
  }

  function enregistrerCache() {
    if (!cacheModifie) return;
    cacheModifie = false;
    var cles = Object.keys(cacheLocal);
    if (cles.length > 2000) cles.slice(0, cles.length - 2000).forEach(function (k) { delete cacheLocal[k]; });
    chrome.storage.local.set({ safinum_cache: cacheLocal }).catch(function () {});
  }

  function retenir(bloc, r) {
    // On ne garde que ce qui est sur et sans valeur : le texte envoye ne contient que des balises
    if ((r.origine !== "moteur" && r.origine !== "cache") || r.confiance === "faible") return;
    cacheLocal[cleCache(bloc.texte)] = { texte_traduit: r.texte_traduit, origine: "cache", confiance: r.confiance, type: r.type, afficher_original: r.afficher_original, raison: null };
    cacheModifie = true;
    clearTimeout(retenir.t);
    retenir.t = setTimeout(enregistrerCache, 2000);
  }

  // ---------------------------------------------------------------- decision d'affichage (F6)

  function texteSimple(bloc, sortie) {
    var t = sortie.replace(/<\s*\/?\s*s\s*\d+\s*>/gi, "");
    t = P.canoniser(t);
    Object.keys(bloc.valeurs).forEach(function (b) { t = t.split(b).join(bloc.valeurs[b]); });
    return t.replace(/\s+/g, " ").trim();
  }

  function memeTexte(a, b) {
    function norm(t) { return t.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/\s+/g, " ").trim(); }
    return norm(a) === norm(b);
  }

  function montrerAlerte(bloc, orig, sortie, incertain, notifier) {
    // Le bandeau rouge est reserve aux messages courts. Un long texte (avis juridique, conditions) reste affiche dans la page,
    // avec son original, mais ne recouvre pas l'ecran.
    if (orig.length > 400) return;
    var trad = sortie ? texteSimple(bloc, sortie) : null;
    etat.alerte = { original: orig, traduction: trad, mention: incertain };
    if (notifier) lireImportant({ traduction: trad, original: orig });
  }

  // Traite la reponse du serveur pour un bloc. Retourne "repli" si le bloc doit etre retente zone par zone.
  function traiterReponse(bloc, r, notifier) {
    var orig = bloc.plat.replace(/\s+/g, " ").trim();
    if (!r) {
      noter(bloc, "original", "reponse_invalide");
      return;
    }
    if (r.origine === "original") {
      if (REPLI[r.raison] && bloc.structure.length && !bloc.parent) return "repli";
      if (r.raison === "sans_lettres" || r.raison === "vide" || r.raison === "deja_langue_cible") {
        noter(bloc, "sans_besoin");
        return;
      }
      if (r.afficher_original) montrerAlerte(bloc, orig, null, true, notifier);
      noter(bloc, "original", r.raison || "confiance_faible");
      return;
    }
    var important = r.afficher_original || r.type === "erreur" || r.type === "alerte";
    var incertain = r.confiance === "faible";
    // Doute sur la traduction : on la montre quand meme, avec l'original entre parentheses et la mention d'incertitude.
    // Seule exception : un sens en danger (negation, "jamais", succes ou echec perdu) -> l'original d'abord, sans la traduction.
    var sensEnDanger = /negation_perdue|jamais_perdu|statut_inverse/.test(r.raison || "");
    var incertainAvecTrad = incertain && !sensEnDanger;
    if (incertainAvecTrad) incertain = false;
    var sortie = r.texte_traduit;
    var suffixe = "";
    if (incertain) {
      if (bloc.attribut) {
        noter(bloc, "original", "confiance_faible");
        return;
      }
      sortie = bloc.texte;
      suffixe = " [Traduction incertaine]";
    } else if (important) {
      suffixe = " (Original : " + orig + ")";
    } else if (r.confiance === "moyenne" || incertainAvecTrad) {
      suffixe = " (" + orig + ")";
    }
    // Traduction identique a l'original (terme garde tel quel) : inutile de le repeter entre parentheses
    if (!incertain && suffixe && !bloc.attribut && memeTexte(texteSimple(bloc, sortie), orig)) suffixe = "";
    // Pour ne pas deformer la mise en page (tableaux, menus, boutons) :
    // - un bloc qui n'est presque que des valeurs (ex : "10 000 FCFA le 12/11/2026") n'a pas besoin de l'original repete ;
    // - la mention d'incertitude n'est pas ajoutee aux textes courts : le panneau la dit une fois pour toute la page.
    var motsLibres = bloc.texte.replace(/\[[A-Z]+_\d+\]|<\/?s\d+>/g, " ").split(/[^\p{L}]+/u).filter(function (w) { return w.length > 2; }).length;
    if (suffixe && !important && !incertain && !bloc.attribut && motsLibres <= 1) suffixe = "";
    var textCourt = orig.length <= 40;
    // Elements d'interface (menus, liens, boutons, titres, cellules, libelles) : l'original entre parentheses casse
    // les boites de taille fixe. On garde la traduction seule ; l'original reste en infobulle et la voix le lit.
    var el = bloc.conteneur;
    var interfaceCourte = el && !important && suffixe && (bloc.attribut || (orig.length <= 35 && el.tagName !== "P") ||
      ((orig.length <= 120 && (/^(A|BUTTON|TH|TD|LABEL|LI|H[1-6]|SUMMARY|OPTION|DT|DD|CAPTION|LEGEND)$/.test(el.tagName) || (el.closest && el.closest("nav,header,footer,button,a,th,td,label,[role=menu],[role=tab],[role=button]")))) ));
    if (interfaceCourte) {
      suffixe = "";
      if (!bloc.attribut && !el.getAttribute("title")) { el.setAttribute("title", orig); el.setAttribute("data-safinum-titre", "1"); }
    }
    if (incertainAvecTrad && suffixe && (important || !textCourt)) suffixe += r.statut_langue === "experimental" ? " [Traduction expérimentale, non vérifiée]" : " [Traduction incertaine]";
    var res = lecteur.appliquer(bloc, sortie, suffixe);
    if (!res.ok) {
      if (REPLI[res.raison] && bloc.structure.length && !bloc.parent) return "repli";
      if (res.raison === "chien_de_garde") stats.gardeFou++;
      var valeur = res.raison === "valeur_modifiee" || res.raison === "chien_de_garde" || res.raison === "balise_modifiee";
      noter(bloc, "original", valeur ? "valeur_modifiee" : res.raison);
      if (important) montrerAlerte(bloc, orig, null, true, notifier);
      return;
    }
    if (important) montrerAlerte(bloc, orig, incertain ? null : sortie, incertain, notifier);
    else if (notifier && r.type && IMPORTANTS[r.type] && !incertain) lireImportant({ traduction: texteSimple(bloc, sortie), original: orig });
    if (!incertain && bloc.conteneur && !bloc.attribut) {
      var entree = { trad: texteSimple(bloc, sortie), orig: orig, brut: bloc.texte, tradBrut: sortie };
      var liste = lisibles.get(bloc.conteneur) || [];
      liste.push(entree);
      lisibles.set(bloc.conteneur, liste);
      if (r.type === "confirmation") {
        etat.recap = construireRecap(bloc, orig);
        etat.dernierBloc = entree;
      }
    }
    noter(bloc, incertain ? "original" : "traduit", "confiance_faible");
    retenir(bloc, r);
  }

  function lireImportant(d) {
    if (!etat.modes.ecouter || etat.modes.sansSon) return;
    // Langue experimentale : on lit l'original, dans sa langue
    if (langueExperimentale()) V.lire(d.original, langueDuTexte(d.original));
    else V.lire(d.traduction || d.original, d.traduction ? etat.langue : "fr");
  }

  // ---------------------------------------------------------------- echanges avec le serveur

  function demander(langue, segments) {
    return new Promise(function (fini) {
      try {
        chrome.runtime.sendMessage({ type: "traduire", langue: langue, segments: segments }, function (r) {
          fini(r && !chrome.runtime.lastError ? r : { erreur: "serveur_injoignable" });
        });
      } catch (e) {
        fini({ erreur: "serveur_injoignable" });
      }
    });
  }

  function roleDe(bloc) {
    if (bloc.attribut) {
      var n = bloc.attribut.nom;
      return n === "placeholder" ? "placeholder" : n === "alt" ? "alt" : n === "value" ? "bouton" : n === "#titre" ? "titre" : "libelle";
    }
    var tag = bloc.conteneur && bloc.conteneur.tagName ? bloc.conteneur.tagName : "";
    if (/^H[1-6]$/.test(tag)) return "titre";
    if (tag === "BUTTON" || tag === "A") return "bouton";
    if (tag === "LABEL") return "libelle";
    return bloc.texte.length > 40 ? "message" : "libelle";
  }

  function estVisible(bloc) {
    try {
      var el = bloc.conteneur;
      if (!el || !el.getBoundingClientRect) return true;
      var r = el.getBoundingClientRect();
      var vue = (el.ownerDocument && el.ownerDocument.defaultView) || window;
      return r.bottom >= 0 && r.top <= vue.innerHeight;
    } catch (e) {
      return true;
    }
  }

  async function envoyer(lot, notifier, gen) {
    var segs = lot.map(function (b, i) { return { id: String(i), texte: b.texte, role: roleDe(b) }; });
    var rep = await demander(etat.langue, segs);
    if (gen !== generation || !etat.actif) return;
    if (rep.erreur || !rep.segments) {
      // Mode degrade : l'original reste affiche et lisible
      etat.degrade = true;
      etat.raisonDegrade = PHRASES_DEGRADE[rep.erreur] || "Serveur injoignable";
      lot.forEach(function (b) { noter(b, "original", "serveur_injoignable"); });
      return;
    }
    if (rep.moteur && !rep.moteur.disponible && rep.moteur.phrase) {
      etat.degrade = true;
      etat.raisonDegrade = rep.moteur.phrase;
    }
    var parId = {};
    rep.segments.forEach(function (s) { parId[s.id] = s; });
    var aReprendre = [];
    lot.forEach(function (b, i) {
      if (traiterReponse(b, parId[String(i)], notifier) === "repli") aReprendre.push(b);
    });
    if (aReprendre.length) {
      var morceaux = [];
      aReprendre.forEach(function (b) {
        var m = lecteur.decouper(b);
        if (!m.length) {
          noter(b, "original", "marqueurs_modifies");
          return;
        }
        b.restePieces = m.length;
        m.forEach(function (x) { x.parent = b; });
        morceaux = morceaux.concat(m);
      });
      if (morceaux.length) await traduireBlocs(morceaux, notifier, true);
    }
    // Progression : la premiere traduction peut prendre une dizaine de secondes, on le dit
    if (lecteurActifPourProgression()) etat.statut = "Traduction en cours : " + Math.min(totalLus(), stats.lusBruts) + " sur " + stats.lusBruts + " blocs...";
    publierEtat(false);
    rendre();
  }

  function lecteurActifPourProgression() {
    return etat.actif && etat.enCours;
  }

  // Affichage progressif : un premier petit lot avec ce qui est visible, puis des lots plus grands, 2 requetes a la fois
  async function traduireBlocs(blocs, notifier, repli) {
    var gen = generation;
    var restants = [];
    blocs.forEach(function (b) {
      var trouve = cacheLocal[cleCache(b.texte)];
      if (trouve) traiterReponse(b, trouve, notifier);
      else restants.push(b);
    });
    restants.sort(function (a, b) { return (estVisible(b) ? 1 : 0) - (estVisible(a) ? 1 : 0); });
    var lots = [];
    var taille = repli ? 40 : 12;
    var debut = 0;
    while (debut < restants.length) {
      lots.push(restants.slice(debut, debut + taille));
      debut += taille;
      taille = 40;
    }
    async function travailleur() {
      while (lots.length && generation === gen && etat.actif) {
        await envoyer(lots.shift(), notifier, gen);
      }
    }
    await Promise.all([travailleur(), travailleur()]);
  }

  // Un texte qui change sans cesse (compteur, minuterie) : on ne le retraduit pas, et on le dit dans la couverture
  function signalerDynamique(element) {
    var cle = "dynamique|" + (element.textContent || "").slice(0, 20);
    if (exclusVus[cle]) return;
    exclusVus[cle] = true;
    noter({ texte: cle }, "original", "dynamique");
    publierEtat(true);
  }

  function lireEtNoter(cible) {
    var lu = lecteur.lire(cible || undefined);
    stats.lusBruts += lu.blocs.length;
    lu.exclus.forEach(function (x) {
      var k = x.raison + "|" + x.texte;
      if (exclusVus[k]) return;
      exclusVus[k] = true;
      stats.lusBruts++;
      noter({ texte: x.texte }, "original", x.raison);
    });
    lecteur.observer(surChangement, lu.documents);
    // Un cadre qui se charge plus tard : on relit la page quand il est pret
    lu.documents.forEach(function (d) {
      var cadres = d.querySelectorAll ? d.querySelectorAll("iframe") : [];
      for (var i = 0; i < cadres.length; i++) {
        if (cadresSuivis.has(cadres[i])) continue;
        cadresSuivis.add(cadres[i]);
        cadres[i].addEventListener("load", function () {
          Object.keys(exclusVus).forEach(function (k) { if (k.indexOf("iframe_vide") === 0) delete exclusVus[k]; });
          traduirePage(null);
        });
      }
    });
    return lu.blocs;
  }

  async function traduirePage(racines) {
    if (!etat.actif) return;
    if (etat.enCours) {
      etat.reessayer = true;
      etat.racinesEnAttente = etat.racinesEnAttente.concat(racines && racines.length ? racines : [null]);
      return;
    }
    etat.enCours = true;
    try {
      do {
        etat.reessayer = false;
        var cibles = racines && racines.length ? racines : [null];
        var blocs = [];
        cibles.forEach(function (c) { blocs = blocs.concat(lireEtNoter(c)); });
        if (blocs.length) {
          etat.statut = "Traduction en cours...";
          publierEtat(false);
          rendre();
          await traduireBlocs(blocs, !etat.premierePasse, false);
        }
        etat.premierePasse = false;
        racines = etat.racinesEnAttente;
        etat.racinesEnAttente = [];
      } while (etat.reessayer && etat.actif);
    } finally {
      etat.enCours = false;
    }
    if (!etat.actif) return;
    // Aucun bloc ne doit disparaitre en silence : un bloc lu mais ni traduit ni classe est compte comme "non traite"
    var reste = stats.lusBruts - totalLus();
    if (reste > 0) stats.originaux.non_traite = (stats.originaux.non_traite || 0) + reste;
    var base = etat.degrade ? "Original affiché : " + etat.raisonDegrade + "." : etat.langue === "fub" ? "Fulfulde : expérimental. L'original reste visible." : "Pidgin actif.";
    etat.statut = base + " " + resumeCouverture();
    publierEtat(true);
    rendre();
  }

  // ---------------------------------------------------------------- activation et arret

  function surChangement(racines) {
    if (!etat.actif) return;
    traduirePage(racines);
  }

  function profilDuSite() {
    return new Promise(function (fini) {
      try {
        chrome.runtime.sendMessage({ type: "profil", hote: location.hostname }, function (r) {
          fini(r && !chrome.runtime.lastError && r.profil ? r.profil : {});
        });
      } catch (e) {
        fini({});
      }
    });
  }

  // La langue choisie est retenue pour ce site : en changeant de page, la traduction reprend toute seule
  function memoriserSession(code) {
    try {
      chrome.storage.local.get("safinum_sessions").then(function (r) {
        var s = r.safinum_sessions || {};
        if (code) s[location.origin] = code; else delete s[location.origin];
        return chrome.storage.local.set({ safinum_sessions: s });
      }).catch(function () {});
    } catch (e) {}
  }

  async function activer(code, reprise) {
    arreter(false);
    memoriserSession(code);
    generation++;
    var gen = generation;
    etat.langue = code;
    etat.actif = true;
    etat.degrade = false;
    etat.raisonDegrade = "";
    etat.premierePasse = true;
    etat.alerte = null;
    etat.racinesEnAttente = [];
    stats = nouvellesStats();
    voixOriginaleAnnoncee = false;
    exclusVus = {};
    etat.statut = "Traduction en cours...";
    rendre();
    var p = await profilDuSite();
    if (gen !== generation) return;
    profil = { ignorer: p.ignorer || [], secrets: p.secrets || [], forcer: p.forcer || [], motifs: p.motifs || [] };
    P.ajouterMotifs(profil.motifs);
    var def = LANGUES.filter(function (l) { return l.code === code; })[0];
    lecteur = SafinumLecteur.creer({ profil: profil, surDynamique: signalerDynamique, langue: function () { return def && def.lang ? def.lang : code; } });
    appliquerZoomPage();
    await chargerCache();
    // Les libelles du panneau se traduisent EN PARALLELE : on n'attend pas pour traduire la page
    traduireLibelles().then(function () { if (gen === generation) rendre(); });
    await traduirePage(null);
    if (etat.modes.ecouter && gen === generation && !reprise) {
      V.lire(code === "fub" ? "Fulfulde. Mode expérimental." : "Pidgin actif.", "fr");
    }
  }

  function arreter(message) {
    if (message !== false) memoriserSession(null); // arret voulu par l'utilisateur : on n'y revient pas
    generation++;
    clearTimeout(minuteur);
    if (lecteur) {
      lecteur.arreterObservation();
      lecteur.restaurer();
      lecteur = null;
    }
    [].forEach.call(document.querySelectorAll("[data-safinum-titre]"), function (e) { e.removeAttribute("title"); e.removeAttribute("data-safinum-titre"); });
    etat.actif = false;
    etat.afficherOriginal = false;
    etat.alerte = null;
    etat.enCours = false;
    document.documentElement.style.zoom = "";
    etat.recap = null;
    etat.dernierBloc = null;
    etat.signal = false;
    lectureEcran = 0;
    V.arreter();
    publierEtat(false);
    if (message !== false) {
      etat.statut = "SAFINUM est arrêté. La page est comme avant.";
      rendre();
    }
  }

  function basculerOriginal() {
    etat.afficherOriginal = !etat.afficherOriginal;
    if (lecteur) lecteur.afficherOriginal(etat.afficherOriginal);
    rendre();
  }

  // ---------------------------------------------------------------- libelles du panneau (meme moteur de langue)

  async function traduireLibelles() {
    etat.libelles = {};
    // Langue experimentale : les textes de SAFINUM restent en francais (on ne montre pas d'interface non verifiee)
    var def = (etat.langues || LANGUES).filter(function (l) { return l.code === etat.langue; })[0];
    if (def && (def.statut === "experimental" || def.experimental)) return;
    // Les libelles deja vus sont pris dans le cache de l'extension : seule la premiere activation les demande au serveur
    var segments = [];
    A_TRADUIRE.forEach(function (k) {
      var deja = cacheLocal[cleCache(LIBELLES[k])];
      if (deja && deja.texte_traduit) etat.libelles[k] = deja.texte_traduit;
      else segments.push({ id: k, texte: LIBELLES[k] });
    });
    if (!segments.length) return;
    var rep = await demander(etat.langue, segments);
    if (!rep.segments) return;
    rep.segments.forEach(function (s) {
      // Jamais presente comme certifie : seulement les traductions sures, sinon repli en francais
      if (s.origine !== "original" && s.confiance !== "faible" && s.texte_traduit) {
        etat.libelles[s.id] = s.texte_traduit;
        cacheLocal[cleCache(LIBELLES[s.id])] = { texte_traduit: s.texte_traduit, origine: "cache", confiance: s.confiance, type: s.type, afficher_original: false, raison: null };
        cacheModifie = true;
      }
    });
    clearTimeout(retenir.t);
    retenir.t = setTimeout(enregistrerCache, 2000);
  }

  function lib(cle) {
    return etat.libelles[cle] || LIBELLES[cle];
  }

  // ---------------------------------------------------------------- modes d'acces (F9)

  var ECHELLES = [1, 1.25, 1.5, 2]; // taille du panneau : jusqu'a 200 %

  function appliquerZoomPage() {
    // Option explicite seulement : le zoom global peut deformer l'application
    document.documentElement.style.zoom = etat.actif && etat.modes.zoomPage ? "1.25" : "";
  }

  function enregistrerModes() {
    chrome.storage.local.set({ safinum_modes: etat.modes, safinum_voix: V.reglages() }).catch(function () {});
  }

  function basculerMode(nom) {
    if (nom === "grand") {
      etat.modes.grand = (etat.modes.grand + 1) % ECHELLES.length;
    } else {
      etat.modes[nom] = !etat.modes[nom];
    }
    if (nom === "sansSon") V.muet(etat.modes.sansSon);
    if (nom === "ecouter" && etat.modes.ecouter) {
      etat.modes.sansSon = false;
      etat.modes.sourd = false;
      V.muet(false);
      etat.statut = lib("avertPublic");
    }
    if (nom === "sourd") {
      // Aucune information uniquement sonore : on coupe le son et les alertes restent visuelles
      etat.modes.sansSon = etat.modes.sourd;
      if (etat.modes.sourd) etat.modes.ecouter = false;
      V.muet(etat.modes.sansSon);
    }
    if (nom === "lecteurEcran") V.desactiver(etat.modes.lecteurEcran);
    if (nom === "zoomPage") appliquerZoomPage();
    enregistrerModes();
    brancherLecture();
    rendre();
  }

  // ---------------------------------------------------------------- lecture vocale (F8)
  // On ne lit jamais un conteneur ni toute la page sans demande. Appui long, focus clavier, navigation, "Lire cet ecran".

  var appuiLong = null;
  var listeNav = [];
  var indexNav = -1;
  var lectureEcran = 0; // numero de la lecture d'ecran en cours (0 = aucune)

  // Le texte lu pour un element : la traduction (sans l'original entre parentheses) si le bloc a ete traduit
  function lisibleDe(el, texteAffiche) {
    for (var e = el; e; e = e.parentElement) {
      var l = lisibles.get(e);
      if (!l) continue;
      for (var i = 0; i < l.length; i++) {
        if (texteAffiche.indexOf(l[i].trad) !== -1 || texteAffiche.indexOf(l[i].orig) !== -1) return l[i];
      }
    }
    return null;
  }

  // Langue experimentale (ex : Fulfulde) : aucune vraie voix n'existe, la voix lit donc le texte ORIGINAL dans sa propre langue
  // (francais ou anglais). La traduction reste a l'ecran, l'original est entre parentheses.
  function langueExperimentale() {
    var def = (etat.langues || LANGUES).filter(function (l) { return l.code === etat.langue; })[0];
    return !!(etat.actif && def && (def.statut === "experimental" || def.experimental));
  }

  var voixOriginaleAnnoncee = false;

  function annoncerVoixOriginale() {
    if (voixOriginaleAnnoncee) return Promise.resolve();
    voixOriginaleAnnoncee = true;
    return V.parler("Langue expérimentale : la voix lit le texte original.", "fr");
  }

  function langueDuTexte(t) {
    return /\b(the|your|is|has|please|never|you)\b/i.test(t) ? "en" : "fr";
  }

  // Lit un element (bloc, bouton, etiquette de champ). Retourne la promesse de lecture.
  function lireElement(el) {
    var affiche = SafinumLecture.texteDe(el);
    if (!affiche) return Promise.resolve(false);
    var l = etat.actif ? lisibleDe(el, affiche) : null;
    if (l) etat.dernierBloc = l;
    var texte = l ? l.trad : affiche;
    var cible = l ? etat.langue : langueDuTexte(texte);
    var surOriginal = !!l && langueExperimentale();
    if (surOriginal) {
      texte = l.orig;
      cible = langueDuTexte(texte);
    }
    etat.statut = texte.length > 160 ? texte.slice(0, 160) + "..." : texte;
    rendre();
    var annonce = surOriginal ? annoncerVoixOriginale() : Promise.resolve();
    return annonce.then(function () { return V.lire(masquerSiBesoin(texte), cible); }).then(function () { return true; });
  }

  function masquerSiBesoin(texte) {
    if (!etat.modes.masquer) return texte;
    return texte.replace(new RegExp(P.MONTANT_RE.source, "giu"), "montant masqué");
  }

  function debutAppui(e) {
    if (hote && (hote === e.target || hote.contains(e.target))) return;
    clearTimeout(appuiLong);
    var x = e.clientX;
    var y = e.clientY;
    var cible = e.target;
    appuiLong = setTimeout(function () {
      var vrai = SafinumLecture.elementSousLePoint(document, x, y) || cible;
      lireElement(vrai);
    }, 500);
  }

  function finAppui() {
    clearTimeout(appuiLong);
  }

  // Focus clavier : seulement un element interactif ou un champ (etiquette, jamais la valeur). Un conteneur ne declenche rien.
  function surFocus(e) {
    if (hote && (hote === e.target || hote.contains(e.target))) return;
    var t = e.target;
    var tag = t.tagName || "";
    var interactif = /^(BUTTON|A|INPUT|SELECT|TEXTAREA)$/.test(tag) || t.getAttribute("role") === "button";
    if (interactif) lireElement(t);
  }

  function preparerNavigation() {
    listeNav = SafinumLecture.blocsLisibles(document, false);
  }

  function naviguer(sens) {
    preparerNavigation();
    if (!listeNav.length) return;
    indexNav = Math.max(0, Math.min(listeNav.length - 1, indexNav + sens));
    var b = listeNav[indexNav];
    try { b.el.scrollIntoView({ block: "center" }); } catch (err) { /* pas de defilement */ }
    lireElement(b.el);
  }

  async function lireCetEcran() {
    var mon = ++lectureEcran;
    var liste = SafinumLecture.blocsLisibles(document, true).slice(0, 40);
    for (var i = 0; i < liste.length && mon === lectureEcran; i++) {
      await lireElement(liste[i].el);
    }
    if (mon === lectureEcran) lectureEcran = 0;
  }

  function arretVoix() {
    lectureEcran = 0;
    V.arreter();
  }

  function surTouche(e) {
    if (hote && (hote === e.target || hote.contains(e.target))) return;
    if (e.altKey && e.key === "ArrowDown") { e.preventDefault(); naviguer(1); }
    else if (e.altKey && e.key === "ArrowUp") { e.preventDefault(); naviguer(-1); }
    else if (e.altKey && (e.key === "r" || e.key === "R")) { e.preventDefault(); V.repeter(); }
    else if (e.altKey && (e.key === "l" || e.key === "L")) { e.preventDefault(); lireCetEcran(); }
    else if (e.key === "Escape") arretVoix();
  }

  var lectureBranchee = false;
  function brancherLecture() {
    var voulu = etat.modes.ecouter && !etat.modes.sansSon && !etat.modes.lecteurEcran;
    var evts = [["pointerdown", debutAppui], ["pointerup", finAppui], ["pointercancel", finAppui], ["focusin", surFocus], ["keydown", surTouche]];
    if (voulu && !lectureBranchee) {
      evts.forEach(function (x) { document.addEventListener(x[0], x[1], true); });
      lectureBranchee = true;
    } else if (!voulu && lectureBranchee) {
      evts.forEach(function (x) { document.removeEventListener(x[0], x[1], true); });
      lectureBranchee = false;
    }
  }

  // ---------------------------------------------------------------- recapitulatif avant confirmation

  var NOMS_TYPES = { MONTANT: "montant", FRAIS: "frais", BENEF: "benef", DATE: "date", NOMBRE: "nombre", TEL: "tel", REF: "ref", POURCENT: "pourcent" };

  // Montant, frais, total, beneficiaire et avertissement du message de confirmation, avec les chiffres d'origine
  function construireRecap(bloc, orig) {
    var lignes = [];
    var montants = 0;
    var nbMontants = Object.keys(bloc.valeurs).filter(function (b) { return b.indexOf("[MONTANT_") === 0; }).length;
    Object.keys(bloc.valeurs).forEach(function (b) {
      var type = b.slice(1, b.indexOf("_"));
      var cle = NOMS_TYPES[type] || "ref";
      if (type === "MONTANT") {
        montants++;
        cle = nbMontants > 1 && montants === nbMontants ? "total" : "montant";
      }
      if (type === "MONTANT" || type === "FRAIS" || type === "BENEF") lignes.push({ cle: cle, valeur: bloc.valeurs[b] });
    });
    return { lignes: lignes, avertissement: orig };
  }

  function texteRecap() {
    return etat.recap.lignes.map(function (l) { return lib(l.cle) + " : " + l.valeur; }).join(". ");
  }

  // ---------------------------------------------------------------- signalement d'une erreur de langue (local, sans envoi)

  function enregistrerSignalement(correction) {
    var d = etat.dernierBloc;
    if (!d || !correction.trim()) return;
    chrome.storage.local.get("safinum_signalements").then(function (r) {
      var liste = r.safinum_signalements || [];
      // Seulement du texte SANS valeurs (balises), jamais un montant ni un nom
      liste.push({ langue: etat.langue, source: d.brut, propose: correction.trim(), affiche: d.tradBrut, date: new Date().toISOString().slice(0, 10) });
      return chrome.storage.local.set({ safinum_signalements: liste });
    }).then(function () {
      etat.signal = false;
      etat.statut = "Correction enregistrée sur cet appareil. Rien n'a été envoyé.";
      rendre();
    }).catch(function () {});
  }

  function guillemets(v) {
    return '"' + String(v).replace(/"/g, '""') + '"';
  }

  function exporterSignalements() {
    chrome.storage.local.get("safinum_signalements").then(function (r) {
      var liste = r.safinum_signalements || [];
      // Memes colonnes que les glossaires : fr, en, cible, confiance, statut, source
      var lignes = ["fr,en,cible,confiance,statut,source"];
      liste.forEach(function (s) {
        var src = s.source || "";
        var en = langueDuTexte(src) === "en";
        lignes.push([guillemets(en ? "" : src), guillemets(en ? src : ""), guillemets(s.propose), "moyenne", "brouillon", "signalement_local"].join(","));
      });
      var blob = new Blob(["﻿" + lignes.join("\n")], { type: "text/csv;charset=utf-8" });
      var a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = "signalements_safinum.csv";
      a.click();
      setTimeout(function () { URL.revokeObjectURL(a.href); }, 2000);
    }).catch(function () {});
  }

  // ---------------------------------------------------------------- panneau (Shadow DOM)

  var STYLE = [
    ":host {",
    "  all: initial;",
    "}",
    ".panneau {",
    "  position: fixed;",
    "  right: 12px;",
    "  bottom: 12px;",
    "  width: min(380px, calc(100vw - 24px));",
    "  max-height: 85vh;",
    "  overflow: auto;",
    "  box-sizing: border-box;",
    "  padding: 12px;",
    "  background: #ffffff;",
    "  color: #14201f;",
    "  border: 2px solid #0b5d4b;",
    "  border-radius: 14px;",
    "  font: calc(16px * var(--e, 1)) / 1.4 system-ui, -apple-system, 'Segoe UI', Arial, sans-serif;",
    "  z-index: 2147483647;",
    "  box-shadow: 0 6px 24px rgba(0, 0, 0, 0.25);",
    "}",
    ".panneau.fort {",
    "  background: #000000;",
    "  color: #ffe600;",
    "  border-color: #ffe600;",
    "}",
    ".panneau.fort button {",
    "  background: #000000;",
    "  color: #ffe600;",
    "  border-color: #ffe600;",
    "}",
    ".panneau.fort button[aria-pressed='true'] {",
    "  background: #ffe600;",
    "  color: #000000;",
    "}",
    "h2 {",
    "  margin: 0 0 8px;",
    "  font-size: 1.1em;",
    "}",
    "p {",
    "  margin: 0 0 8px;",
    "}",
    ".ligne {",
    "  display: flex;",
    "  flex-wrap: wrap;",
    "  gap: 8px;",
    "  margin-bottom: 8px;",
    "}",
    "button {",
    "  flex: 1 1 130px;",
    "  min-height: 48px;",
    "  min-width: 48px;",
    "  padding: 8px 12px;",
    "  font: inherit;",
    "  font-weight: 600;",
    "  color: #0b5d4b;",
    "  background: #ffffff;",
    "  border: 2px solid #0b5d4b;",
    "  border-radius: 10px;",
    "  cursor: pointer;",
    "}",
    "button[aria-pressed='true'] {",
    "  background: #0b5d4b;",
    "  color: #ffffff;",
    "}",
    "button:focus-visible, textarea:focus-visible {",
    "  outline: 4px solid #e8a317;",
    "  outline-offset: 2px;",
    "}",
    "button.gros {",
    "  min-height: 64px;",
    "  font-size: 1.15em;",
    "}",
    "button.stop {",
    "  color: #ffffff;",
    "  background: #b3261e;",
    "  border-color: #b3261e;",
    "}",
    ".statut {",
    "  font-size: 0.9em;",
    "  min-height: 1.4em;",
    "}",
    ".recap {",
    "  margin-bottom: 8px;",
    "  padding: 10px;",
    "  border: 3px solid #0b5d4b;",
    "  border-radius: 10px;",
    "}",
    ".recap .valeur {",
    "  font-size: 1.6em;",
    "  font-weight: 700;",
    "}",
    ".recap .nom {",
    "  font-size: 0.85em;",
    "}",
    ".petit {",
    "  font-size: 0.8em;",
    "}",
    "textarea {",
    "  width: 100%;",
    "  min-height: 64px;",
    "  box-sizing: border-box;",
    "  font: inherit;",
    "}",
    ".alerte {",
    "  position: fixed;",
    "  top: 0;",
    "  left: 0;",
    "  right: 0;",
    "  box-sizing: border-box;",
    "  padding: 14px 16px;",
    "  background: #b3261e;",
    "  color: #ffffff;",
    "  font: 18px/1.4 system-ui, -apple-system, 'Segoe UI', Arial, sans-serif;",
    "  z-index: 2147483647;",
    "  border-bottom: 4px solid #ffffff;",
    "}",
    ".alerte button {",
    "  margin-top: 8px;",
    "  background: #ffffff;",
    "  color: #b3261e;",
    "  border-color: #ffffff;",
    "}",
    ".reduit {",
    "  position: fixed;",
    "  right: 12px;",
    "  bottom: 12px;",
    "  z-index: 2147483647;",
    "  display: flex;",
    "  gap: 8px;",
    "}",
  ].join("\n");

  function el(tag, attrs, enfants) {
    var e = document.createElement(tag);
    Object.keys(attrs || {}).forEach(function (k) {
      if (k === "texte") e.textContent = attrs[k];
      else if (k === "onclick") e.addEventListener("click", attrs[k]);
      else e.setAttribute(k, attrs[k]);
    });
    (enfants || []).forEach(function (c) { e.appendChild(c); });
    return e;
  }

  function bouton(texte, action, options) {
    var o = options || {};
    var b = el("button", { type: "button", texte: texte, onclick: action });
    var classes = [];
    if (o.gros) classes.push("gros");
    if (o.stop) classes.push("stop");
    if (classes.length) b.className = classes.join(" ");
    if (o.presse !== undefined) b.setAttribute("aria-pressed", String(!!o.presse));
    if (o.description) b.setAttribute("aria-label", o.description);
    if (o.parler) {
      // Lecture a voix haute au focus ou a l'appui long, pour les personnes qui ne lisent pas
      var tm;
      b.addEventListener("focus", function () { if (!b.hasAttribute("data-sans-voix")) V.parler(o.parler, "fr"); });
      b.addEventListener("pointerdown", function () { tm = setTimeout(function () { V.parler(o.parler, "fr"); }, 500); });
      b.addEventListener("pointerup", function () { clearTimeout(tm); });
    }
    return b;
  }

  function langueAffichee(l) {
    return l.nom + (l.statut === "experimental" || l.experimental ? " (expérimental)" : "");
  }

  // Le panneau est redessine souvent (progression de la traduction). On regroupe les demandes et on attend qu'un appui soit termine :
  // reconstruire un bouton entre l'appui et le relachement ferait perdre le clic.
  var rendrePlanifie = false;
  var pointeurPanneau = false;

  function rendre() {
    if (rendrePlanifie) return;
    rendrePlanifie = true;
    setTimeout(function () {
      rendrePlanifie = false;
      if (pointeurPanneau) {
        rendre();
        return;
      }
      rendreMaintenant();
    }, pointeurPanneau ? 60 : 0);
  }

  function rendreMaintenant() {
    if (!racine) return;
    // On garde la place du focus clavier : sinon l'utilisateur repart du debut du panneau apres chaque action
    var actif = racine.activeElement;
    var cleFocus = actif && actif.tagName === "BUTTON" ? actif.textContent : null;
    racine.innerHTML = "";
    racine.appendChild(el("style", { texte: STYLE }));

    if (etat.alerte) {
      var texteAlerte = etat.alerte.traduction ? etat.alerte.traduction + " (Original : " + etat.alerte.original + ")" : etat.alerte.original + (etat.alerte.mention ? " [Traduction incertaine]" : "");
      racine.appendChild(
        el("div", { class: "alerte", role: "alert" }, [
          el("strong", { texte: "Alerte : " }),
          el("span", { texte: texteAlerte }),
          el("br"),
          bouton(lib("fermer"), function () { etat.alerte = null; rendre(); }),
        ])
      );
    }

    if (!etat.visible) {
      // Le bouton d'arret reste toujours visible quand SAFINUM est actif
      var reduit = [bouton("SAFINUM", function () { etat.visible = true; rendre(); }, { gros: true })];
      if (etat.actif) reduit.push(bouton(lib("arreter"), function () { arreter(); }, { gros: true, stop: true }));
      racine.appendChild(el("div", { class: "reduit" }, reduit));
      return;
    }

    var p = el("section", { class: "panneau" + (etat.modes.contraste ? " fort" : ""), "aria-label": "SAFINUM", style: "--e:" + ECHELLES[etat.modes.grand] });
    p.appendChild(el("h2", { texte: "SAFINUM" }));

    if (!etat.consentement) {
      p.appendChild(el("p", { texte: LIBELLES.consentement }));
      p.appendChild(
        el("div", { class: "ligne" }, [
          bouton(LIBELLES.accepter, function () {
            etat.consentement = true;
            chrome.storage.local.set({ safinum_consentement: true }).catch(function () {});
            rendre();
          }, { gros: true, parler: LIBELLES.accepter }),
          bouton(LIBELLES.fermer, function () { etat.visible = false; rendre(); }),
        ])
      );
      racine.appendChild(p);
      return;
    }

    p.appendChild(el("p", { texte: lib("langue") }));
    p.appendChild(
      el("div", { class: "ligne" }, (etat.langues || LANGUES).map(function (l) {
        return bouton((l.icone || "💬") + " " + langueAffichee(l), function () { activer(l.code); }, {
          gros: true,
          presse: etat.actif && etat.langue === l.code,
          parler: l.nom + (l.statut === "experimental" || l.experimental ? ", expérimental" : ""),
        });
      }))
    );

    var M = etat.modes;
    p.appendChild(
      el("div", { class: "ligne" }, [
        bouton("🔊 " + lib("ecouter"), function () { basculerMode("ecouter"); }, { presse: M.ecouter, parler: LIBELLES.ecouter }),
        bouton("🔠 " + lib("grand") + (M.grand ? " " + Math.round(ECHELLES[M.grand] * 100) + " %" : ""), function () { basculerMode("grand"); }, { presse: M.grand > 0 }),
        bouton("🔇 " + lib("sansSon"), function () { basculerMode("sansSon"); }, { presse: M.sansSon }),
        bouton("🌓 " + lib("contraste"), function () { basculerMode("contraste"); }, { presse: M.contraste }),
        bouton("👂 " + lib("sourd"), function () { basculerMode("sourd"); }, { presse: M.sourd }),
        bouton("🖥 " + lib("lecteurEcran"), function () { basculerMode("lecteurEcran"); }, { presse: M.lecteurEcran }),
        bouton("🔒 " + lib("masquer"), function () { basculerMode("masquer"); }, { presse: M.masquer }),
        bouton(lib("zoomPage"), function () { basculerMode("zoomPage"); }, { presse: M.zoomPage }),
      ])
    );

    if (etat.actif) {
      p.appendChild(
        el("div", { class: "ligne" }, [
          bouton(etat.afficherOriginal ? lib("traduction") : lib("original"), basculerOriginal, { presse: etat.afficherOriginal }),
          bouton(lib("arreter"), function () { arreter(); }, { stop: true }),
        ])
      );
    }

    if (M.ecouter && !M.sansSon && !M.lecteurEcran) {
      p.appendChild(
        el("div", { class: "ligne" }, [
          bouton(lib("lireEcran"), lireCetEcran, { gros: true }),
          bouton(lib("precedent"), function () { naviguer(-1); }),
          bouton(lib("suivant"), function () { naviguer(1); }),
          bouton("🔁 " + lib("repeter"), function () { V.repeter(); }),
          bouton(lib("pause"), function () { V.pause(); }),
          bouton(lib("reprendre"), function () { V.reprendre(); }),
          bouton(lib("pluslent"), function () { V.plusLent(); enregistrerModes(); V.repeter(); }),
          bouton(lib("plusrapide"), function () { V.plusRapide(); enregistrerModes(); V.repeter(); }),
          bouton(lib("plusfort"), function () { V.plusFort(); enregistrerModes(); V.repeter(); }),
          bouton(lib("stopVoix"), arretVoix, { stop: true }),
        ])
      );
    }

    if (etat.recap) {
      var cartes = etat.recap.lignes.map(function (l) {
        return el("div", null, [
          el("div", { class: "nom", texte: lib(l.cle) }),
          el("div", { class: "valeur", texte: M.masquer ? "••••" : l.valeur }),
        ]);
      });
      cartes.push(el("p", { texte: lib("avertissement") + " : " + etat.recap.avertissement }));
      cartes.push(el("p", { class: "petit", texte: lib("jamaisConfirme") }));
      cartes.unshift(el("h2", { texte: lib("recap") }));
      var zone = el("div", { class: "recap", role: "region", "aria-label": lib("recap") }, cartes);
      if (!M.sansSon && !M.lecteurEcran) zone.appendChild(bouton(lib("lireRecap"), function () { V.lire(masquerSiBesoin(texteRecap()), etat.langue); }));
      p.appendChild(zone);
    }

    if (etat.actif && etat.dernierBloc) {
      if (etat.signal) {
        var champ = el("textarea", { "aria-label": lib("correction") });
        p.appendChild(el("p", { texte: lib("correction") }));
        p.appendChild(champ);
        p.appendChild(el("div", { class: "ligne" }, [
          bouton(lib("enregistrer"), function () { enregistrerSignalement(champ.value); }),
          bouton(lib("fermer"), function () { etat.signal = false; rendre(); }),
        ]));
      } else {
        p.appendChild(el("div", { class: "ligne" }, [
          bouton(lib("signaler"), function () { etat.signal = true; rendre(); }),
          bouton(lib("exporter"), exporterSignalements),
        ]));
      }
    }

    p.appendChild(el("p", { class: "statut", role: "status", "aria-live": "polite", texte: etat.statut }));
    p.appendChild(el("p", { class: "petit", texte: "SAFINUM version " + VERSION }));
    if (etat.actif) p.appendChild(el("p", { class: "petit", texte: LIBELLES.nonCertifie }));
    p.appendChild(el("div", { class: "ligne" }, [bouton(LIBELLES.fermer, function () { etat.visible = false; rendre(); }), bouton(LIBELLES.retirer, retirer, { stop: true })]));
    racine.appendChild(p);
    if (cleFocus) {
      var retrouve = Array.prototype.filter.call(racine.querySelectorAll("button"), function (b) { return b.textContent === cleFocus; })[0];
      if (retrouve) {
        retrouve.setAttribute("data-sans-voix", "1");
        retrouve.focus();
        retrouve.removeAttribute("data-sans-voix");
      }
    }
  }

  // ---------------------------------------------------------------- demarrage

  // Retire SAFINUM de la page : arret, panneau et ecouteurs supprimes, aucun residu
  function retirer() {
    arreter(false);
    if (lectureBranchee) {
      [["pointerdown", debutAppui], ["pointerup", finAppui], ["pointercancel", finAppui], ["focusin", surFocus], ["keydown", surTouche]].forEach(function (x) { document.removeEventListener(x[0], x[1], true); });
      lectureBranchee = false;
    }
    if (hote && hote.parentNode) hote.parentNode.removeChild(hote);
    hote = null;
    racine = null;
    window.__safinumCharge = false;
  }

  function creerPanneau() {
    hote = document.createElement("div");
    hote.id = "safinum-hote";
    hote.setAttribute("data-safinum-ignore", "true");
    racine = hote.attachShadow({ mode: "open" });
    racine.addEventListener("pointerdown", function () { pointeurPanneau = true; }, true);
    window.addEventListener("pointerup", function () { setTimeout(function () { pointeurPanneau = false; }, 30); }, true);
    window.addEventListener("pointercancel", function () { pointeurPanneau = false; }, true);
    document.documentElement.appendChild(hote);
    rendre();
  }

  chrome.runtime.onMessage.addListener(function (msg) {
    if (msg.type === "basculer_panneau") {
      etat.visible = !etat.visible;
      rendre();
    }
  });

  // Les langues et leur statut viennent du serveur : ajouter une langue ne demande aucun changement ici
  function chargerLangues() {
    return new Promise(function (fini) {
      try {
        chrome.runtime.sendMessage({ type: "langues" }, function (r) {
          if (r && !chrome.runtime.lastError && r.langues && r.langues.length) {
            etat.langues = r.langues.map(function (l) { return { code: l.code, nom: l.nom.replace(/ \(.*\)$/, "").replace("camerounais", "").trim(), statut: l.statut, lang: l.code, voix: l.voix }; });
            V.configurerLangues(r.langues);
          }
          fini();
        });
      } catch (e) {
        fini();
      }
    });
  }

  V.surRemplacement(function (cible, lv) {
    etat.statut = lib("voixRemplacement");
    rendre();
  });

  Promise.all([chrome.storage.local.get(["safinum_consentement", "safinum_modes", "safinum_voix", "safinum_sessions"]), chargerLangues()]).then(function (res) {
    var r = res[0];
    etat.consentement = !!r.safinum_consentement;
    if (window.SAFINUM_VISIBLE) etat.visible = true;
    if (r.safinum_modes) etat.modes = Object.assign(etat.modes, r.safinum_modes);
    if (r.safinum_voix) V.appliquerReglages(r.safinum_voix);
    V.muet(etat.modes.sansSon);
    V.desactiver(etat.modes.lecteurEcran);
    V.voixServeur(VOIX_SERVEUR);
    brancherLecture();
    creerPanneau();
    // Reprise automatique apres un changement de page du meme site
    var code = r.safinum_sessions && r.safinum_sessions[location.origin];
    if (code && etat.consentement) activer(code, true);
  });
})();
