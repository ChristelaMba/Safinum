// Jeu d'or : valeurs preservees a 100 %. Lancer : node extension/tests/test_golden.js
const assert = require("assert");
const path = require("path");
const P = require("../protection.js");
const gold = require(path.join(__dirname, "..", "..", "serveur", "tests", "golden.json"));

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

test("jeu d'or : au moins 40 messages", function () {
  assert.ok(gold.length >= 40, String(gold.length));
});

test("jeu d'or : toutes les valeurs attendues sont protegees, aucune n'est envoyee", function () {
  let manque = [];
  gold.forEach(function (m) {
    const p = P.proteger(m.texte);
    const trouvees = Object.values(p.valeurs);
    m.valeurs.forEach(function (v) {
      if (trouvees.indexOf(v) === -1) manque.push(v + " dans : " + m.texte);
      if (p.texte.indexOf(v) !== -1) manque.push("visible " + v);
    });
  });
  assert.deepStrictEqual(manque, []);
});

test("jeu d'or : proteger puis restaurer redonne chaque message a l'identique", function () {
  gold.forEach(function (m) {
    const p = P.proteger(m.texte);
    const r = P.restaurer(p.texte, p.valeurs);
    assert.ok(r.ok && r.texte === m.texte, m.texte);
  });
});

test("jeu d'or : un chiffre change dans la traduction est toujours detecte", function () {
  let essais = 0;
  gold.forEach(function (m) {
    if (!m.valeurs.length) return;
    const bon = m.texte;
    const i = bon.search(/\d/);
    if (i < 0) return; // pas de chiffre a modifier (adresse e-mail)
    const mauvais = bon.slice(0, i) + ((parseInt(bon[i], 10) + 1) % 10) + bon.slice(i + 1);
    essais++;
    assert.strictEqual(P.valeursIdentiques(m.texte, mauvais), false, m.texte);
  });
  assert.ok(essais >= 20);
});

test("montant ecrit en lettres : protege comme un montant, restitue a l'identique", function () {
  ["Vous avez envoye vingt mille francs CFA a Jean K.", "Send twenty-five thousand francs now", "Il reste cent vingt-cinq mille quatre cents francs."].forEach(function (m) {
    const p = P.proteger(m);
    assert.ok(/\[MONTANT_\d\]/.test(p.texte), p.texte);
    assert.strictEqual(P.restaurer(p.texte, p.valeurs).texte, m);
    assert.strictEqual(P.valeursIdentiques(m, m.replace("vingt", "trente").replace("twenty", "thirty").replace("cent vingt", "cent trente")), false);
  });
});

test("'et' ou 'and' seuls ne sont pas un montant", function () {
  assert.strictEqual(P.proteger("Ce soir et francs amis").texte, "Ce soir et francs amis");
});

console.log(ok + " tests reussis");
