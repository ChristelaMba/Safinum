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
