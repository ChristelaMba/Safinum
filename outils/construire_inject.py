"""Construit extension/safinum-inject.js : le meme code que l'extension, en un seul fichier.

Plan B si l'extension ne s'installe pas sur la machine du jury : favori (bookmarklet), console du navigateur
ou gestionnaire de scripts. Le fichier remplace chrome.* par un petit relais qui appelle directement le serveur.

Lancer : python outils/construire_inject.py
"""
import json
import os

RACINE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
EXT = os.path.join(RACINE, "extension")
FICHIERS = ["protection.js", "secrets.js", "nombres.js", "lecteur.js", "lecture_vocale.js", "voix.js", "content.js"]

RELAIS = r"""
/* ---- Relais : remplace chrome.runtime et chrome.storage quand l'extension n'est pas installee ---- */
(function () {
  if (window.chrome && window.chrome.runtime && window.chrome.runtime.sendMessage) return;
  var SERVEUR = (window.SAFINUM_URL || "http://localhost:8000").replace(/\/$/, "");
  var PROFILS = __PROFILS__;
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
"""


def main():
    with open(os.path.join(EXT, "profils.json"), encoding="utf-8") as fh:
        profils = json.load(fh)
    parties = [
        "/* SAFINUM - script autonome (plan B). Genere par outils/construire_inject.py : ne pas modifier a la main. */",
        "/* Avant de le charger, on peut ecrire : window.SAFINUM_URL = 'http://adresse-du-serveur:8000'; */",
        RELAIS.replace("__PROFILS__", json.dumps(profils, ensure_ascii=False)),
    ]
    for f in FICHIERS:
        with open(os.path.join(EXT, f), encoding="utf-8") as fh:
            parties.append("\n/* ---- %s ---- */\n%s" % (f, fh.read()))
    sortie = os.path.join(EXT, "safinum-inject.js")
    with open(sortie, "w", encoding="utf-8", newline="\n") as fh:
        fh.write("\n".join(parties))
    print("ecrit :", sortie, os.path.getsize(sortie), "octets")


if __name__ == "__main__":
    main()
