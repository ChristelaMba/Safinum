"""Essai ponctuel du vrai moteur (phrases sans valeur). Ne montre jamais la cle."""
import asyncio, json, os, sys, time
sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "serveur"))
from dotenv import load_dotenv
load_dotenv(os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "serveur", ".env"))
import main

TEXTES = [
    "Votre solde disponible est de [MONTANT_1].",
    "Transfert de [MONTANT_1] vers [BENEF_1] effectué. Frais : [FRAIS_1].",
    "Solde insuffisant pour effectuer cette opération.",
    "Attention : ne communiquez jamais votre code à un tiers.",
    "Votre demande est en cours de traitement. Veuillez patienter <s1>[NOMBRE_1] heures</s1>.",
    "Merci de vérifier le nom du bénéficiaire avant de confirmer.",
]

async def go():
    langue = main.langues["pcm"]
    segs = [main.Segment(id=str(i), texte=t) for i, t in enumerate(TEXTES)]
    t0 = time.time()
    res = await main.traiter_lot(segs, langue)
    print("duree : %.1f s, appels au moteur : %d" % (time.time() - t0, main.etat["appels_moteur"]))
    for t, r in zip(TEXTES, res):
        print("-", t)
        print("   ->", r["texte_traduit"], "|", r["origine"], r["confiance"], r["type"], "| raison:", r["raison"])
    print("erreurs :", dict(main.etat["erreurs"]), main.llm.dernier_detail if hasattr(main.llm, "dernier_detail") else "")

asyncio.run(go())
