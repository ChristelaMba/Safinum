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
