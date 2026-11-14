"""Plan B : prepare serveur/cache_precharge.json pour que la demo marche sans connexion.

A lancer UNE fois, avec une cle API valide et le serveur eteint :
    cd serveur
    .venv\\Scripts\\python.exe ..\\outils\\precharger_cache.py pcm
Les phrases viennent de outils/phrases_demo.json (celles que l'extension envoie vraiment sur les pages de test,
avec balises et marqueurs, produites par extension/tests/e2e.js) et d'une liste de messages plausibles du jury.
Le fichier ne contient que du texte SANS valeurs (balises a la place des montants).
Le moteur de TEST est refuse : ses "traductions" ne sont pas de vraies traductions.
"""
import asyncio
import json
import os
import sys

RACINE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(RACINE, "serveur"))

from dotenv import load_dotenv

load_dotenv(os.path.join(RACINE, "serveur", ".env"))

import main  # noqa: E402
from glossaire import normaliser  # noqa: E402

# Messages que le jury pourrait introduire (valeurs deja remplacees par des balises)
JURY = [
    "Votre compte sera débité de [MONTANT_1] le [DATE_1].",
    "Le service est temporairement indisponible. Réessayez plus tard.",
    "Votre transfert de [MONTANT_1] vers [BENEF_1] est en attente de validation.",
    "Votre plafond journalier de [MONTANT_1] a été atteint.",
    "Un code de vérification a été envoyé au [TEL_1]. Ne le partagez jamais.",
    "Votre carte a été bloquée par mesure de sécurité. Contactez votre banque.",
    "Frais de service : [FRAIS_1]. Total à payer : [MONTANT_1].",
    "Votre recharge de [MONTANT_1] a été effectuée avec succès.",
    "Attention : cette opération est irréversible.",
    "Veuillez vérifier le nom du bénéficiaire avant de confirmer.",
    "Your payment of [MONTANT_1] to [BENEF_1] has been received.",
    "Warning: someone may be pretending to be your bank. Never give your PIN.",
    "Transaction failed. Your account has not been debited.",
    "Your daily limit of [MONTANT_1] has been reached.",
    "Votre session va expirer. Reconnectez-vous pour continuer.",
    "Opération impossible : le montant dépasse votre solde.",
    "Réseau indisponible. Votre opération n'a pas été envoyée.",
    "Le code saisi est incorrect. Il vous reste [NOMBRE_1] tentatives.",
]


async def lancer(code):
    if main.llm.nom == "test":
        print("Moteur de TEST : refuse. Configurez un vrai moteur dans serveur/.env (voir README).")
        sys.exit(1)
    if not main.llm.disponible:
        print("Moteur indisponible :", main.llm.cause, "- voir /diagnostic. Rien n'a ete ecrit.")
        sys.exit(1)
    langue = main.langues[code]
    phrases = list(JURY)
    chemin_phrases = os.path.join(RACINE, "outils", "phrases_demo.json")
    if os.path.exists(chemin_phrases):
        with open(chemin_phrases, encoding="utf-8") as fh:
            phrases += json.load(fh)
    phrases = sorted(set(phrases))
    segs = [main.Segment(id=str(i), texte=t) for i, t in enumerate(phrases)]
    resultats = await main.traiter_lot(segs, langue)
    sortie = []
    for s, r in zip(segs, resultats):
        if r["origine"] in ("moteur", "cache") and r["confiance"] != "faible":
            sortie.append({"langue": code, "cle": normaliser(s.texte), "resultat": r})
    chemin = os.path.join(RACINE, "serveur", "cache_precharge.json")
    anciennes = []
    if os.path.exists(chemin):
        with open(chemin, encoding="utf-8") as fh:
            anciennes = [x for x in json.load(fh) if x["langue"] != code]
    with open(chemin, "w", encoding="utf-8") as fh:
        json.dump(anciennes + sortie, fh, ensure_ascii=False, indent=1)
    print("%d phrases sur %d enregistrees dans %s (appels au moteur : %d)" % (len(sortie), len(phrases), chemin, main.etat["appels_moteur"]))


if __name__ == "__main__":
    asyncio.run(lancer(sys.argv[1] if len(sys.argv) > 1 else "pcm"))
