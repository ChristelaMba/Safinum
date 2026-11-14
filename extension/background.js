/*
 * background.js - relais entre la page et le serveur SAFINUM.
 * Seul le texte SANS valeurs financieres est envoye (la protection est faite dans content.js).
 */
var SERVEUR_PAR_DEFAUT = "http://localhost:8000";

// L'adresse vient, dans l'ordre : du reglage "serveur" (essais), de config.json (l'archive telechargee sur le serveur
// de demonstration y met sa propre adresse), puis de localhost.
var adresseConfig = null;
function lireConfig() {
  if (adresseConfig !== null) return Promise.resolve(adresseConfig);
  return fetch(chrome.runtime.getURL("config.json"))
    .then(function (r) { return r.json(); })
    .then(function (c) { adresseConfig = (c && c.serveur) || ""; return adresseConfig; })
    .catch(function () { adresseConfig = ""; return ""; });
}

function adresseServeur() {
  return chrome.storage.local.get("serveur").then(function (r) {
    if (r.serveur) return r.serveur.replace(/\/$/, "");
    return lireConfig().then(function (c) { return (c || SERVEUR_PAR_DEFAUT).replace(/\/$/, ""); });
  });
}

async function appeler(chemin, corps, delai) {
  var base = await adresseServeur();
  var ctrl = new AbortController();
  var minuteur = setTimeout(function () {
    ctrl.abort();
  }, delai);
  try {
    var r = await fetch(base + chemin, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(corps),
      signal: ctrl.signal,
    });
    return r;
  } finally {
    clearTimeout(minuteur);
  }
}

function enBase64(octets) {
  var s = "";
  var u8 = new Uint8Array(octets);
  for (var i = 0; i < u8.length; i += 8192) {
    s += String.fromCharCode.apply(null, u8.subarray(i, i + 8192));
  }
  return btoa(s);
}

chrome.runtime.onMessage.addListener(function (msg, sender, reponse) {
  if (msg.type === "traduire") {
    // Delai large : un modele de langage peut mettre plus de 20 secondes (surcharge, reprises). Une coupure trop courte laisse la page en original.
    appeler("/v1/translate", { langue_cible: msg.langue, segments: msg.segments }, 120000)
      .then(function (r) {
        return r.ok ? r.json() : { erreur: "http_" + r.status };
      })
      .then(reponse)
      .catch(function () {
        reponse({ erreur: "serveur_injoignable" });
      });
    return true;
  }
  if (msg.type === "langues") {
    // Liste des langues et statut (stable ou experimental) donnee par le serveur
    adresseServeur()
      .then(function (base) { return fetch(base + "/v1/langues"); })
      .then(function (r) { return r.json(); })
      .then(function (l) { reponse({ langues: l }); })
      .catch(function () { reponse({ langues: [] }); });
    return true;
  }
  if (msg.type === "profil") {
    // Profil du site : selecteurs a ignorer, secrets en plus, selecteurs a forcer (profils.json)
    fetch(chrome.runtime.getURL("profils.json"))
      .then(function (r) { return r.json(); })
      .then(function (j) {
        var p = { ignorer: [], secrets: [], forcer: [], motifs: [] };
        var fusion = function (src) {
          Object.keys(p).forEach(function (k) { if (src && src[k]) p[k] = p[k].concat(src[k]); });
        };
        fusion(j.defaut);
        Object.keys(j.domaines || {}).forEach(function (d) {
          if (msg.hote === d || msg.hote.endsWith("." + d)) fusion(j.domaines[d]);
        });
        reponse({ profil: p });
      })
      .catch(function () { reponse({ profil: {} }); });
    return true;
  }
  if (msg.type === "tts") {
    appeler("/v1/tts", { langue: msg.langue, texte: msg.texte }, 15000)
      .then(function (r) {
        if (!r.ok) return { erreur: "http_" + r.status };
        return r.arrayBuffer().then(function (b) {
          return { audio: "data:audio/wav;base64," + enBase64(b) };
        });
      })
      .then(reponse)
      .catch(function () {
        reponse({ erreur: "serveur_injoignable" });
      });
    return true;
  }
  return false;
});

// Un clic sur l'icone ouvre ou ferme le panneau SAFINUM de l'onglet
chrome.action.onClicked.addListener(function (tab) {
  chrome.tabs.sendMessage(tab.id, { type: "basculer_panneau" }).catch(function () {});
});
