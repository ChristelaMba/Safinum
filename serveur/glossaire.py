"""Glossaire financier : un CSV par langue (francais ou anglais vers la langue cible)."""
import csv
import re
import unicodedata

ORDRE = {"faible": 0, "moyenne": 1, "elevee": 2}


def normaliser(texte):
    t = unicodedata.normalize("NFD", str(texte)).encode("ascii", "ignore").decode()
    t = re.sub(r"[^\w\s']", " ", t.lower())
    return re.sub(r"\s+", " ", t).strip()


class Glossaire:
    def __init__(self, chemin, mapping, strict=False):
        self.mapping = mapping
        self.strict = strict
        self.lignes = []
        self.index = {}
        with open(chemin, encoding="utf-8", newline="") as fh:
            for r in csv.DictReader(fh):
                self.lignes.append(r)
                for cle in (r["fr"], r["en"]):
                    k = normaliser(cle)
                    if k and k not in self.index:
                        self.index[k] = r
        # Les termes longs d'abord pour l'aide au moteur
        self.par_longueur = sorted(self.lignes, key=lambda r: -len(r["fr"]))

    def chercher(self, texte):
        """Retourne (ligne, ponctuation finale) si le texte entier est un terme du glossaire."""
        brut = texte.strip()
        m = re.search(r"[\s:?!.\u2026]+$", brut)
        base = brut[: m.start()] if m else brut
        suffixe = m.group(0).strip() if m else ""
        ligne = self.index.get(normaliser(base))
        if ligne:
            return ligne, suffixe
        return None, ""

    def confiance_affichee(self, ligne):
        base = self.mapping.get(ligne["confiance"], "faible")
        if ligne["statut"] == "valide":
            return "elevee"
        if self.strict and base == "elevee":
            return "moyenne"
        return base

    def termes_dans(self, texte, maxi=15):
        """Les termes du glossaire presents dans le texte (pour harmoniser la traduction du moteur)."""
        t = " " + normaliser(texte) + " "
        trouves = []
        for r in self.par_longueur:
            for cle in (r["fr"], r["en"]):
                k = normaliser(cle)
                if len(k) > 2 and (" " + k + " ") in t:
                    trouves.append({"source": r["fr"], "cible": r["cible"]})
                    break
            if len(trouves) >= maxi:
                break
        return trouves

    def nb_brouillons(self):
        return sum(1 for r in self.lignes if r["statut"] != "valide")
