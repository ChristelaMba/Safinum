/*
 * auto.js - pour la demonstration en ligne : charge SAFINUM tout seul sur les pages de test.
 * Aucune installation pour le jury. Ouvrir la page avec ?safinum=1 (le choix est retenu pour la session) ;
 * ?safinum=0 le coupe. Sans effet si l'extension SAFINUM est deja presente.
 */
(function () {
  try {
    var m = /[?&]safinum=([01])/.exec(location.search);
    if (m) sessionStorage.setItem("safinum_auto", m[1]);
    if (sessionStorage.getItem("safinum_auto") !== "1") return;
  } catch (e) { return; }
  window.SAFINUM_URL = location.origin;
  var s = document.createElement("script");
  s.src = "/safinum-inject.js";
  document.head.appendChild(s);
})();
