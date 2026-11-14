// Essai dans Chrome avec le VRAI serveur et le vrai moteur (pas un test automatique : un outil de constat).
// Serveur reel a lancer sur 8020 avec le .env tel quel. Lancer : node extension/tests/reel.js [langue] [page]
const { chromium } = require("playwright");
const fs = require("fs");
const path = require("path");

const langue = process.argv[2] || "pcm";
const nomPage = process.argv[3] || "banque_simple";
const src = fs.readFileSync(path.join(__dirname, "e2e.js"), "utf8");
const STUB = src.match(/const STUB = `([\s\S]*?)`;/)[1].split("8010").join("8020");
const nomBouton = langue === "fub" ? "Fulfulde" : "Pidgin";

(async () => {
  const nav = await chromium.launch({ channel: "chrome", headless: true });
  const page = await nav.newPage();
  await page.addInitScript(STUB);
  await page.goto("http://localhost:8020/banque/" + nomPage + "/");
  for (const s of ["protection.js", "secrets.js", "nombres.js", "lecteur.js", "lecture_vocale.js", "voix.js", "content.js"]) {
    await page.addScriptTag({ content: fs.readFileSync(path.join(__dirname, "..", s), "utf8") });
  }
  await page.waitForSelector("#safinum-hote", { state: "attached" });
  const clic = (mot) => page.evaluate((m) => {
    [...document.getElementById("safinum-hote").shadowRoot.querySelectorAll("button")].find((b) => b.textContent.includes(m)).click();
  }, mot);
  const attendre = async () => {
    await page.waitForTimeout(1500);
    await page.waitForFunction(() => document.getElementById("safinum-hote").getAttribute("data-safinum-fini") === "1", null, { timeout: 60000 });
  };
  const etat = async (titre) => {
    const stats = await page.evaluate(() => document.getElementById("safinum-hote").getAttribute("data-safinum-stats"));
    const panneau = await page.evaluate(() => (document.getElementById("safinum-hote").shadowRoot.querySelector(".statut") || {}).textContent);
    const texte = await page.evaluate(() => document.querySelector("main").innerText.replace(/\s+/g, " ").slice(0, 900));
    console.log("\n=== " + titre + " ===\nstats : " + stats + "\npanneau : " + panneau + "\npage : " + texte);
  };
  await page.evaluate(() => document.getElementById("safinum-hote").shadowRoot.querySelector(".reduit button").click());
  await clic(nomBouton);
  await attendre();
  await etat("Accueil");
  const menu = page.locator("nav.menu button");
  await menu.nth(1).click(); await attendre(); await etat("Compte");
  await menu.nth(2).click(); await attendre(); await etat("Frais");
  await menu.nth(5).click(); await attendre();
  await page.fill("textarea", "Votre transfert est en attente. Ne communiquez jamais votre code PIN, meme a un agent de la banque.");
  await page.locator("main button.action").first().click(); await attendre(); await etat("Jury");
  await nav.close();
})();
