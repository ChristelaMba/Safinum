// Vraie extension (Edge/Chrome) : la langue choisie doit suivre la navigation d'une page a l'autre.
// node extension/tests/vraie_navigation.js [port]  (serveur de test sur ce port)
const { chromium } = require("playwright");
const path = require("path"), os = require("os"), fs = require("fs");
const port = process.argv[2] || "8010";
const U1 = process.argv[3] || "http://localhost:" + port + "/banque/banque_simple/";
const U2 = process.argv[4] || "http://localhost:" + port + "/banque/banque_tableaux/";
const MARQUE = process.argv[5] ? new RegExp(process.argv[5]) : /PCM /;
const ext = process.env.EXT_DIR || path.join(__dirname, "..");  // EXT_DIR : extension telechargee depuis /safinum-extension.zip
(async () => {
  const ctx = await chromium.launchPersistentContext(fs.mkdtempSync(path.join(os.tmpdir(), "safinum-nav-")), {
    channel: process.env.NAVIGATEUR || "chrome", headless: false,
    args: ["--disable-extensions-except=" + ext, "--load-extension=" + ext, "--disable-features=DisableLoadExtensionCommandLineSwitch", "--no-first-run"],
  });
  let sw = ctx.serviceWorkers()[0] || await ctx.waitForEvent("serviceworker", { timeout: 8000 });
  await sw.evaluate((r) => chrome.storage.local.set(Object.assign({ safinum_consentement: true }, r.sans ? {} : { serveur: "http://localhost:" + r.port })), { port, sans: !!process.env.SANS_REGLAGE });
  const page = await ctx.newPage();
  await page.goto(U1);
  await page.waitForSelector("#safinum-hote", { state: "attached" });
  await page.evaluate(() => document.getElementById("safinum-hote").shadowRoot.querySelector(".reduit button").click());
  await page.waitForTimeout(200);
  await page.evaluate(() => [...document.getElementById("safinum-hote").shadowRoot.querySelectorAll("button")].find((b) => b.textContent.includes("Pidgin")).click());
  await page.waitForFunction(() => document.getElementById("safinum-hote").getAttribute("data-safinum-fini") === "1", null, { timeout: 60000 });
  // Navigation reelle vers une autre page du meme site (chargement complet)
  const t1 = Date.now();
  await page.goto(U2);
  await page.waitForSelector("#safinum-hote", { state: "attached" });
  await page.waitForFunction(() => document.getElementById("safinum-hote").getAttribute("data-safinum-fini") === "1", null, { timeout: 30000 }).catch(() => {});
  const texte = (await page.locator("body").innerText()).replace(/\s+/g, " ");
  console.log("reprise automatique :", MARQUE.test(texte) ? "OUI" : "NON", "(" + ((Date.now() - t1) / 1000).toFixed(1) + " s apres chargement) |", texte.slice(0, 160));
  // Arret voulu : ne doit plus reprendre
  await page.evaluate(() => document.getElementById("safinum-hote").shadowRoot.querySelector("button.stop").click());
  await page.waitForTimeout(500);
  await page.goto(U1);
  await page.waitForTimeout(3000);
  console.log("apres arret, traduit :", MARQUE.test(await page.locator("body").innerText()) ? "OUI (mauvais)" : "NON (bon)");
  await ctx.close();
})();
