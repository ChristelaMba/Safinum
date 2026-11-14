// Test du plan B : le script autonome charge dans une page SANS extension (comme un favori ou la console).
// Serveur a lancer avant sur le port 8010 (voir e2e.js). Lancer : node extension/tests/e2e_inject.js
const { chromium } = require("playwright");
const fs = require("fs");
const path = require("path");

(async () => {
  const navigateur = await chromium.launch({ channel: "chrome", headless: true });
  const page = await navigateur.newPage();
  const erreurs = [];
  page.on("pageerror", (e) => erreurs.push(e.message));
  await page.addInitScript(() => { window.SAFINUM_URL = "http://localhost:8010"; });
  await page.goto("http://localhost:8010/banque/banque_simple/");
  const avant = await page.evaluate(() => document.body.innerHTML);
  // Comme un favori : le script est charge depuis le serveur
  await page.evaluate(() => new Promise((ok, ko) => {
    const s = document.createElement("script");
    s.src = "http://localhost:8010/safinum-inject.js";
    s.onload = ok;
    s.onerror = ko;
    document.head.appendChild(s);
  }));
  await page.waitForSelector("#safinum-hote", { state: "attached" });
  const clic = (mot) => page.evaluate((m) => {
    [...document.getElementById("safinum-hote").shadowRoot.querySelectorAll("button")].find((b) => b.textContent.includes(m)).click();
  }, mot);
  await clic("J'accepte");
  await clic("Pidgin");
  await page.waitForFunction(() => document.getElementById("safinum-hote").getAttribute("data-safinum-fini") === "1", null, { timeout: 20000 });
  const stats = JSON.parse(await page.evaluate(() => document.getElementById("safinum-hote").getAttribute("data-safinum-stats")));
  const traduit = await page.evaluate(() => document.querySelector("h2").textContent);
  await clic("Arrêter");
  await page.waitForTimeout(300);
  const apres = await page.evaluate(() => document.body.innerHTML);
  const ok = stats.traduits >= 10 && /^PCM /.test(traduit) && avant === apres && erreurs.length === 0;
  console.log((ok ? "OK    " : "ECHEC ") + JSON.stringify({ blocsTraduits: stats.traduits, titre: traduit, retourExact: avant === apres, erreursJS: erreurs.length }));
  await navigateur.close();
  process.exit(ok ? 0 : 1);
})();
