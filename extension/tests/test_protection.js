// Lancer : node extension/tests/test_protection.js
const assert = require("assert");
const P = require("../protection.js");
const N = require("../nombres.js");

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

// Les 9 messages de test du cahier des charges (section 9.2)
const MESSAGES = [
  ["Votre solde disponible est de 125 400 FCFA.", ["125 400 FCFA"]],
  ["Transfert de 25 000 FCFA vers Jean K. effectué. Frais : 250 FCFA.", ["25 000 FCFA", "Jean K.", "250 FCFA"]],
  ["Your transaction has been recorded. Amount: 10,000 XAF.", ["10,000 XAF"]],
  ["Votre transaction a été validée.", []],
  ["Solde insuffisant pour effectuer cette opération.", []],
  ["Code PIN incorrect. Il vous reste 2 tentatives.", ["2"]],
  ["Attention : ne communiquez jamais votre code à un tiers.", []],
  ["Confirmer le transfert de 50 000 FCFA à Marie T. ? Frais : 500 FCFA. Total : 50 500 FCFA.", ["50 000 FCFA", "Marie T.", "500 FCFA", "50 500 FCFA"]],
  ["Votre demande est en cours de traitement. Veuillez patienter 24 heures.", ["24"]],
];

MESSAGES.forEach(function (m, i) {
  test("message " + (i + 1) + " : valeurs protegees puis restaurees", function () {
    const p = P.proteger(m[0]);
    m[1].forEach(function (v) {
      assert.ok(Object.values(p.valeurs).includes(v), "valeur non protegee : " + v + " dans " + p.texte);
      assert.ok(p.texte.indexOf(v) === -1 || v === "2" || v === "24", "valeur encore visible : " + v);
    });
    // On simule un 'traducteur' qui garde les balises
    const r = P.restaurer("xx " + p.texte + " yy", p.valeurs);
    assert.ok(r.ok);
    assert.ok(P.valeursIdentiques(m[0], r.texte));
  });
});

test("frais reconnus", function () {
  const p = P.proteger("Frais : 250 FCFA");
  assert.ok(p.texte.indexOf("[FRAIS_1]") !== -1, p.texte);
});

test("balise perdue : refus", function () {
  const p = P.proteger("Solde : 1 000 FCFA");
  assert.strictEqual(P.restaurer("Balance", p.valeurs).ok, false);
});

test("balise en double : refus", function () {
  const p = P.proteger("Solde : 1 000 FCFA");
  assert.strictEqual(P.restaurer("[MONTANT_1] et [MONTANT_1]", p.valeurs).ok, false);
});

test("balise inconnue : refus", function () {
  const p = P.proteger("Solde : 1 000 FCFA");
  assert.strictEqual(P.restaurer("[MONTANT_1] [MONTANT_2]", p.valeurs).ok, false);
});

test("balise abimee mais lisible : acceptee", function () {
  const p = P.proteger("Solde : 1 000 FCFA");
  const r = P.restaurer("Balans : [montant 1]", p.valeurs);
  assert.ok(r.ok);
  assert.strictEqual(r.texte, "Balans : 1 000 FCFA");
});

test("difference provoquee detectee", function () {
  assert.strictEqual(P.valeursIdentiques("Total : 50 500 FCFA", "Total : 50 000 FCFA"), false);
});

test("le signe dollar dans une valeur ne casse pas la restauration", function () {
  const p = P.proteger("Total : $50");
  const r = P.restaurer(p.texte, p.valeurs);
  assert.strictEqual(r.texte, "Total : $50");
});

test("numero de telephone protege", function () {
  const p = P.proteger("Envoyer a +237 655 12 34 56");
  assert.ok(Object.values(p.valeurs).some(function (v) { return v.indexOf("655") !== -1; }));
});

test("nombres en mots (francais)", function () {
  assert.strictEqual(N.fr(25000), "vingt-cinq mille");
  assert.strictEqual(N.fr(125400), "cent vingt-cinq mille quatre cents");
  assert.strictEqual(N.fr(250), "deux cent cinquante");
  assert.strictEqual(N.fr(50500), "cinquante mille cinq cents");
  assert.strictEqual(N.fr(80), "quatre-vingts");
  assert.strictEqual(N.fr(81), "quatre-vingt-un");
  assert.strictEqual(N.fr(71), "soixante et onze");
  assert.strictEqual(N.fr(200), "deux cents");
  assert.strictEqual(N.fr(1000), "mille");
  assert.strictEqual(N.fr(1000000), "un million");
});

test("nombres en mots (anglais)", function () {
  assert.strictEqual(N.en(25000), "twenty-five thousand");
  assert.strictEqual(N.en(10000), "ten thousand");
});

test("formats ambigus normalises", function () {
  assert.strictEqual(N.lireNombre("10,000").entier, 10000);
  assert.strictEqual(N.lireNombre("10.000").entier, 10000);
  assert.strictEqual(N.lireNombre("25 000").entier, 25000);
  assert.strictEqual(N.lireNombre("12,50").entier, 12);
  assert.strictEqual(N.lireNombre("12,50").centimes, 50);
});

test("montant en mots avec devise", function () {
  assert.strictEqual(N.montantEnMots("25 000 FCFA", "fr"), "vingt-cinq mille francs CFA");
  assert.strictEqual(N.montantEnMots("10,000 XAF", "en"), "ten thousand CFA francs");
});

console.log(ok + " tests reussis");
