// Charge la VRAIE extension dans Chrome (service worker compris). Constat, pas un test automatique.
// node extension/tests/vraie_extension.js [langue] [port] [attente_secondes]
const { chromium } = require("playwright");
const path = require("path");
const os = require("os");
const fs = require("fs");

const langue = process.argv[2] || "Pidgin";
const port = process.argv[3] || "8020";
const attente = parseInt(process.argv[4] || "90", 10);
const ext = path.join(__dirname, "..");
const profil = fs.mkdtempSync(path.join(os.tmpdir(), "safinum-profil-"));

(async () => {
  const contexte = await chromium.launchPersistentContext(profil, {
    channel: process.env.NAVIGATEUR || "chrome",
    headless: false,
    args: ["--disable-extensions-except=" + ext, "--load-extension=" + ext, "--disable-features=DisableLoadExtensionCommandLineSwitch", "--no-first-run"],
    viewport: { width: 1100, height: 900 },
  });
  let sw = contexte.serviceWorkers()[0];
  if (!sw) sw = await contexte.waitForEvent("serviceworker", { timeout: 8000 }).catch(() => null);
  console.log("service worker de l'extension :", sw ? sw.url() : "AUCUN (extension non chargee)");
  if (!sw) { await contexte.close(); process.exit(2); }
  // Adresse du serveur
  await sw.evaluate((p) => chrome.storage.local.set({ serveur: "http://localhost:" + p, safinum_consentement: true }), port);
  const erreursSW = [];
  const page = await contexte.newPage();
  page.on("console", (m) => { if (m.type() === "error") erreursSW.push("console: " + m.text().slice(0, 160)); });
  page.on("pageerror", (e) => erreursSW.push("pageerror: " + e.message.slice(0, 160)));
  await page.goto("http://localhost:" + port + "/banque/banque_simple/");
  await page.waitForSelector("#safinum-hote", { state: "attached", timeout: 15000 });
  console.log("panneau present :", true);
  const t0 = Date.now();
  await page.evaluate(() => document.getElementById("safinum-hote").shadowRoot.querySelector(".reduit button").click());
  await page.waitForTimeout(200);
  await page.evaluate((nom) => {
    [...document.getElementById("safinum-hote").shadowRoot.querySelectorAll("button")].find((b) => b.textContent.includes(nom)).click();
  }, langue);
  // Etat du bouton juste apres le clic
  await page.waitForTimeout(300);
  console.log("bouton langue presse apres 300 ms :", await page.evaluate((nom) => {
    const b = [...document.getElementById("safinum-hote").shadowRoot.querySelectorAll("button")].find((x) => x.textContent.includes(nom));
    return b ? { pressed: b.getAttribute("aria-pressed"), fond: getComputedStyle(b).backgroundColor } : null;
  }, langue));
  let fini = false;
  for (let i = 0; i < attente; i++) {
    await page.waitForTimeout(1000);
    fini = (await page.evaluate(() => document.getElementById("safinum-hote").getAttribute("data-safinum-fini"))) === "1";
    if (fini) break;
  }
  console.log("fini :", fini, "| secondes :", ((Date.now() - t0) / 1000).toFixed(1));
  console.log("version :", await page.evaluate(() => (document.getElementById("safinum-hote").shadowRoot.textContent.match(/version [0-9.]+/) || [""])[0]));
  console.log("statut :", await page.evaluate(() => (document.getElementById("safinum-hote").shadowRoot.querySelector(".statut") || {}).textContent));
  console.log("stats :", await page.evaluate(() => document.getElementById("safinum-hote").getAttribute("data-safinum-stats")));
  console.log("texte de la page :", (await page.locator("main").innerText()).replace(/\s+/g, " ").slice(0, 300));
  console.log("erreurs :", erreursSW.slice(0, 6));
  await contexte.close();
})();
