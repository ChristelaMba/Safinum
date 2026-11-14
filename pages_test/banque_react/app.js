// Application a page unique React (sans JSX, sans compilation). Le texte est reecrit par React a chaque changement d'etat.
(function () {
  var h = React.createElement;
  var useState = React.useState;
  var T = BanqueSimulee.TEXTES.fr;
  var NOMS = ["Jean K.", "Marie T.", "Paul N."];

  function fmt(n) {
    return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, " ") + " FCFA";
  }
  function frais(m) {
    return m <= 25000 ? 250 : m <= 100000 ? 500 : 1000;
  }
  function remplir(modele, v) {
    return modele.replace(/\{(\w)\}/g, function (_, k) { return v[k]; });
  }

  function Message(p) {
    return h("p", { className: "message " + (p.type || ""), role: p.type ? "alert" : undefined }, p.texte);
  }

  function Accueil(p) {
    return h("div", null,
      h("h2", null, T.titre),
      h("div", { className: "carte" }, h("dl", { className: "liste-valeurs" }, h("dt", null, T.solde), h("dd", null, fmt(p.solde)))),
      h(Message, { texte: remplir(T.msgSolde, { S: fmt(p.solde) }) }),
      h("p", null, "Consultez ", h("a", { href: "#conditions" }, "nos conditions"), " : le solde affiché est ", h("strong", null, "disponible"), " immédiatement."),
      h("p", null, "Plafond du jour : ", h("span", { className: "m" }, "200"), " ", h("span", { className: "m" }, "000"), " FCFA, soit ", h("b", null, "1 %"), " de moins qu'hier."),
      h("button", { type: "button", className: "action", title: T.boutonFrais, onClick: function () { p.aller("frais"); } }, T.boutonFrais),
      h("button", { type: "button", className: "action", onClick: function () { p.aller("transfert"); } }, T.boutonEnvoyer)
    );
  }

  function Tableau(p) {
    return h("table", null, h("tbody", null, p.lignes.map(function (l, i) {
      return h("tr", { key: i }, h("th", { scope: "row" }, l[0]), h("td", { className: "valeur" }, l[1]));
    })));
  }

  function Frais() {
    var lignes = [[T.t25, "250 FCFA"], [T.t100, "500 FCFA"], [T.tPlus, "1 000 FCFA"], [T.retrait, "500 FCFA"]];
    return h("div", null,
      h("h2", null, T.titreFrais),
      h("table", null,
        h("thead", null, h("tr", null, h("th", null, T.operation), h("th", null, T.colFrais))),
        h("tbody", null, lignes.map(function (l, i) { return h("tr", { key: i }, h("td", null, l[0]), h("td", { className: "valeur" }, l[1])); }))),
      h("p", { className: "discret" }, T.noteFrais));
  }

  function Transfert(p) {
    var s1 = useState("");
    var erreur = s1[0], setErreur = s1[1];
    var s2 = useState(3);
    var tentatives = s2[0], setTentatives = s2[1];
    function envoyer(e) {
      e.preventDefault();
      var f = e.target;
      var montant = parseInt(f.montant.value, 10);
      if (!montant || montant < 1) return setErreur({ texte: T.montantInvalide, type: "erreur" });
      if (f.pin.value !== "1234") {
        var n = Math.max(0, tentatives - 1);
        setTentatives(n);
        return setErreur(n === 0 ? { texte: T.bloque, type: "alerte" } : { texte: remplir(T.pinFaux, { N: n }), type: "erreur" });
      }
      p.preparer({ beneficiaire: f.beneficiaire.value, montant: montant, frais: frais(montant), total: montant + frais(montant) });
    }
    return h("div", null,
      h("h2", null, T.titreEnvoi),
      h("form", { onSubmit: envoyer, noValidate: true },
        h("label", { className: "champ" }, h("span", null, T.benef), h("select", { name: "beneficiaire" }, NOMS.map(function (n) { return h("option", { key: n }, n); }))),
        h("label", { className: "champ" }, h("span", null, T.montant), h("input", { name: "montant", type: "number", inputMode: "numeric", min: 1, defaultValue: 25000, placeholder: T.montantPh })),
        h("label", { className: "champ" }, h("span", null, T.mdp), h("input", { name: "motdepasse", type: "password", autoComplete: "current-password" })),
        h("label", { className: "champ" }, h("span", null, T.pin), h("input", { name: "pin", type: "password", inputMode: "numeric", autoComplete: "off", maxLength: 4 })),
        h("label", { className: "champ" }, h("span", null, T.otp), h("input", { name: "otp", type: "text", inputMode: "numeric", autoComplete: "one-time-code", maxLength: 6 })),
        h("p", { className: "discret" }, T.pinAide),
        erreur ? h(Message, erreur) : null,
        h("button", { type: "submit", className: "action", title: T.continuerTitre }, T.continuer)));
  }

  function Recap(p) {
    var b = p.brouillon;
    if (b.total > p.solde) {
      return h("div", null, h("h2", null, T.titreRecap), h(Message, { texte: T.insuffisant, type: "erreur" }),
        h("button", { type: "button", className: "action secondaire", onClick: function () { p.aller("transfert"); } }, T.modifier));
    }
    return h("div", null, h("h2", null, T.titreRecap),
      h(Message, { texte: remplir(T.recapMsg, { M: fmt(b.montant), B: b.beneficiaire, F: fmt(b.frais), T: fmt(b.total) }) }),
      h("button", { type: "button", className: "action", onClick: p.confirmer }, T.confirmer),
      h("button", { type: "button", className: "action secondaire", onClick: function () { p.aller("transfert"); } }, T.annuler));
  }

  function Resultat(p) {
    var d = p.dernier;
    return h("div", null, h("h2", null, T.titreRes),
      h(Message, { texte: remplir(T.resMsg, { M: fmt(d.montant), B: d.beneficiaire, F: fmt(d.frais) }) }),
      h(Message, { texte: T.valide }),
      h(Message, { texte: remplir(T.msgSolde, { S: fmt(p.solde) }) }),
      h("button", { type: "button", className: "action secondaire", onClick: function () { p.aller("accueil"); } }, T.retour));
  }

  function Messages() {
    var s = useState(null);
    return h("div", null, h("h2", null, T.titreMsg), h("p", { className: "discret" }, T.aideMsg),
      h("div", { "aria-live": "polite" }, s[0] ? h(Message, { texte: s[0][0], type: s[0][1] }) : null),
      T.boutonsMsg.map(function (t, i) { return h("button", { key: i, type: "button", className: "action secondaire", onClick: function () { s[1](T.msgs[i]); } }, t); }));
  }

  function Jury() {
    var s = useState("");
    var t = useState("");
    return h("div", null, h("h2", null, T.titreJury), h("p", { className: "discret" }, T.aideJury),
      h("label", { className: "champ" }, h("span", null, T.messageLib), h("textarea", { rows: 4, value: s[0], onChange: function (e) { s[1](e.target.value); } })),
      h("button", { type: "button", className: "action", onClick: function () { t[1](s[0].trim()); } }, T.afficherMsg),
      h("div", { "aria-live": "polite" }, t[0] ? h(Message, { texte: t[0] }) : null));
  }

  function App() {
    var sv = useState("accueil");
    var vue = sv[0], setVue = sv[1];
    var ss = useState(125400);
    var solde = ss[0], setSolde = ss[1];
    var sb = useState(null);
    var brouillon = sb[0], setBrouillon = sb[1];
    var sd = useState(null);
    var dernier = sd[0], setDernier = sd[1];
    var IDS = ["accueil", "compte", "frais", "transfert", "messages", "jury"];
    var courant = vue === "recapitulatif" ? "transfert" : vue === "resultat" ? "accueil" : vue;
    var corps;
    if (vue === "accueil") corps = h(Accueil, { solde: solde, aller: setVue });
    else if (vue === "compte") corps = h("div", null, h("h2", null, T.titreCompte), h(Tableau, { lignes: T.compteLignes }));
    else if (vue === "frais") corps = h(Frais);
    else if (vue === "transfert") corps = h(Transfert, { preparer: function (b) { setBrouillon(b); setVue("recapitulatif"); } });
    else if (vue === "recapitulatif") corps = h(Recap, { brouillon: brouillon, solde: solde, aller: setVue, confirmer: function () { setSolde(solde - brouillon.total); setDernier(brouillon); setVue("resultat"); } });
    else if (vue === "resultat") corps = h(Resultat, { dernier: dernier, solde: solde, aller: setVue });
    else if (vue === "messages") corps = h(Messages);
    else corps = h(Jury);
    return h("div", { className: "appli" },
      h("header", { className: "entete" }, h("h1", { className: "marque" }, T.marque), h("p", { className: "sous-titre" }, T.sousTitre),
        h("nav", { className: "menu", "aria-label": T.menuLabel }, IDS.map(function (id, i) {
          return h("button", { key: id, type: "button", "aria-current": courant === id ? "page" : undefined, onClick: function () { setVue(id); } }, T.menu[i]);
        }))),
      h("main", { className: "contenu", tabIndex: -1 }, corps));
  }

  ReactDOM.createRoot(document.getElementById("racine")).render(h(App));
})();
