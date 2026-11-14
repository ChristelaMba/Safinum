// Banc d'essai "contenu inedit" : messages jamais vus, vrai moteur, vraies valeurs.
// Chaine reelle : protection des valeurs (extension) -> serveur -> controle -> restitution des valeurs.
// Lancer un serveur sur le port 8020 avec le VRAI moteur, puis : node extension/tests/inedit.js [port]
const fs = require("fs");
const path = require("path");
const P = require("../protection.js");

const PORT = process.argv[2] || "8020";
const iLangue = process.argv.indexOf("--langue");
const LANGUE = iLangue > 0 ? process.argv[iLangue + 1] : "pcm";
const racine = path.join(__dirname, "..", "..");
const inedits = JSON.parse(fs.readFileSync(path.join(racine, "serveur", "tests", "inedit.json"), "utf8"));
const gold = JSON.parse(fs.readFileSync(path.join(racine, "serveur", "tests", "golden.json"), "utf8")).map((m) => m.texte);
const tous = inedits.concat(process.argv.includes("--or") ? gold : []);
const iFin = process.argv.indexOf("--fin");
const messages = iFin > 0 ? tous.slice(-parseInt(process.argv[iFin + 1], 10)) : tous;

function nombres(t) {
  return (t.match(/\d[\d\s .,]*\d|\d/g) || []).map((x) => x.replace(/\D/g, ""));
}

(async () => {
  const proteges = messages.map((m, i) => ({ id: String(i), source: m, p: P.proteger(m) }));
  const lots = [];
  for (let i = 0; i < proteges.length; i += 12) lots.push(proteges.slice(i, i + 12));
  const sortie = [];
  const t0 = Date.now();
  for (const lot of lots) {
    const r = await fetch("http://localhost:" + PORT + "/v1/translate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ langue_cible: LANGUE, segments: lot.map((x) => ({ id: x.id, texte: x.p.texte, role: "message" })) }),
    });
    const j = await r.json();
    const parId = {};
    (j.segments || []).forEach((s) => (parId[s.id] = s));
    lot.forEach((x) => {
      const s = parId[x.id] || { origine: "original", raison: "pas_de_reponse", confiance: "faible", texte_traduit: x.p.texte };
      const res = s.origine === "original" ? { ok: false, texte: x.source } : P.restaurer(s.texte_traduit, x.p.valeurs);
      let verdict = "traduit";
      let raison = s.raison || "";
      if (s.origine === "original") verdict = "original";
      else if (!res.ok) {
        verdict = "refuse_balises";
      } else if (!P.valeursIdentiques(x.source, res.texte)) verdict = "refuse_valeurs";
      else if (nombres(res.texte).some((n) => nombres(x.source).indexOf(n) === -1)) verdict = "refuse_chiffre_nouveau";
      // Part des mots de la sortie qui sont des mots de la source : mesure la recopie du francais
      const mots = (t) => t.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\[[A-Z]+_\d+\]|<\/?s\d+>/g, " ").split(/[^a-z]+/).filter((w) => w.length > 3);
      const motsSource = mots(x.source);
      const motsSortie = mots(s.texte_traduit || "");
      const recopie = motsSortie.length ? motsSortie.filter((w) => motsSource.indexOf(w) !== -1).length / motsSortie.length : 0;
      sortie.push({ recopie: Math.round(recopie * 100), source: x.source, protege: x.p.texte, pidgin: verdict === "traduit" ? res.texte : "", brut: s.texte_traduit, verdict, confiance: s.confiance, type: s.type, afficher_original: s.afficher_original, raison });
    });
  }
  const duree = (Date.now() - t0) / 1000;
  const compte = {};
  sortie.forEach((s) => (compte[s.verdict + (s.raison ? " [" + s.raison + "]" : "")] = (compte[s.verdict + (s.raison ? " [" + s.raison + "]" : "")] || 0) + 1));
  console.log("Messages : " + sortie.length + " | duree : " + duree.toFixed(1) + " s");
  console.log(JSON.stringify(compte, null, 1));
  const conf = {};
  sortie.filter((s) => s.verdict === "traduit").forEach((s) => (conf[s.confiance] = (conf[s.confiance] || 0) + 1));
  console.log("Confiance des traduits : " + JSON.stringify(conf));
  const alertes = sortie.filter((s) => s.type === "alerte" || s.type === "erreur");
  console.log("Alertes ou erreurs avec original a cote : " + alertes.filter((s) => s.afficher_original).length + " / " + alertes.length);
  if (iFin < 0) fs.writeFileSync(path.join(racine, "docs", LANGUE === "pcm" ? "resultats_inedit.json" : "resultats_inedit_" + LANGUE + ".json"), JSON.stringify(sortie, null, 1));
  sortie.filter((s) => s.verdict !== "traduit" || s.confiance !== "elevee").forEach((s) => console.log("\n[" + s.verdict + " " + s.confiance + " " + s.raison + " recopie=" + s.recopie + "%]\n  " + s.source + "\n  " + (s.pidgin || s.brut)));
})();
