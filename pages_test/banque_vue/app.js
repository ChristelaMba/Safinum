// Application a page unique Vue 3 (build global avec compilateur de gabarits, sans installation)
(function () {
  var T = BanqueSimulee.TEXTES.fr;

  var GABARIT = [
    '<div class="appli">',
    '  <header class="entete">',
    '    <h1 class="marque">{{ T.marque }}</h1>',
    '    <p class="sous-titre">{{ T.sousTitre }}</p>',
    '    <nav class="menu" :aria-label="T.menuLabel">',
    '      <button v-for="(id, i) in ids" :key="id" type="button" :aria-current="courant === id ? \'page\' : null" @click="vue = id">{{ T.menu[i] }}</button>',
    "    </nav>",
    "  </header>",
    '  <main class="contenu" tabindex="-1">',
    '    <div v-if="vue === \'accueil\'">',
    "      <h2>{{ T.titre }}</h2>",
    '      <div class="carte"><dl class="liste-valeurs"><dt>{{ T.solde }}</dt><dd>{{ fmt(solde) }}</dd></dl></div>',
    '      <p class="message">{{ soldeMsg }}</p>',
    '      <p>Consultez <a href="#conditions">nos conditions</a> : le solde affiché est <strong>disponible</strong> immédiatement.</p>',
    '      <p>Plafond du jour : <span class="m">200</span> <span class="m">000</span> FCFA, soit <b>1 %</b> de moins qu\'hier.</p>',
    '      <button type="button" class="action" :title="T.boutonFrais" @click="vue = \'frais\'">{{ T.boutonFrais }}</button>',
    '      <button type="button" class="action" @click="vue = \'transfert\'">{{ T.boutonEnvoyer }}</button>',
    "    </div>",
    '    <div v-else-if="vue === \'compte\'">',
    "      <h2>{{ T.titreCompte }}</h2>",
    '      <table><tbody><tr v-for="(l, i) in T.compteLignes" :key="i"><th scope="row">{{ l[0] }}</th><td class="valeur">{{ l[1] }}</td></tr></tbody></table>',
    "    </div>",
    '    <div v-else-if="vue === \'frais\'">',
    "      <h2>{{ T.titreFrais }}</h2>",
    "      <table><thead><tr><th>{{ T.operation }}</th><th>{{ T.colFrais }}</th></tr></thead><tbody>",
    '        <tr><td>{{ T.t25 }}</td><td class="valeur">250 FCFA</td></tr>',
    '        <tr><td>{{ T.t100 }}</td><td class="valeur">500 FCFA</td></tr>',
    '        <tr><td>{{ T.tPlus }}</td><td class="valeur">1 000 FCFA</td></tr>',
    '        <tr><td>{{ T.retrait }}</td><td class="valeur">500 FCFA</td></tr>',
    "      </tbody></table>",
    '      <p class="discret">{{ T.noteFrais }}</p>',
    "    </div>",
    '    <div v-else-if="vue === \'transfert\'">',
    "      <h2>{{ T.titreEnvoi }}</h2>",
    '      <form novalidate @submit.prevent="envoyer">',
    '        <label class="champ"><span>{{ T.benef }}</span><select v-model="benef"><option v-for="n in noms" :key="n">{{ n }}</option></select></label>',
    '        <label class="champ"><span>{{ T.montant }}</span><input type="number" inputmode="numeric" min="1" v-model="montant" :placeholder="T.montantPh"></label>',
    '        <label class="champ"><span>{{ T.mdp }}</span><input type="password" autocomplete="current-password"></label>',
    '        <label class="champ"><span>{{ T.pin }}</span><input type="password" inputmode="numeric" autocomplete="off" maxlength="4" v-model="pin"></label>',
    '        <label class="champ"><span>{{ T.otp }}</span><input type="text" inputmode="numeric" autocomplete="one-time-code" maxlength="6"></label>',
    '        <p class="discret">{{ T.pinAide }}</p>',
    '        <p v-if="erreur" :class="\'message \' + erreur[1]" role="alert">{{ erreur[0] }}</p>',
    '        <button type="submit" class="action" :title="T.continuerTitre">{{ T.continuer }}</button>',
    "      </form>",
    "    </div>",
    '    <div v-else-if="vue === \'recapitulatif\'">',
    "      <h2>{{ T.titreRecap }}</h2>",
    '      <template v-if="brouillon.total > solde">',
    '        <p class="message erreur" role="alert">{{ T.insuffisant }}</p>',
    '        <button type="button" class="action secondaire" @click="vue = \'transfert\'">{{ T.modifier }}</button>',
    "      </template>",
    "      <template v-else>",
    '        <p class="message">{{ recapMsg }}</p>',
    '        <button type="button" class="action" @click="confirmer">{{ T.confirmer }}</button>',
    '        <button type="button" class="action secondaire" @click="vue = \'transfert\'">{{ T.annuler }}</button>',
    "      </template>",
    "    </div>",
    '    <div v-else-if="vue === \'resultat\'">',
    "      <h2>{{ T.titreRes }}</h2>",
    '      <p class="message">{{ resMsg }}</p>',
    '      <p class="message">{{ T.valide }}</p>',
    '      <p class="message">{{ soldeMsg }}</p>',
    '      <button type="button" class="action secondaire" @click="vue = \'accueil\'">{{ T.retour }}</button>',
    "    </div>",
    '    <div v-else-if="vue === \'messages\'">',
    '      <h2>{{ T.titreMsg }}</h2><p class="discret">{{ T.aideMsg }}</p>',
    '      <div aria-live="polite"><p v-if="choix" :class="\'message \' + choix[1]">{{ choix[0] }}</p></div>',
    '      <button v-for="(t, i) in T.boutonsMsg" :key="i" type="button" class="action secondaire" @click="choix = T.msgs[i]">{{ t }}</button>',
    "    </div>",
    "    <div v-else>",
    '      <h2>{{ T.titreJury }}</h2><p class="discret">{{ T.aideJury }}</p>',
    '      <label class="champ"><span>{{ T.messageLib }}</span><textarea rows="4" v-model="brouillonJury"></textarea></label>',
    '      <button type="button" class="action" @click="texteJury = brouillonJury.trim()">{{ T.afficherMsg }}</button>',
    '      <div aria-live="polite"><p v-if="texteJury" class="message">{{ texteJury }}</p></div>',
    "    </div>",
    "  </main>",
    "</div>",
  ].join("\n");

  function fmt(n) {
    return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, " ") + " FCFA";
  }
  function frais(m) {
    return m <= 25000 ? 250 : m <= 100000 ? 500 : 1000;
  }
  function remplir(modele, v) {
    return modele.replace(/\{(\w)\}/g, function (_, k) { return v[k]; });
  }

  Vue.createApp({
    template: GABARIT,
    data: function () {
      return {
        T: T, ids: ["accueil", "compte", "frais", "transfert", "messages", "jury"], noms: ["Jean K.", "Marie T.", "Paul N."],
        vue: "accueil", solde: 125400, benef: "Jean K.", montant: 25000, pin: "", tentatives: 3, erreur: null,
        brouillon: null, dernier: null, choix: null, brouillonJury: "", texteJury: "",
      };
    },
    computed: {
      courant: function () { return this.vue === "recapitulatif" ? "transfert" : this.vue === "resultat" ? "accueil" : this.vue; },
      soldeMsg: function () { return remplir(T.msgSolde, { S: fmt(this.solde) }); },
      recapMsg: function () {
        var b = this.brouillon;
        return remplir(T.recapMsg, { M: fmt(b.montant), B: b.beneficiaire, F: fmt(b.frais), T: fmt(b.total) });
      },
      resMsg: function () {
        var d = this.dernier;
        return remplir(T.resMsg, { M: fmt(d.montant), B: d.beneficiaire, F: fmt(d.frais) });
      },
    },
    methods: {
      fmt: fmt,
      envoyer: function () {
        var m = parseInt(this.montant, 10);
        if (!m || m < 1) { this.erreur = [T.montantInvalide, "erreur"]; return; }
        if (this.pin !== "1234") {
          this.tentatives = Math.max(0, this.tentatives - 1);
          this.erreur = this.tentatives === 0 ? [T.bloque, "alerte"] : [remplir(T.pinFaux, { N: this.tentatives }), "erreur"];
          return;
        }
        this.brouillon = { beneficiaire: this.benef, montant: m, frais: frais(m), total: m + frais(m) };
        this.erreur = null;
        this.vue = "recapitulatif";
      },
      confirmer: function () {
        this.solde -= this.brouillon.total;
        this.dernier = this.brouillon;
        this.vue = "resultat";
      },
    },
  }).mount("#racine");
})();
