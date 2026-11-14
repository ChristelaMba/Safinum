// Essai sur des pages publiques de demonstration (sites faits pour etre testes, aucun compte reel).
// SAFINUM ne fait que LIRE et traduire le texte. Outil de constat, pas un test automatique.
// Serveur a lancer avant sur le port 8010 (moteur de test ou vrai moteur). node extension/tests/sites_publics.js [nom ...]
const { chromium } = require("playwright");
const fs = require("fs");
const path = require("path");

const SERVEUR = "http://localhost:" + (process.env.PORT_SERVEUR || "8010");
const SORTIE = process.env.SORTIE_CAPTURES || path.join(__dirname, "..", "..", "docs");
const SCRIPTS = ["protection.js", "secrets.js", "nombres.js", "lecteur.js", "lecture_vocale.js", "voix.js", "content.js"];

const SITES = {
  altoro: { url: "https://demo.testfire.net/", etapes: async () => {} },
  parabank: { url: "https://parabank.parasoft.com/parabank/index.htm", etapes: async () => {} },
  parabank_inscription: { url: "https://parabank.parasoft.com/parabank/register.htm", etapes: async () => {} },
  parabank_contact: { url: "https://parabank.parasoft.com/parabank/contact.htm", etapes: async () => {} },
  parabank_services: { url: "https://parabank.parasoft.com/parabank/services.htm", etapes: async () => {} },
  parabank_admin: { url: "https://parabank.parasoft.com/parabank/admin.htm", etapes: async () => {} },
  parabank_lookup: { url: "https://parabank.parasoft.com/parabank/lookup.htm", etapes: async () => {} },
  parabank_about: { url: "https://parabank.parasoft.com/parabank/about.htm", etapes: async () => {} },
  globalsqa: {
    url: "https://www.globalsqa.com/angularJs-protractor/BankingProject/#/login",
    etapes: async () => {},
    // Navigation APRES l'activation de SAFINUM : application a page unique (Angular)
    apres: async (page) => {
      // Sélecteurs independants du texte (il est traduit)
      await page.click('button[ng-click="customer()"]');
      await page.waitForTimeout(1500);
      await page.selectOption("#userSelect", { index: 2 });
      await page.waitForTimeout(800);
      await page.click('button[type="submit"]');
      await page.waitForTimeout(2500);
    },
  },
};

// Le "service worker" : c'est Node qui appelle le serveur (la politique de securite du site n'y change rien)
const STUB = `
  window.chrome = {
    runtime: {
      lastError: null, getURL: function (p) { return p; }, onMessage: { addListener: function () {} },
      sendMessage: function (msg, cb) {
        if (msg.type === "profil") return cb({ profil: {} });
        window.__relais(JSON.stringify(msg)).then(function (r) { cb(JSON.parse(r)); });
      },
    },
    storage: { local: { get: function () { return Promise.resolve({ safinum_consentement: true }); }, set: function () { return Promise.resolve(); } } },
  };
`;

