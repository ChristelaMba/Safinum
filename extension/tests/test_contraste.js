// Contraste WCAG AA (4,5 pour le texte normal) des couleurs du panneau. Lancer : node extension/tests/test_contraste.js
const assert = require("assert");
const fs = require("fs");
const path = require("path");

function luminance(hex) {
  const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)));
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
}
function ratio(a, b) {
  const [l1, l2] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (l1 + 0.05) / (l2 + 0.05);
}

// Couples texte / fond lus dans le style du panneau (content.js)
const source = fs.readFileSync(path.join(__dirname, "..", "content.js"), "utf8");
const COUPLES = [
  ["texte du panneau", "#14201f", "#ffffff"],
  ["bouton normal", "#0b5d4b", "#ffffff"],
  ["bouton active", "#ffffff", "#0b5d4b"],
  ["bouton d'arret", "#ffffff", "#b3261e"],
  ["bandeau d'alerte", "#ffffff", "#b3261e"],
  ["bouton du bandeau", "#b3261e", "#ffffff"],
  ["contraste fort", "#ffe600", "#000000"],
  ["contraste fort active", "#000000", "#ffe600"],
];

let ok = 0;
COUPLES.forEach(function (c) {
  try {
    assert.ok(source.indexOf(c[1]) !== -1 && source.indexOf(c[2]) !== -1, "couleur absente du style");
    const r = ratio(c[1], c[2]);
    assert.ok(r >= 4.5, "contraste " + r.toFixed(2) + " (< 4,5)");
    ok++;
    console.log("ok   " + c[0] + " : " + r.toFixed(2));
  } catch (e) {
    console.log("ECHEC " + c[0] + " : " + e.message);
    process.exitCode = 1;
  }
});
console.log(ok + " tests reussis");
