// Tests de la couche vocale : ce qui est lu, et ce qui ne l'est jamais. Lancer : node extension/tests/test_voix.js
const assert = require("assert");
const { JSDOM } = require("jsdom");
const Lecture = require("../lecture_vocale.js");
const P = require("../protection.js");
const N = require("../nombres.js");

let ok = 0;
let file = Promise.resolve();
// Les tests passent l'un apres l'autre (certains sont asynchrones)
function test(nom, f) {
  file = file.then(function () {
    return Promise.resolve()
      .then(f)
      .then(function () {
        ok++;
        console.log("ok   " + nom);
      })
      .catch(function (e) {
        console.log("ECHEC " + nom + " : " + e.message);
        process.exitCode = 1;
      });
  });
}
function doc(html) {
  return new JSDOM("<!doctype html><html><body>" + html + "</body></html>").window.document;
}

test("un conteneur de page ne declenche aucune lecture", function () {
  const d = doc('<main tabindex="-1"><h1>Titre</h1><p>Un paragraphe.</p></main>');
  assert.strictEqual(Lecture.texteDe(d.querySelector("main")), "");
  assert.strictEqual(Lecture.texteDe(d.body), "");
  assert.strictEqual(Lecture.texteDe(d.documentElement), "");
});

test("un paragraphe : seulement ce paragraphe", function () {
  const d = doc("<main><h1>Titre</h1><p>Un paragraphe.</p><p>Un autre.</p></main>");
  assert.strictEqual(Lecture.texteDe(d.querySelectorAll("p")[0]), "Un paragraphe.");
});

test("un mot en gras : on lit toute la phrase, pas seulement le mot", function () {
  const d = doc("<p>Votre solde est <b>disponible</b> maintenant.</p>");
  assert.strictEqual(Lecture.texteDe(d.querySelector("b")), "Votre solde est disponible maintenant.");
});

test("un champ : son etiquette, jamais sa valeur", function () {
  const d = doc('<label for="m">Montant a envoyer</label><input id="m" value="25000">');
  assert.strictEqual(Lecture.texteDe(d.getElementById("m")), "Montant a envoyer");
});

test("un champ secret : etiquette seulement, valeur jamais", function () {
  const d = doc('<label>Code PIN <input type="password" value="1234"></label>');
  const t = Lecture.texteDe(d.querySelector("input"));
  assert.ok(t.indexOf("1234") === -1);
  assert.strictEqual(t, "Code PIN");
});

test("un bouton : son texte", function () {
  const d = doc('<main><button type="button">Confirmer</button></main>');
  assert.strictEqual(Lecture.texteDe(d.querySelector("button")), "Confirmer");
});

test("zone ignoree : rien", function () {
  const d = doc('<div data-safinum-ignore><p>Interne</p></div>');
  assert.strictEqual(Lecture.texteDe(d.querySelector("p")), "");
});

test("ordre de lecture : paragraphes, boutons et champs, sans conteneur", function () {
  const d = doc('<main><h1>Titre</h1><p>Texte un.</p><label for="a">Nom</label><input id="a"><button>Valider</button></main>');
  const l = Lecture.blocsLisibles(d, false, true).map(function (b) { return b.texte; });
  assert.ok(l.indexOf("Texte un.") !== -1 && l.indexOf("Valider") !== -1);
  assert.ok(l.every(function (t) { return t.indexOf("Titre Texte") === -1; }), "un conteneur a ete lu");
});

// Voix : simulation de speechSynthesis
function installerVoix() {
  const dit = [];
  global.speechSynthesis = { speak: function (u) { dit.push({ texte: u.text, lang: u.lang }); setTimeout(u.onend, 0); }, cancel: function () {}, pause: function () {}, resume: function () {} };
  global.SpeechSynthesisUtterance = function (t) { this.text = t; };
  global.SafinumProtection = P;
  global.SafinumNombres = N;
  global.chrome = { runtime: { sendMessage: function (m, cb) { global.__tts.push(m); cb({ erreur: "x" }); } } };
  global.__tts = [];
  delete require.cache[require.resolve("../voix.js")];
  const src = require("fs").readFileSync(require("path").join(__dirname, "..", "voix.js"), "utf8");
  const V = new Function(src + "; return SafinumVoix;")();
  return { V: V, dit: dit };
}

test("un montant est lu en mots, lentement, puis repete une fois", async function () {
  const v = installerVoix();
  await v.V.lire("Transfert de 25 000 FCFA effectué.", "fr");
  const t = v.dit.map(function (x) { return x.texte; });
  assert.ok(t.some(function (x) { return x.indexOf("vingt-cinq mille francs CFA") !== -1; }), t.join("|"));
  assert.ok(t.some(function (x) { return x.indexOf("Je répète") !== -1 && x.indexOf("vingt-cinq mille") !== -1; }));
  assert.ok(t.every(function (x) { return !/\d/.test(x); }), "un chiffre est lu tel quel : " + t.join("|"));
});

test("aucune requete de voix serveur ne contient un montant, un chiffre ou une valeur", async function () {
  const v = installerVoix();
  v.V.voixServeur(true);
  v.V.configurerLangues([{ code: "pcm", voix: { repli: "en" } }]);
  await v.V.lire("Transfert de 25 000 FCFA vers Jean K. le 12/11/2026. Merci beaucoup.", "pcm");
  global.__tts.forEach(function (m) {
    assert.ok(!/\d/.test(m.texte), "chiffre envoye : " + m.texte);
    assert.ok(P.trouver(m.texte).length === 0, "valeur envoyee : " + m.texte);
  });
});

test("voix de remplacement annoncee une seule fois par langue", async function () {
  const v = installerVoix();
  let appels = 0;
  v.V.surRemplacement(function () { appels++; });
  v.V.configurerLangues([{ code: "pcm", voix: { repli: "en" } }]);
  await v.V.lire("Hello", "pcm");
  await v.V.lire("Hello again", "pcm");
  assert.strictEqual(appels, 1);
  assert.ok(v.dit.some(function (x) { return /Replacement voice/.test(x.texte); }));
});

test("Fulfulde : voix francaise de repli, mention experimentale a la voix", async function () {
  const v = installerVoix();
  v.V.configurerLangues([{ code: "fub", voix: { repli: "fr" } }]);
  await v.V.lire("Ceede", "fub");
  assert.ok(v.dit.some(function (x) { return /expérimentale/.test(x.texte) && x.lang === "fr-FR"; }));
});

test("long texte : lu phrase par phrase, interruptible", async function () {
  const v = installerVoix();
  const long = Array.from({ length: 12 }, function (_, i) { return "Phrase numero " + i + " du texte explicatif long."; }).join(" ");
  assert.ok(long.length > 300);
  assert.ok(v.V.phrases(long).length >= 12);
  const lecture = v.V.lire(long, "fr");
  v.V.arreter();
  await lecture;
  assert.ok(v.dit.length < 12, "la lecture ne s'est pas arretee : " + v.dit.length);
});

test("voix desactivee (lecteur d'ecran present) : silence", async function () {
  const v = installerVoix();
  v.V.desactiver(true);
  await v.V.lire("Bonjour", "fr");
  assert.strictEqual(v.dit.length, 0);
});

test("mode sans le son : silence", async function () {
  const v = installerVoix();
  v.V.muet(true);
  await v.V.lire("Bonjour", "fr");
  assert.strictEqual(v.dit.length, 0);
});

file.then(function () { console.log(ok + " tests reussis"); });