async function relais(texte) {
  const msg = JSON.parse(texte);
  try {
    if (msg.type === "traduire") {
      const r = await fetch(SERVEUR + "/v1/translate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ langue_cible: msg.langue, segments: msg.segments }) });
      return JSON.stringify(r.ok ? await r.json() : { erreur: "http_" + r.status });
    }
    if (msg.type === "langues") return JSON.stringify({ langues: await (await fetch(SERVEUR + "/v1/langues")).json() });
  } catch (e) {
    return JSON.stringify({ erreur: "serveur_injoignable" });
  }
  return JSON.stringify({ erreur: "inconnu" });
}

// Textes visibles (feuilles) de la page, pour comparer avant et apres
const COLLECTE = () => [...document.querySelectorAll("h1,h2,h3,h4,p,li,a,button,td,th,label,span,div")]
  .filter((e) => e.children.length === 0 && e.offsetParent !== null && /[A-Za-z]{4}/.test(e.textContent) && !e.closest("#safinum-hote"))
  .map((e) => e.textContent.trim().replace(/\s+/g, " ")).filter((t) => t).slice(0, 600);

// Valeurs (chiffres) visibles, Shadow DOM compris
const LIRE_VALEURS = () => {
  function texte(n, sortie) {
    if (n.nodeType === 3) sortie.push(n.nodeValue);
    if (n.nodeType === 1) {
      if (n.id === "safinum-hote" || /^(SCRIPT|STYLE|NOSCRIPT)$/.test(n.tagName)) return;
      if (n.shadowRoot) texte(n.shadowRoot, sortie);
    }
    n.childNodes.forEach((c) => texte(c, sortie));
  }
  const t = [];
  texte(document.body, t);
  const m = t.join(" ").replace(/\s+/g, " ").match(/\d[\d .,]*\d|\d/g) || [];
  return [...new Set(m.map((x) => x.replace(/\D/g, "")))].sort();
};

(async () => {
  const noms = process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(SITES);
  const nav = await chromium.launch({ channel: "chrome", headless: true });
  const rapport = [];
  for (const nom of noms) {
    const site = SITES[nom];
    const res = { site: nom, url: site.url };
    const contexte = await nav.newContext({ bypassCSP: true, ignoreHTTPSErrors: true, viewport: { width: 1200, height: 900 } });
    const page = await contexte.newPage();
    const erreurs = [];
    page.on("pageerror", (e) => erreurs.push(e.message.slice(0, 120)));
    await page.exposeFunction("__relais", relais);
    await page.addInitScript(STUB);
    try {
      await page.goto(site.url, { waitUntil: "domcontentloaded", timeout: 45000 });
      await page.waitForTimeout(2500);
      await site.etapes(page);
      res.titre = await page.title();
      for (const s of SCRIPTS) await page.addScriptTag({ content: fs.readFileSync(path.join(__dirname, "..", s), "utf8") });
      await page.waitForSelector("#safinum-hote", { state: "attached", timeout: 10000 });
      const htmlAvant = await page.evaluate(() => document.body.innerText.length);
      const valAvant = await page.evaluate(LIRE_VALEURS);
      const textesAvant = await page.evaluate(COLLECTE);
      await page.screenshot({ path: path.join(SORTIE, "site_" + nom + "_avant.png"), fullPage: false });
      const t0 = Date.now();
      await page.evaluate(() => document.getElementById("safinum-hote").shadowRoot.querySelector(".reduit button").click());
      await page.waitForTimeout(200);
      await page.evaluate((nomLangue) => {
        [...document.getElementById("safinum-hote").shadowRoot.querySelectorAll("button")].find((b) => b.textContent.includes(nomLangue)).click();
      }, process.env.LANGUE_NOM || "Pidgin");
      await page.waitForTimeout(1500);
      await page.waitForFunction(() => document.getElementById("safinum-hote").getAttribute("data-safinum-fini") === "1", null, { timeout: 60000 });
      res.secondes = +((Date.now() - t0) / 1000).toFixed(1);
      res.stats = JSON.parse(await page.evaluate(() => document.getElementById("safinum-hote").getAttribute("data-safinum-stats")));
      res.statut = await page.evaluate(() => (document.getElementById("safinum-hote").shadowRoot.querySelector(".statut") || {}).textContent);
      const valApres = await page.evaluate(LIRE_VALEURS);
      res.valeursIdentiques = JSON.stringify(valAvant) === JSON.stringify(valApres);
      if (!res.valeursIdentiques) res.valeursDiff = { perdues: valAvant.filter((v) => valApres.indexOf(v) === -1).slice(0, 8), ajoutees: valApres.filter((v) => valAvant.indexOf(v) === -1).slice(0, 8) };
      // Part des textes visibles qui ont change par rapport a l'original (ce qui a ete traduit)
      const textesApres = await page.evaluate(COLLECTE);
      const avantSet = new Set(textesAvant);
      res.textesVisibles = textesApres.length;
      const inchanges = textesApres.filter((t) => avantSet.has(t));
      res.partTraduiteVisible = textesApres.length ? Math.round((100 * (textesApres.length - inchanges.length)) / textesApres.length) : null;
      res.inchanges = inchanges.slice(0, 14);
      res.apercu = textesApres.filter((t) => !avantSet.has(t)).slice(0, 8);
      await page.screenshot({ path: path.join(SORTIE, "site_" + nom + "_apres.png"), fullPage: false });
      if (site.apres) {
        const avant2 = new Set(await page.evaluate(COLLECTE));
        await site.apres(page);
        await page.waitForTimeout(3500);
        res.stats2 = JSON.parse(await page.evaluate(() => document.getElementById("safinum-hote").getAttribute("data-safinum-stats")));
        const apres2 = await page.evaluate(COLLECTE);
        const nouveaux = apres2.filter((t) => !avant2.has(t));
        res.apresNavigation = { textesVisibles: apres2.length, nouveauxTextes: nouveaux.slice(0, 10), valeursOk: true };
        await page.screenshot({ path: path.join(SORTIE, "site_" + nom + "_navigation.png"), fullPage: false });
      }
      // Arret : la page doit revenir comme avant
      await page.evaluate(() => {
        const h = document.getElementById("safinum-hote");
        h.shadowRoot.querySelector("button.stop").click();
      });
      await page.waitForTimeout(400);
      res.arretRestaure = site.apres ? "non mesure (la page a change)" : (await page.evaluate(() => document.body.innerText.length)) === htmlAvant;
    } catch (e) {
      res.erreur = String(e.message).split("\n")[0].slice(0, 200);
    }
    res.erreursJS = erreurs.length;
    rapport.push(res);
    console.log(JSON.stringify(res, null, 1));
    await contexte.close();
  }
  fs.writeFileSync(path.join(__dirname, "..", "..", "docs", "rapport_sites_publics.json"), JSON.stringify(rapport, null, 2));
  await nav.close();
})();
