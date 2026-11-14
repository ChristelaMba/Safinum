"""Construit serveur/glossaires/pidgin.csv et fulfulde.csv a partir des fichiers Excel du dossier donnees/.

Utilisation (depuis la racine du projet) :
    python outils/construire_glossaires.py

Regles :
- Pidgin : les lots Kamtok (libelles courts) passent en premier, puis le brouillon Pidgin,
  puis la feuille 'A valider en priorite', puis pidgin_complement.csv.
- Fulfulde : les propositions de la fiche de relecture. Une ligne devient 'valide' quand un
  locuteur a mis 'oui' ou 'corrige' ET son nom dans la fiche.
"""
import csv
import glob
import os
import re
import sys
import unicodedata

from openpyxl import load_workbook

RACINE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DONNEES = os.path.join(RACINE, "donnees")
SORTIE = os.path.join(RACINE, "serveur", "glossaires")
sys.path.insert(0, os.path.join(RACINE, "outils"))


def norm(texte):
    t = unicodedata.normalize("NFD", str(texte)).encode("ascii", "ignore").decode()
    return re.sub(r"\s+", " ", t.lower().strip())


def normaliser_confiance(valeur):
    v = norm(valeur or "")
    if v.startswith("elev"):
        return "elevee"
    if v.startswith("moy"):
        return "moyenne"
    if v.startswith("tres"):
        return "tres_faible"
    if v.startswith("faib"):
        return "faible"
    return "moyenne"


def lire_feuille(fichier, feuille=None):
    wb = load_workbook(fichier, read_only=True, data_only=True)
    ws = wb[feuille] if feuille else wb.worksheets[0]
    lignes = list(ws.iter_rows(values_only=True))
    return lignes[1:]


def construire_pidgin():
    entrees = {}

    def ajouter(fr, en, cible, confiance, source):
        if not fr or not cible:
            return
        cle = norm(fr)
        if cle in entrees:
            return
        entrees[cle] = {
            "fr": str(fr).strip(),
            "en": str(en or "").strip(),
            "cible": str(cible).strip(),
            "confiance": confiance,
            "statut": "brouillon",
            "source": source,
        }

    # 1. Lots Kamtok : colonne A = francais, C = anglais, E = equivalent court
    for f in sorted(glob.glob(os.path.join(DONNEES, "SAFINUM_Kamtok_*.xlsx"))):
        for r in lire_feuille(f):
            ajouter(r[0], r[2], r[4], "moyenne", "kamtok")

    # 2. Brouillon Pidgin : B = francais, C = anglais, D = pidgin, F = confiance
    brouillon = os.path.join(DONNEES, "SAFINUM_Traductions_Pidgin_brouillon-2.xlsx")
    for r in lire_feuille(brouillon, "Traductions"):
        ajouter(r[1], r[2], r[3], normaliser_confiance(r[5]), "brouillon")
    # 3. Termes prioritaires : A = francais, B = anglais, C = pidgin
    for r in lire_feuille(brouillon, "À valider en priorité"):
        ajouter(r[0], r[1], r[2], "moyenne", "brouillon_prioritaire")

    # 4. Complement ecrit a la main
    with open(os.path.join(SORTIE, "pidgin_complement.csv"), encoding="utf-8", newline="") as fh:
        for r in csv.DictReader(fh):
            ajouter(r["fr"], r["en"], r["cible"], r["confiance"], r["source"])
    return list(entrees.values())


def construire_fulfulde():
    from ful_brouillon import FUL

    fiche = os.path.join(DONNEES, "SAFINUM_Fulfulde_fub_fiche_relecture.xlsx")
    wb = load_workbook(fiche, read_only=True, data_only=True)
    lignes = list(wb["Glossaire"].iter_rows(values_only=True))[2:]
    resultat = []
    for r in lignes:
        fr, en, ful, sur, nom = r[1], r[2], r[5], r[6], r[7]
        if not fr or not ful:
            continue
        confiance = normaliser_confiance(FUL.get(fr, ("", "faible"))[1])
        statut = "brouillon"
        if norm(sur or "") in ("oui", "corrige") and nom:
            statut = "valide"
            confiance = "elevee"
        resultat.append(
            {
                "fr": str(fr).strip(),
                "en": str(en or "").strip(),
                "cible": str(ful).strip(),
                "confiance": confiance,
                "statut": statut,
                "source": "fiche_relecture",
            }
        )
    return resultat


def ecrire(nom, lignes):
    chemin = os.path.join(SORTIE, nom)
    with open(chemin, "w", encoding="utf-8", newline="") as fh:
        w = csv.DictWriter(fh, fieldnames=["fr", "en", "cible", "confiance", "statut", "source"])
        w.writeheader()
        w.writerows(lignes)
    print(nom, ":", len(lignes), "entrees")


if __name__ == "__main__":
    ecrire("pidgin.csv", construire_pidgin())
    ecrire("fulfulde.csv", construire_fulfulde())
