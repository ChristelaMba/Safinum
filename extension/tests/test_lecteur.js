// Lancer : node extension/tests/test_lecteur.js   (demande jsdom : npm install a la racine)
const assert = require("assert");
const { JSDOM } = require("jsdom");
const L = require("../lecteur.js");

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

function page(html) {
  const dom = new JSDOM("<!doctype html><html><head><title>Ma banque</title></head><body>" + html + "</body></html>");
  const doc = dom.window.document;
  return {
    doc: doc,
    lecteur: L.creer({
      document: doc,
      estCache: function () {
        return false;
      },
      langue: function () {
        return "pcm";
      },
    }),
  };
}

function textes(doc) {
  return doc.body.textContent.replace(/\s+/g, " ").trim();
}

function sansAttributs(r) {
  return r.blocs.filter(function (b) {
    return !b.attribut;
  });
}

// Faux traducteur : remplace des mots, garde balises et marqueurs
function faux(dico) {
  return function (texte) {
    let t = texte;
    Object.keys(dico).forEach(function (k) {
      t = t.split(k).join(dico[k]);
    });
    return t;
  };
}

test("une phrase avec du gras et un lien est un seul bloc", function () {
  const p = page('<p>Votre solde est <b>disponible</b> sur <a href="/x">votre compte</a>.</p>');
  const blocs = sansAttributs(p.lecteur.lire());
  assert.strictEqual(blocs.length, 1);
  assert.strictEqual(blocs[0].texte, "Votre solde est <s1>disponible</s1> sur <s2>votre compte</s2>.");
});

test("traduction d'un bloc avec marqueurs : seuls les textes changent", function () {
  const p = page('<p>Votre solde est <b>disponible</b> sur <a href="/x">votre compte</a>.</p>');
  const b = sansAttributs(p.lecteur.lire())[0];
  const a = p.doc.querySelector("a");
  const gras = p.doc.querySelector("b");
  const r = p.lecteur.appliquer(b, "Yu balans na <s1>ready</s1> for <s2>yu akaunt</s2>.");
  assert.ok(r.ok, r.raison);
  assert.strictEqual(p.doc.querySelector("a"), a);
  assert.strictEqual(p.doc.querySelector("b"), gras);
  assert.strictEqual(a.getAttribute("href"), "/x");
  assert.strictEqual(textes(p.doc), "Yu balans na ready for yu akaunt.");
});

test("valeur coupee par du HTML : une seule valeur, intacte", function () {
  const p = page("<p>Solde : <span>125</span> <span>400</span> FCFA disponible</p>");
  const b = sansAttributs(p.lecteur.lire())[0];
  assert.ok(/\[MONTANT_1\]/.test(b.texte), b.texte);
  assert.ok(b.texte.indexOf("125") === -1 && b.texte.indexOf("FCFA") === -1, b.texte);
  const r = p.lecteur.appliquer(b, "Balans : [MONTANT_1] ready");
  assert.ok(r.ok, r.raison);
  assert.ok(textes(p.doc).indexOf("125 400 FCFA") !== -1, textes(p.doc));
  assert.ok(textes(p.doc).indexOf("ready") !== -1);
});

test("valeur dans un seul element : balise puis restauration", function () {
  const p = page("<p>Total : <strong>50 500 FCFA</strong> a payer</p>");
  const b = sansAttributs(p.lecteur.lire())[0];
  assert.ok(b.texte.indexOf("50") === -1, b.texte);
  const r = p.lecteur.appliquer(b, "Total : <s1>[MONTANT_1]</s1> fo pay");
  assert.ok(r.ok, r.raison);
  assert.strictEqual(textes(p.doc), "Total : 50 500 FCFA fo pay");
});

test("marqueurs dans le desordre : refuses", function () {
  const p = page("<p>Un <b>deux</b> trois <i>quatre</i></p>");
  const b = sansAttributs(p.lecteur.lire())[0];
  assert.strictEqual(p.lecteur.calculer(b, "A <s2>b</s2> c <s1>d</s1>").ok, false);
});

test("marqueur perdu, double ou invente : refuses", function () {
  const p = page("<p>Un <b>deux</b> trois</p>");
  const b = sansAttributs(p.lecteur.lire())[0];
  assert.strictEqual(p.lecteur.calculer(b, "A b c").ok, false);
  assert.strictEqual(p.lecteur.calculer(b, "A <s1>b</s1> <s1>c</s1>").ok, false);
  assert.strictEqual(p.lecteur.calculer(b, "A <s1>b</s1> <s2>c</s2>").ok, false);
});

test("balise de valeur perdue : refusee, page inchangee", function () {
  const p = page("<p>Frais : 250 FCFA</p>");
  const avant = textes(p.doc);
  const b = sansAttributs(p.lecteur.lire())[0];
  const r = p.lecteur.appliquer(b, "Fee : rien");
  assert.strictEqual(r.ok, false);
  assert.strictEqual(textes(p.doc), avant);
});

