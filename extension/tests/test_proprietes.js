// Test par proprietes : 1000 messages aleatoires. Lancer : node extension/tests/test_proprietes.js
const assert = require("assert");
const P = require("../protection.js");

// Generateur pseudo-aleatoire fixe : meme resultat a chaque lancement
let graine = 20261114;
function alea() {
  graine = (graine * 1664525 + 1013904223) % 4294967296;
  return graine / 4294967296;
}
function choix(l) {
  return l[Math.floor(alea() * l.length)];
}
function entier(a, b) {
  return a + Math.floor(alea() * (b - a + 1));
}

const NOMS = ["Jean K.", "Marie T.", "Paul N.", "Awa Bello", "Samuel E.", "Christela M."];
const DEVISES = ["FCFA", "XAF", "XOF", "F CFA", "EUR", "USD"];
function milliers(n, sep) {
  return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, sep);
}
function montant() {
  const n = entier(100, 9999999);
  const f = choix([" ", ",", ".", "", " "]);
  const dev = choix(DEVISES);
  const forme = entier(0, 3);
  if (forme === 0) return milliers(n, f || " ") + " " + dev;
  if (forme === 1) return milliers(n, " ") + "," + entier(10, 99) + " " + dev;
  if (forme === 2) return dev + " " + n;
  return n + dev;
}
function date() {
  return choix([
    ("0" + entier(1, 28)).slice(-2) + "/" + ("0" + entier(1, 12)).slice(-2) + "/2026",
    entier(1, 28) + " novembre 2026",
    "2026-" + ("0" + entier(1, 12)).slice(-2) + "-" + ("0" + entier(1, 28)).slice(-2),
    ("0" + entier(0, 23)).slice(-2) + ":" + ("0" + entier(0, 59)).slice(-2),
  ]);
}
function telephone() {
  return choix(["+237 6" + entier(10, 99) + " " + entier(10, 99) + " " + entier(10, 99) + " " + entier(10, 99), "6" + entier(10, 99) + " " + entier(10, 99) + " " + entier(10, 99) + " " + entier(10, 99)]);
}
function reference() {
  return choix(["TX20261101" + entier(10000, 99999), "Ref " + entier(100000, 999999)]);
}
function autre() {
  return choix([
    "jean" + entier(1, 99) + "@exemple.cm",
    "CM21 " + entier(1000, 9999) + " " + entier(1000, 9999) + " " + entier(1000, 9999) + " " + entier(1000, 9999) + " " + entier(1000, 9999) + " 678",
    "4111 " + entier(1000, 9999) + " " + entier(1000, 9999) + " " + entier(1000, 9999),
    entier(1, 99) + " %",
  ]);
}

function message() {
  const parties = ["Votre", "transfert", "est", "en cours", "Merci de patienter", "Attention", "ne communiquez jamais votre code"];
  let t = choix(parties) + " ";
  const n = entier(1, 4);
  for (let i = 0; i < n; i++) {
    const k = entier(0, 6);
    const v = [montant, montant, date, telephone, reference, autre, function () { return "vers " + choix(NOMS); }][k]();
    t += choix(["de ", "le ", "a ", "Frais : ", "Total : ", ""]) + v + choix([". ", ", ", " "]) + choix(["", "Confirmer ", "Merci "]);
  }
  return t.trim();
}

let ok = 0;
function test(nom, f) {
  try {
    f();
    ok++;
    console.log("ok   " + nom);
  } catch (e) {
    console.log("ECHEC " + nom + " : " + e.message);
    process.exitCode = 1;
  }
}

const MESSAGES = [];
for (let i = 0; i < 1000; i++) MESSAGES.push(message());

test("1000 messages : proteger puis restaurer redonne le texte identique", function () {
  MESSAGES.forEach(function (m) {
    const p = P.proteger(m);
    const r = P.restaurer(p.texte, p.valeurs);
    assert.ok(r.ok, "restauration refusee : " + m);
    assert.strictEqual(r.texte, m, "texte different : " + m);
  });
});

