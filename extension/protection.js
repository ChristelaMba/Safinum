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