test("chiffre ajoute par le traducteur : refuse", function () {
  const p = page("<p>Votre transfert est confirme.</p>");
  const b = sansAttributs(p.lecteur.lire())[0];
  assert.strictEqual(p.lecteur.calculer(b, "Yu transfa don confam 500.").ok, false);
});

test("lien de menu seul : l'enveloppe en ligne est retiree", function () {
  const p = page('<ul><li><a href="/a">Accueil</a></li></ul>');
  const b = sansAttributs(p.lecteur.lire())[0];
  assert.strictEqual(b.texte, "Accueil");
});

test("arret : le HTML revient exactement comme avant", function () {
  const html = '<h1>Bienvenue</h1><p>Solde : <span>125</span> <span>400</span> FCFA et <a href="/x">voir</a></p><ul><li>Envoyer</li></ul>';
  const p = page(html);
  const avant = p.doc.body.innerHTML;
  sansAttributs(p.lecteur.lire()).forEach(function (b) {
    p.lecteur.appliquer(b, faux({ Bienvenue: "Welcom", Envoyer: "Sen", " et ": " an ", voir: "si" })(b.texte));
  });
  assert.notStrictEqual(p.doc.body.innerHTML, avant);
  p.lecteur.restaurer();
  assert.strictEqual(p.doc.body.innerHTML, avant);
});

test("voir l'original et retour a la traduction", function () {
  const p = page("<p>Bonjour</p>");
  const b = sansAttributs(p.lecteur.lire())[0];
  p.lecteur.appliquer(b, "Hello o");
  assert.strictEqual(textes(p.doc), "Hello o");
  p.lecteur.afficherOriginal(true);
  assert.strictEqual(textes(p.doc), "Bonjour");
  p.lecteur.afficherOriginal(false);
  assert.strictEqual(textes(p.doc), "Hello o");
});

test("attributs : placeholder, title, aria-label, alt, bouton submit. Jamais la value d'un champ", function () {
  const p = page(
    '<input id="a" placeholder="Votre montant" value="Ma saisie"><input type="submit" value="Envoyer"><button title="Fermer la fenetre">x</button><img alt="Logo de la banque" src="x.png"><span aria-label="Solde du compte">s</span>'
  );
  const blocs = p.lecteur.lire().blocs;
  const noms = blocs
    .filter(function (b) {
      return b.attribut;
    })
    .map(function (b) {
      return b.attribut.nom;
    })
    .sort();
  assert.deepStrictEqual(noms, ["#titre", "alt", "aria-label", "placeholder", "title", "value"]);
  const valeur = blocs.filter(function (b) {
    return b.attribut && b.attribut.nom === "value";
  })[0];
  assert.strictEqual(valeur.attribut.el.getAttribute("type"), "submit");
  assert.strictEqual(p.doc.getElementById("a").value, "Ma saisie");
});

test("texte des options lu ; value des options jamais changee", function () {
  const p = page('<select><option value="u1">Choisir un beneficiaire</option></select>');
  const b = sansAttributs(p.lecteur.lire())[0];
  assert.strictEqual(b.texte, "Choisir un beneficiaire");
  p.lecteur.appliquer(b, "Pik wan pesin");
  assert.strictEqual(p.doc.querySelector("option").getAttribute("value"), "u1");
});

test("Shadow DOM ouvert lu", function () {
  const p = page('<div id="h"></div>');
  const sr = p.doc.getElementById("h").attachShadow({ mode: "open" });
  sr.innerHTML = "<p>Voulez-vous continuer ?</p>";
  const lus = sansAttributs(p.lecteur.lire()).map(function (b) {
    return b.texte;
  });
  assert.deepStrictEqual(lus, ["Voulez-vous continuer ?"]);
});

test("ignores : script, style, textarea, code, contenteditable, data-safinum-ignore", function () {
  const p = page(
    '<script>var x = "Texte du script";</script><style>.a{}</style><textarea>Notes</textarea><code>Code ici</code><div contenteditable="true">Editable</div><div data-safinum-ignore>Ignore moi</div><p>Visible</p>'
  );
  const lus = sansAttributs(p.lecteur.lire()).map(function (b) {
    return b.texte;
  });
  assert.deepStrictEqual(lus, ["Visible"]);
});

test("champs secrets : la valeur n'est jamais lue ni touchee", function () {
  const p = page(
    '<label for="p">Code PIN</label><input id="p" type="password" value="1234"><input name="otp" inputmode="numeric" value="998877"><input autocomplete="one-time-code" value="55"><input name="montant" value="25000">'
  );
  p.lecteur.lire().blocs.forEach(function (b) {
    assert.ok(b.texte.indexOf("1234") === -1 && b.texte.indexOf("998877") === -1);
  });
  assert.strictEqual(p.doc.getElementById("p").value, "1234");
});

