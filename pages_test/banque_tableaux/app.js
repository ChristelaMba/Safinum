// Banque simulee, pages denses : 100 operations, pagination, onglets, fenetre modale
BanqueSimulee.demarrer({
  racine: document.querySelector(".appli"),
  menu: document.querySelector(".menu"),
  lang: "fr",
});

(function () {
  var NOMS = ["Jean K.", "Marie T.", "Paul N.", "Awa B.", "Samuel E."];
  var STATUTS = ["Réussi", "En cours", "Refusé"];
  var operations = [];
  for (var i = 0; i < 100; i++) {
    var type = i % 3 === 0 ? "retrait" : "envoi";
    var montant = 1000 + ((i * 7919) % 90000);
    operations.push({
      type: type,
      date: ("0" + (1 + (i % 28))).slice(-2) + "/" + ("0" + (1 + (i % 12))).slice(-2) + "/2026",
      libelle: type === "retrait" ? "Retrait chez un agent" : "Transfert d'argent",
      benef: type === "retrait" ? "-" : NOMS[i % NOMS.length],
      montant: String(montant).replace(/\B(?=(\d{3})+(?!\d))/g, " ") + " FCFA",
      frais: montant > 25000 ? "500 FCFA" : "250 FCFA",
      statut: STATUTS[i % 3],
    });
  }
  var filtre = "tout";
  var page = 0;
  var PAR_PAGE = 10;

  function liste() {
    return operations.filter(function (o) {
      return filtre === "tout" || o.type === filtre;
    });
  }

  function rendre() {
    var l = liste();
    var nb = Math.ceil(l.length / PAR_PAGE);
    page = Math.min(page, nb - 1);
    var corps = document.getElementById("lignes");
    corps.innerHTML = l
      .slice(page * PAR_PAGE, (page + 1) * PAR_PAGE)
      .map(function (o) {
        return "<tr><td>" + o.date + "</td><td>" + o.libelle + "</td><td>" + o.benef + '</td><td class="valeur">' + o.montant + '</td><td class="valeur">' + o.frais + "</td><td>" + o.statut + "</td></tr>";
      })
      .join("");
    document.getElementById("page-info").textContent = "Page " + (page + 1) + " sur " + nb;
  }

  document.getElementById("precedent").addEventListener("click", function () {
    page = Math.max(0, page - 1);
    rendre();
  });
  document.getElementById("suivant").addEventListener("click", function () {
    page = Math.min(Math.ceil(liste().length / PAR_PAGE) - 1, page + 1);
    rendre();
  });
  Array.prototype.forEach.call(document.querySelectorAll("[role=tab]"), function (t) {
    t.addEventListener("click", function () {
      Array.prototype.forEach.call(document.querySelectorAll("[role=tab]"), function (x) {
        x.setAttribute("aria-selected", String(x === t));
      });
      filtre = t.dataset.type;
      page = 0;
      rendre();
    });
  });
  document.getElementById("ouvrir-modale").addEventListener("click", function () {
    document.getElementById("modale").classList.add("ouvert");
  });
  document.getElementById("fermer-modale").addEventListener("click", function () {
    document.getElementById("modale").classList.remove("ouvert");
  });
  rendre();
})();
