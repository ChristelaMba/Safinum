// Parcours du jury sans installation : /essayer -> banque de demonstration avec SAFINUM deja actif -> langue -> page suivante.
// node extension/tests/demo_en_ligne.js [port]
const { chromium } = require("playwright");
const port = process.argv[2] || "8010";
(async () => {
  const nav = await chromium.launch({ channel: process.env.NAVIGATEUR || "chrome", headless: true });
  const page = await nav.newPage();
  const erreurs = [];
  page.on("pageerror", (e) => erreurs.push(e.message.slice(0, 120)));
  await page.goto("http://localhost:" + port + "/essayer");
  await page.click('a[href^="/banque/banque_simple"]');
  await page.waitForSelector("#safinum-hote", { state: "attached", timeout: 15000 });
  await page.waitForTimeout(800); // le panneau est deja ouvert en mode autonome ; premiere fois : un clic de consentement
  await page.evaluate(() => { const b = [...document.getElementById("safinum-hote").shadowRoot.querySelectorAll("button")].find((x) => /accept|d'accord|compris|j'accepte/i.test(x.textContent)); if (b) b.click(); });
  await page.waitForTimeout(400);
  await page.evaluate(() => [...document.getElementById("safinum-hote").shadowRoot.querySelectorAll("button")].find((b) => b.textContent.includes("Pidgin")).click());
  await page.waitForFunction(() => document.getElementById("safinum-hote").getAttribute("data-safinum-fini") === "1", null, { timeout: 60000 });
  const traduit1 = /PCM /.test(await page.locator("main").innerText());
  await page.goto("http://localhost:" + port + "/banque/banque_tableaux/");
  await page.waitForSelector("#safinum-hote", { state: "attached", timeout: 15000 });
  await page.waitForTimeout(2500);
  const traduit2 = /PCM /.test(await page.locator("main").innerText());
  console.log("page 1 traduite :", traduit1, "| page 2 traduite sans reclic :", traduit2, "| erreurs JS :", erreurs.length);
  await nav.close();
  process.exit(traduit1 && traduit2 && !erreurs.length ? 0 : 1);
})();
