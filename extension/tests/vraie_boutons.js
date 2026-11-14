// Clique chaque bouton du panneau de la VRAIE extension (Edge) et regarde si l'etat visuel change. Constat.
const { chromium } = require("playwright");
const path = require("path"), os = require("os"), fs = require("fs");
const ext = path.join(__dirname, "..");
(async () => {
  const ctx = await chromium.launchPersistentContext(fs.mkdtempSync(path.join(os.tmpdir(), "sf-")), {
    channel: process.env.NAVIGATEUR || "msedge", headless: false, viewport: { width: 1100, height: 900 },
    args: ["--disable-extensions-except=" + ext, "--load-extension=" + ext, "--disable-features=DisableLoadExtensionCommandLineSwitch", "--no-first-run"],
  });
  let sw = ctx.serviceWorkers()[0] || (await ctx.waitForEvent("serviceworker", { timeout: 8000 }));
  await sw.evaluate(() => chrome.storage.local.set({ serveur: "http://localhost:8020", safinum_consentement: true, safinum_modes: {} }));
  const page = await ctx.newPage();
  const erreurs = [];
  page.on("pageerror", (e) => erreurs.push(e.message.slice(0, 200)));
  page.on("console", (m) => { if (m.type() === "error") erreurs.push("console: " + m.text().slice(0, 200)); });
  await page.goto("http://localhost:8020/banque/banque_simple/");
  await page.waitForSelector("#safinum-hote", { state: "attached", timeout: 15000 });
  await page.evaluate(() => document.getElementById("safinum-hote").shadowRoot.querySelector(".reduit button").click());
  const lire = () => page.evaluate(() => [...document.getElementById("safinum-hote").shadowRoot.querySelectorAll("button")].map((b) => b.textContent.trim().slice(0, 28) + " | " + (b.getAttribute("aria-pressed") || "-") + " | " + getComputedStyle(b).backgroundColor));
  const avant = await lire();
  // Clic REEL (souris) sur chaque bouton a bascule
  const noms = ["écouter", "Sans le son", "Contraste", "Sourd", "lecteur d'écran", "Masquer", "Zoom de la page", "Texte plus"];
  for (const nom of noms) {
    const b = page.locator("#safinum-hote").getByRole("button", { name: new RegExp(nom, "i") }).first();
    await b.click();
    await page.waitForTimeout(250);
    const etat = await page.evaluate((n) => {
      const x = [...document.getElementById("safinum-hote").shadowRoot.querySelectorAll("button")].find((y) => new RegExp(n, "i").test(y.textContent));
      return x ? { pressed: x.getAttribute("aria-pressed"), fond: getComputedStyle(x).backgroundColor } : null;
    }, nom);
    console.log(nom.padEnd(18), JSON.stringify(etat));
    // On remet a zero pour le suivant
    await b.click(); await page.waitForTimeout(150);
  }
  console.log("erreurs :", erreurs.slice(0, 6));
  await ctx.close();
})();
