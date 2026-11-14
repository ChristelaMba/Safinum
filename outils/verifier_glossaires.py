"""Verifie les glossaires (serveur/glossaires/*.csv). Ne modifie JAMAIS un fichier : il signale seulement.

Lancer : python outils/verifier_glossaires.py
Code de sortie : 0 s'il n'y a aucune ERREUR (les AVERTISSEMENTS n'empechent pas), 1 sinon.

ERREUR : cible vide, balise ou marqueur dans une entree, deux lignes identiques.
AVERTISSEMENT : meme terme avec deux cibles (conflit d'orthographe a trancher avec un locuteur),
  terme critique sans equivalent, entrees non validees qui seraient montrees en confiance elevee.
"""
import csv
import os
import re
import sys
import unicodedata
from collections import defaultdict

RACINE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DOSSIER = os.path.join(RACINE, "serveur", "glossaires")
LANGUES = os.path.join(RACINE, "serveur", "langues")

# Termes dont une traduction fausse ou absente est un defaut majeur
CRITIQUES = [
    "PIN", "Code PIN", "Mot de passe", "Solde", "Solde disponible", "Solde insuffisant", "Transfert", "Frais",
    "Montant", "Bénéficiaire", "Confirmer", "Annuler", "Erreur", "Total", "Envoyer", "Retrait",
]
BALISE = re.compile(r"\[[A-Z]+_\d+\]|</?s\d+>|<[^>]+>")


def normaliser(t):
    t = unicodedata.normalize("NFD", str(t)).encode("ascii", "ignore").decode()
    return re.sub(r"\s+", " ", re.sub(r"[^\w\s']", " ", t.lower())).strip()


def lire(chemin):
    with open(chemin, encoding="utf-8", newline="") as fh:
        return list(csv.DictReader(fh))


def mapping_confiance(code):
    """Lit mapping_confiance dans le YAML de la langue, sans bibliotheque (lecture simple)."""
    carte = {}
    chemin = os.path.join(LANGUES, code + ".yaml")
    if not os.path.exists(chemin):
        return carte
    dedans = False
    for ligne in open(chemin, encoding="utf-8"):
        if ligne.startswith("mapping_confiance"):
            dedans = True
            continue
        if dedans:
            m = re.match(r"\s+(\w+):\s*(\w+)", ligne)
            if m:
                carte[m.group(1)] = m.group(2)
            else:
                dedans = False
    return carte


def verifier(chemin):
    nom = os.path.basename(chemin)
    code = {"pidgin.csv": "pidgin", "fulfulde.csv": "fulfulde"}.get(nom, nom.split(".")[0])
    lignes = lire(chemin)
    erreurs, avertissements = [], []
    par_terme = defaultdict(list)
    vus = set()
    for i, r in enumerate(lignes, start=2):
        for col in ("fr", "en", "cible"):
            if BALISE.search(r.get(col, "")):
                erreurs.append("%s ligne %d : balise ou marqueur dans '%s' : %s" % (nom, i, col, r[col]))
        if not r.get("cible", "").strip():
            erreurs.append("%s ligne %d : cible vide pour '%s'" % (nom, i, r.get("fr")))
        cle = (normaliser(r.get("fr", "")), normaliser(r.get("cible", "")))
        if cle in vus:
            erreurs.append("%s ligne %d : ligne en double : %s -> %s" % (nom, i, r.get("fr"), r.get("cible")))
        vus.add(cle)
        for col in ("fr", "en"):
            if r.get(col, "").strip():
                par_terme[normaliser(r[col])].append((i, r))
    # Meme terme, plusieurs cibles : deux orthographes en conflit
    conflits = 0
    for terme, rs in par_terme.items():
        cibles = {normaliser(r["cible"]) for _, r in rs}
        if len(cibles) > 1:
            conflits += 1
            if conflits <= 15:
                avertissements.append("%s conflit pour '%s' : %s" % (nom, terme, " | ".join("%s [%s]" % (r["cible"], r.get("source", "?")) for _, r in rs)))
    if conflits > 15:
        avertissements.append("%s : %d conflits au total (15 affiches)" % (nom, conflits))
    # Termes critiques sans equivalent
    index = {normaliser(r["fr"]) for r in lignes} | {normaliser(r["en"]) for r in lignes}
    manquants = [t for t in CRITIQUES if normaliser(t) not in index]
    if manquants:
        avertissements.append("%s termes critiques sans equivalent : %s" % (nom, ", ".join(manquants)))
    # Entrees non validees montrees en confiance elevee
    carte = mapping_confiance(code)
    brouillons_hauts = 0
    for r in lignes:
        if r.get("statut") != "valide" and carte.get(r.get("confiance"), "faible") == "elevee":
            brouillons_hauts += 1
    if brouillons_hauts:
        avertissements.append(
            "%s : %d entrees NON validees par un locuteur seraient montrees en confiance elevee (traduction seule). "
            "Avec SAFINUM_STRICT=1 elles passent en confiance moyenne (original a cote)." % (nom, brouillons_hauts)
        )
    valides = sum(1 for r in lignes if r.get("statut") == "valide")
    return {"nom": nom, "total": len(lignes), "valides": valides, "erreurs": erreurs, "avertissements": avertissements}


def main():
    fichiers = sorted(f for f in os.listdir(DOSSIER) if f.endswith(".csv"))
    bilan = [verifier(os.path.join(DOSSIER, f)) for f in fichiers]
    nb_erreurs = 0
    for b in bilan:
        print("== %s : %d entrees, %d validees par un locuteur" % (b["nom"], b["total"], b["valides"]))
        for e in b["erreurs"]:
            print("  ERREUR       " + e)
        for a in b["avertissements"]:
            print("  AVERTISSEMENT " + a)
        nb_erreurs += len(b["erreurs"])
    print("\n%d erreur(s)." % nb_erreurs)
    return 1 if nb_erreurs else 0


if __name__ == "__main__":
    sys.exit(main())
