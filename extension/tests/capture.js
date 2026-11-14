// Capture d'ecran d'une vue (outil de constat). node extension/tests/capture.js <langue> <indexMenu> <fichier.png> [largeur]
const { chromium } = require("playwright");
const fs = require("fs");
const path = require("path");
const [langue, indexMenu, sortie, largeur] = [process.argv[2] || "fub", parseInt(process.argv[3] || "1", 10), process.argv[4], parseInt(process.argv[5] || "1000", 10)];
const src = fs.readFileSync(path.join(__dirname, "e2e.js"), "utf8");
const STUB = src.match(/const STUB = `([\s\S]*?)`;/)[1].split("8010").join("8020");
(async () => {
  const nav = await chromium.launch({ channel: "chrome", headless: true });
  const page = await nav.newPage({ viewport: { width: largeur, height: 1400 } });
  await page.addInitScript(STUB);
  await page.goto("http://localhost:8020/banque/banque_simple/");
  for (const s of ["protection.js", "secrets.js", "nombres.js", "lecteur.js", "lecture_vocale.js", "voix.js", "content.js"]) {
    await page.addScriptTag({ content: fs.readFileSync(path.join(__dirname, "..", s), "utf8") });
  }
  await page.waitForSelector("#safinum-hote", { state: "attached" });
  const fini = () => page.waitForFunction(() => document.getElementById("safinum-hote").getAttribute("data-safinum-fini") === "1", null, { timeout: 60000 });
  if (langue !== "aucune") {
    await page.evaluate((m) => {
      const h = document.getElementById("safinum-hote");
      h.shadowRoot.querySelector(".reduit button").click();
      [...h.shadowRoot.querySelectorAll("button")].find((b) => b.textContent.includes(m)).click();
    }, langue === "fub" ? "Fulfulde" : "Pidgin");
    await page.waitForTimeout(1500); await fini();
    // on replie le panneau pour voir la page
    await page.evaluate(() => { const h = document.getElementById("safinum-hote"); [...h.shadowRoot.querySelectorAll("button")].find((b) => b.textContent === "Fermer").click(); });
  }
  await page.locator("nav.menu button").nth(indexMenu).click();
  await page.waitForTimeout(1500); if (langue !== "aucune") await fini();
  await page.screenshot({ path: sortie, fullPage: true });
  await nav.close();
})();
