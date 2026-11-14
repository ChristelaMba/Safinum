// Banque simulee dans un composant web avec Shadow DOM ouvert.
// L'en-tete est un deuxieme composant, lui aussi avec son Shadow DOM, pour tester l'imbrication.
class BanqueEntete extends HTMLElement {
  connectedCallback() {
    var sr = this.attachShadow({ mode: "open" });
    sr.innerHTML =
      '<link rel="stylesheet" href="../commun/style.css">' +
      '<header class="entete"><h1 class="marque">Mon Argent Mobile</h1>' +
      '<p class="sous-titre">Application simulée pour la démonstration. Aucune vraie opération.</p>' +
      '<nav class="menu" aria-label="Menu principal"></nav></header>';
  }
}

class BanqueApp extends HTMLElement {
  connectedCallback() {
    var sr = this.attachShadow({ mode: "open" });
    sr.innerHTML =
      '<link rel="stylesheet" href="../commun/style.css">' +
      '<div class="appli"><banque-entete></banque-entete><main id="contenu" class="contenu" tabindex="-1"></main></div>';
    var entete = sr.querySelector("banque-entete");
    var menu = entete.shadowRoot.querySelector(".menu");
    // Les clics du menu (dans le Shadow DOM de l'en-tete) remontent jusqu'a la racine du composant
    BanqueSimulee.demarrer({ racine: sr, menu: menu, lang: "fr" });
  }
}

customElements.define("banque-entete", BanqueEntete);
customElements.define("banque-app", BanqueApp);