test("iframe de meme origine lue", function () {
  const p = page('<iframe id="f"></iframe>');
  const f = p.doc.getElementById("f");
  f.contentDocument.open();
  f.contentDocument.write("<html><body><p>Dans le cadre</p></body></html>");
  f.contentDocument.close();
  const r = p.lecteur.lire();
  assert.ok(
    r.blocs.some(function (b) {
      return b.texte === "Dans le cadre";
    })
  );
});

test("repli : un morceau par zone de texte", function () {
  const p = page("<p>Un <b>deux</b> trois <i>quatre</i></p>");
  const b = sansAttributs(p.lecteur.lire())[0];
  const morceaux = p.lecteur.decouper(b);
  assert.deepStrictEqual(
    morceaux.map(function (m) {
      return m.texte;
    }),
    ["Un", "deux", "trois", "quatre"]
  );
  morceaux.forEach(function (m, i) {
    assert.ok(p.lecteur.appliquer(m, ["A", "B", "C", "D"][i]).ok);
  });
  assert.strictEqual(textes(p.doc), "A B C D");
});

test("suffixe 'original entre parentheses' ajoute au dernier texte", function () {
  const p = page("<p>Attention : <b>jamais</b> de code.</p>");
  const b = sansAttributs(p.lecteur.lire())[0];
  const r = p.lecteur.appliquer(b, "Take kia : <s1>neva</s1> tell code.", " (Original : Attention : jamais de code.)");
  assert.ok(r.ok, r.raison);
  assert.ok(textes(p.doc).indexOf("(Original : Attention : jamais de code.)") !== -1, textes(p.doc));
});

test("un bloc deja traduit et inchange n'est plus relu", function () {
  const p = page("<p>Bonjour a tous</p>");
  const b = sansAttributs(p.lecteur.lire())[0];
  p.lecteur.appliquer(b, "Hello for all");
  assert.strictEqual(sansAttributs(p.lecteur.lire()).length, 0);
});

test("un texte reecrit par la page est relu a partir de son nouveau contenu", function () {
  const p = page("<p>Bonjour a tous</p>");
  const b = sansAttributs(p.lecteur.lire())[0];
  p.lecteur.appliquer(b, "Hello for all");
  p.doc.querySelector("p").firstChild.nodeValue = "Merci beaucoup";
  const r = sansAttributs(p.lecteur.lire());
  assert.strictEqual(r.length, 1);
  assert.strictEqual(r[0].texte, "Merci beaucoup");
});

test("aucun attribut fonctionnel modifie (href, id, name, data-*, value)", function () {
  const p = page(
    '<form id="f" data-x="1"><label for="n">Nom du beneficiaire</label><input id="n" name="nom" value="Jean"><a id="l" href="/go" data-k="v">Continuer</a></form>'
  );
  const avant = p.doc.body.innerHTML;
  sansAttributs(p.lecteur.lire()).forEach(function (b) {
    p.lecteur.appliquer(b, faux({ "Nom du beneficiaire": "Nem", Continuer: "Go on" })(b.texte));
  });
  const apres = p.doc.body.innerHTML;
  ['href="/go"', 'data-k="v"', 'name="nom"', 'id="l"', 'value="Jean"', 'data-x="1"'].forEach(function (a) {
    assert.ok(apres.indexOf(a) !== -1, "attribut perdu : " + a);
  });
  assert.notStrictEqual(apres, avant);
});

test("texte en majuscules, avec retours a la ligne, emoji et entites : un seul bloc propre", function () {
  const p = page("<p>VOTRE COMPTE &amp; VOS FRAIS\n   SONT   BLOQUES &#x2705; &eacute;t&eacute;</p>");
  const b = sansAttributs(p.lecteur.lire())[0];
  assert.strictEqual(b.texte, "VOTRE COMPTE & VOS FRAIS SONT BLOQUES ✅ été");
  const r = p.lecteur.appliquer(b, "YU AKAUNT BLOK ✅");
  assert.ok(r.ok, r.raison);
  p.lecteur.restaurer();
  assert.ok(p.doc.querySelector("p").textContent.indexOf("BLOQUES") !== -1);
});

test("texte tres long : le bloc est envoye entier (le serveur le decoupe par phrases)", function () {
  const long = Array.from({ length: 40 }, function (_, i) { return "Phrase numero " + i + " du long texte."; }).join(" ");
  const p = page("<p>" + long + "</p>");
  const b = sansAttributs(p.lecteur.lire())[0];
  assert.ok(b.texte.length > 600);
});

console.log(ok + " tests reussis");
