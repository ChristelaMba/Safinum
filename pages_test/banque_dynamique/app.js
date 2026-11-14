// Banque simulee avec du contenu dynamique
BanqueSimulee.demarrer({
  racine: document.querySelector(".appli"),
  menu: document.querySelector(".menu"),
  lang: "fr",
});

(function () {
  // Minuterie : le texte change chaque seconde (SAFINUM doit la marquer "dynamique" et ne pas la retraduire en boucle)
  var reste = 59;
  var minuterie = document.getElementById("minuterie");
  setInterval(function () {
    reste = reste > 0 ? reste - 1 : 59;
    minuterie.textContent = "00:" + ("0" + reste).slice(-2);
  }, 1000);

  var horloge = document.getElementById("horloge");
  function heure() {
    var d = new Date();
    horloge.textContent = ("0" + d.getHours()).slice(-2) + ":" + ("0" + d.getMinutes()).slice(-2) + ":" + ("0" + d.getSeconds()).slice(-2);
  }
  heure();
  setInterval(heure, 1000);

  // Compteur rapide (plus de 3 changements en 2 secondes)
  var rapide = document.getElementById("rapide");
  var nb = 0;
  setInterval(function () {
    nb++;
    rapide.textContent = String(nb);
  }, 300);

  // Notification qui apparait puis disparait
  var NOTIFS = [
    "Transfert de 5 000 FCFA reçu de Marie T.",
    "Attention : ne communiquez jamais votre code à un tiers.",
    "Votre demande est en cours de traitement. Veuillez patienter 24 heures.",
  ];
  var n = 0;
  document.getElementById("notifier").addEventListener("click", function () {
    var zone = document.getElementById("toasts");
    var t = document.createElement("div");
    t.className = "toast";
    t.textContent = NOTIFS[n % NOTIFS.length];
    n++;
    zone.appendChild(t);
    setTimeout(function () {
      zone.removeChild(t);
    }, 6000);
  });

  // Chargement differe (lazy) : une section apparait apres 1,5 seconde
  setTimeout(function () {
    document.getElementById("differe").innerHTML =
      '<div class="carte"><h2>Offre du jour</h2><p>Envoyez de l\'argent sans frais jusqu\'à <strong>5 000</strong> FCFA avant le <span>30/11/2026</span>.</p></div>';
  }, 1500);
})();