test("1000 messages : aucune valeur reconnue ne reste visible dans le texte protege", function () {
  MESSAGES.forEach(function (m) {
    const p = P.proteger(m);
    Object.keys(p.valeurs).forEach(function (b) {
      assert.ok(p.texte.indexOf(p.valeurs[b]) === -1, "valeur encore visible " + p.valeurs[b] + " dans " + p.texte);
    });
  });
});

test("1000 messages : aucun chiffre de 3 positions ou plus ne reste dans le texte protege", function () {
  MESSAGES.forEach(function (m) {
    const p = P.proteger(m);
    const reste = p.texte.replace(/\[[A-Z]+_\d+\]/g, "");
    assert.ok(!/\d{3,}/.test(reste), "chiffres visibles : " + p.texte + " (original : " + m + ")");
  });
});

// Faux traducteurs qui abiment les balises : le resultat doit etre refuse
function abimer(texte, mode) {
  const bal = texte.match(/\[[A-Z]+_\d+\]/g) || [];
  if (!bal.length) return null;
  if (mode === "supprimer") return texte.replace(bal[0], "");
  if (mode === "doubler") return texte + " " + bal[0];
  if (mode === "inventer") return texte + " [MONTANT_99]";
  return null;
}
["supprimer", "doubler", "inventer"].forEach(function (mode) {
  test("traducteur qui " + mode + " une balise : toujours refuse", function () {
    let essais = 0;
    MESSAGES.forEach(function (m) {
      const p = P.proteger(m);
      const mauvais = abimer(p.texte, mode);
      if (mauvais === null) return;
      essais++;
      assert.strictEqual(P.restaurer(mauvais, p.valeurs).ok, false, mode + " accepte : " + m);
    });
    assert.ok(essais > 500, "trop peu d'essais : " + essais);
  });
});

test("traducteur qui deplace les balises : accepte, valeurs identiques", function () {
  MESSAGES.forEach(function (m) {
    const p = P.proteger(m);
    const bal = p.texte.match(/\[[A-Z]+_\d+\]/g) || [];
    const deplace = "Yu sabi : " + bal.slice().reverse().join(" , ");
    if (!bal.length) return;
    const r = P.restaurer(deplace, p.valeurs);
    assert.ok(r.ok);
    Object.keys(p.valeurs).forEach(function (b) {
      assert.ok(r.texte.indexOf(p.valeurs[b]) !== -1);
    });
  });
});

test("mutation : chaque chiffre change dans la traduction est detecte (100 %)", function () {
  let essais = 0;
  let detectes = 0;
  MESSAGES.forEach(function (m) {
    const p = P.proteger(m);
    if (!Object.keys(p.valeurs).length) return;
    const bon = P.restaurer(p.texte, p.valeurs).texte;
    const positions = [];
    for (let i = 0; i < bon.length; i++) if (/\d/.test(bon[i])) positions.push(i);
    if (!positions.length) return;
    const i = choix(positions);
    const chiffre = bon[i];
    const mauvais = bon.slice(0, i) + String((parseInt(chiffre, 10) + 1 + entier(0, 7)) % 10) + bon.slice(i + 1);
    essais++;
    if (mauvais !== bon && !P.valeursIdentiques(m, mauvais)) detectes++;
  });
  assert.ok(essais > 500, "trop peu d'essais : " + essais);
  assert.strictEqual(detectes, essais, detectes + " detectes sur " + essais);
});

test("motifs de profil : une valeur propre au site est protegee", function () {
  P.ajouterMotifs([{ type: "REF", motif: "CLIENT-[A-Z]{3}\\d{2}" }]);
  const p = P.proteger("Votre numero est CLIENT-ABC12 merci");
  assert.ok(p.texte.indexOf("CLIENT-ABC12") === -1, p.texte);
  P.ajouterMotifs([]);
});

console.log(ok + " tests reussis");
