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
