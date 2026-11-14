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
