"""Serveur SAFINUM (FastAPI) : glossaire, cache, moteur de langue, controle de fidelite, voix.

Lancer : python -m uvicorn main:app --port 8000
Le serveur ne recoit que du texte sans valeurs financieres et ne garde rien sur disque.
Les journaux ne contiennent jamais le texte des pages, seulement des types d'evenements et des compteurs.
"""
import asyncio
import logging
import io
import json
import os
import zipfile
import re
import sys
import time
from collections import Counter, defaultdict
from pathlib import Path

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse, JSONResponse, RedirectResponse, Response
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

load_dotenv()

from cache import Cache  # noqa: E402
from controle import (  # noqa: E402
    controler,
    detecter_langue,
    detecter_langue_complete,
    est_alerte,
    est_critique,
    plafonner,
    signal_alerte_lexical,
    termes_imposes_absents,
)
from glossaire import normaliser  # noqa: E402
from langues import charger_langues  # noqa: E402
from moteur import PHRASES_ERREUR, ErreurMoteur, MoteurNLLB, classer_erreur, creer_moteur  # noqa: E402
from valeurs import MARQUEUR, contient_valeur, memes_balises, memes_marqueurs, sans_structure  # noqa: E402

# Journaux techniques anonymes : jamais le texte des pages
logging.basicConfig(level=logging.INFO, format="%(asctime)s %(message)s")
journal = logging.getLogger("safinum")

RACINE = Path(__file__).resolve().parent.parent
LOT = int(os.getenv("SAFINUM_LOT", "25"))
CONCURRENCE = int(os.getenv("SAFINUM_CONCURRENCE", "4"))
TAILLE_MAX_CORPS = int(os.getenv("SAFINUM_TAILLE_MAX", "500000"))
# Requetes par minute et par client. Plancher a 120 : naviguer dans une application envoie plusieurs requetes, une valeur plus
# basse fait afficher les textes en original. Le vrai plafond est celui du fournisseur du modele.
DEBIT_MAX = max(120, int(os.getenv("SAFINUM_DEBIT", "120")))
SEUIL_PHRASES = 600

langues = charger_langues()
cache = Cache()
llm = creer_moteur()
nllb = MoteurNLLB()
etat = {"appels_moteur": 0, "erreurs": Counter(), "derniere_erreur": None, "segments": 0, "durees": []}

journal.info("precharge : %s entrees", cache.precharger(str(Path(__file__).parent / "cache_precharge.json")))

app = FastAPI(title="SAFINUM", version="2.0")

# CORS : en mode normal, seulement les origines necessaires (le serveur lui-meme et l'extension).
# SAFINUM_CORS = liste d'origines separees par des virgules (ex : le site du jury pour le script autonome).
# SAFINUM_DEV_CORS=1 ouvre tout (developpement seulement).
_origines = [o.strip() for o in os.getenv("SAFINUM_CORS", "http://localhost:8000,http://127.0.0.1:8000").split(",") if o.strip()]
if os.getenv("SAFINUM_DEV_CORS", "0") == "1":
    _origines = ["*"]
app.add_middleware(
    CORSMiddleware,
    allow_origins=_origines,
    allow_origin_regex=r"chrome-extension://.*|moz-extension://.*",
    allow_methods=["GET", "POST"],
    allow_headers=["Content-Type"],
)

_fenetres = defaultdict(list)


@app.middleware("http")
async def limites(request: Request, appel):
    """Limite la taille des corps et le debit par client (en memoire, rien n'est enregistre)."""
    longueur = request.headers.get("content-length")
    if longueur and longueur.isdigit() and int(longueur) > TAILLE_MAX_CORPS:
        return JSONResponse({"detail": "corps_trop_gros"}, status_code=413)
    if request.url.path.startswith("/v1/"):
        client = request.client.host if request.client else "?"
        maintenant = time.monotonic()
        recent = [t for t in _fenetres[client] if maintenant - t < 60]
        if len(recent) >= DEBIT_MAX:
            _fenetres[client] = recent
            return JSONResponse({"detail": "trop_de_requetes"}, status_code=429)
        recent.append(maintenant)
        _fenetres[client] = recent
    return await appel(request)


class Segment(BaseModel):
    id: str
    texte: str = Field(max_length=4000)
    role: str = "autre"
    langue_source: str | None = None


class Requete(BaseModel):
    langue_cible: str
    segments: list[Segment] = Field(max_length=120)


class RequeteVoix(BaseModel):
    langue: str
    texte: str = Field(max_length=400)


def reponse(seg_id, texte, origine, confiance, type_="autre", langue=None, afficher_original=False, raison=None):
    return {
        "id": seg_id,
        "texte_traduit": texte,
        "origine": origine,
        "confiance": confiance,
        "type": type_,
        "afficher_original": afficher_original,
        "statut_langue": langue.cfg["statut"] if langue else "stable",
        "raison": raison,
    }


def noter_erreur(type_):
    """On garde seulement le TYPE de l'erreur, jamais le texte."""
    etat["erreurs"][type_] += 1
    etat["derniere_erreur"] = {"type": type_, "quand": time.strftime("%Y-%m-%d %H:%M:%S")}
    journal.info("erreur_moteur type=%s", type_)


def decouper_phrases(texte, maxi=SEUIL_PHRASES):
    """Texte long : paquets de phrases entieres de 600 caracteres au plus."""
    phrases = re.split(r"(?<=[.!?])\s+", texte)
    paquets, courant = [], ""
    for p in phrases:
        if courant and len(courant) + 1 + len(p) > maxi:
            paquets.append(courant)
            courant = p
        else:
            courant = (courant + " " + p).strip()
    if courant:
        paquets.append(courant)
    return paquets


async def moteur_nllb(texte, langue, src):
    """Fulfulde : NLLB-200 apres simplification, plafond de confiance 'moyenne'."""
    cfg = langue.cfg
    base = texte
    if cfg["traduction"].get("pre_simplification") and llm.disponible:
        try:
            base = await llm.simplifier(texte)
        except Exception:  # noqa: BLE001
            base = texte
    trad = await nllb.traduire(base, cfg["code_nllb"], src)
    if not trad:
        return None
    type_ = "autre"
    if llm.disponible:
        try:
            type_ = await llm.classer(texte)
        except Exception:  # noqa: BLE001
            type_ = "autre"
    return {"traduction": trad, "type": type_, "confiance_moteur": "moyenne"}


def type_fiable(texte, type_modele):
    """Le modele peut classer une phrase ordinaire en erreur ou alerte : sans mot d'alerte dans la source, on n'en tient pas compte."""
    if type_modele in ("erreur", "alerte") and not signal_alerte_lexical(texte):
        return "autre"
    return type_modele


def verdict(unite, trad, retra, langue, termes):
    """Controle de fidelite d'une traduction. Retourne le dict de reponse partiel ou un blocage."""
    texte = unite["texte"]
    cfg = langue.cfg
    critique = unite["critique"]
    experimental = cfg.get("statut") == "experimental"
    # Retraduction demandee pour les textes critiques (et pour NLLB). Langue experimentale : confiance plafonnee, original toujours a cote.
    ctl = controler(texte, trad["traduction"], retra, trad["confiance_moteur"], retraduction_requise=critique or cfg["traduction"]["moteur"] != "llm")
    if not ctl["ok"]:
        return {"bloque": True, "raison": ",".join(ctl["raisons"])}
    confiance = plafonner(ctl["confiance"], cfg.get("plafond_confiance"))
    raisons = list(ctl["raisons"])
    # Une "traduction" identique a la source n'en est pas une (le modele recopie quand il ne sait pas)
    if len(sans_structure(texte).split()) >= 3 and normaliser(sans_structure(trad["traduction"])) == normaliser(sans_structure(texte)):
        raisons.append("non_traduit")
        confiance = "faible"
    absents = termes_imposes_absents(termes, texte, trad["traduction"])
    if absents:
        raisons.append("terme_impose_absent")
        if confiance == "elevee":
            confiance = "moyenne"
    return {"traduction": trad["traduction"], "type": type_fiable(texte, trad["type"]), "confiance": confiance, "raison": ",".join(raisons) or None}


async def traiter_unites(unites, langue):
    """Traduit des unites {id, texte, role, src, alerte} par le moteur de la langue. Resultat : {id: reponse}."""
    cfg = langue.cfg
    sortie = {}
    sem = asyncio.Semaphore(CONCURRENCE)

    if cfg["traduction"]["moteur"] != "llm":
        async def une(u):
            async with sem:
                try:
                    res = await moteur_nllb(u["texte"], langue, u["src"])
                except Exception as e:  # noqa: BLE001
                    noter_erreur(classer_erreur(e))
                    return u, None
            return u, res

        paires = await asyncio.gather(*(une(u) for u in unites))
        traductions = {u["id"]: (r, langue.glossaire.termes_dans(u["texte"])) for u, r in paires if r}
        for u, r in paires:
            if not r:
                sortie[u["id"]] = reponse(u["id"], u["texte"], "original", "faible", langue=langue, afficher_original=u["alerte"], raison="moteur_indisponible")
        await _controler_et_ecrire([u for u in unites if u["id"] in traductions], traductions, langue, sortie, retras={})
        return sortie

    if not llm.disponible:
        cause = llm.cause or "moteur_indisponible"
        noter_erreur(cause)
        for u in unites:
            sortie[u["id"]] = reponse(u["id"], u["texte"], "original", "faible", langue=langue, afficher_original=u["alerte"], raison=cause)
        return sortie

    lots = [unites[i : i + LOT] for i in range(0, len(unites), LOT)]
    traductions = {}

    async def traduire_un_lot(lot):
        items = []
        for u in lot:
            items.append({"id": u["id"], "texte": u["texte"], "role": u["role"], "src": u["src"], "termes": langue.glossaire.termes_dans(u["texte"])})
        async with sem:
            try:
                etat["appels_moteur"] += 1
                res = await llm.traduire_lot(items, cfg)
            except Exception as e:  # noqa: BLE001
                type_ = classer_erreur(e)
                noter_erreur(type_)
                for u in lot:
                    sortie[u["id"]] = reponse(u["id"], u["texte"], "original", "faible", langue=langue, afficher_original=u["alerte"], raison=type_)
                return
            # Un element manquant, invalide ou dont une balise a change : on ne retraite que celui-la, une fois
            for it in items:
                if it["id"] in res and memes_balises(it["texte"], res[it["id"]].get("traduction", "")) and memes_marqueurs(it["texte"], res[it["id"]].get("traduction", "")):
                    continue
                try:
                    etat["appels_moteur"] += 1
                    r1 = await llm.traduire(it["texte"], cfg, it["termes"], it["src"])
                    res[it["id"]] = r1
                except Exception as e:  # noqa: BLE001
                    noter_erreur(classer_erreur(e))
        for it in items:
            if it["id"] in res and res[it["id"]].get("traduction"):
                traductions[it["id"]] = (res[it["id"]], it["termes"])
            else:
                u = next(x for x in lot if x["id"] == it["id"])
                sortie[it["id"]] = reponse(it["id"], u["texte"], "original", "faible", langue=langue, afficher_original=u["alerte"], raison="reponse_invalide")

    await asyncio.gather(*(traduire_un_lot(l) for l in lots))

    # Controle par retraduction, en lots, seulement pour les textes qui peuvent changer le sens d'une operation
    retras = {}
    experimental = cfg.get("statut") == "experimental"
    a_verifier = [u for u in unites if u["id"] in traductions and (u["critique"] or type_fiable(u["texte"], traductions[u["id"]][0].get("type")) in ("erreur", "alerte", "confirmation", "transfert_reussi"))]
    for u in a_verifier:
        u["critique"] = True

    async def retraduire_un_lot(lot):
        items = [{"id": u["id"], "texte": traductions[u["id"]][0]["traduction"], "src": u["src"]} for u in lot]
        async with sem:
            try:
                etat["appels_moteur"] += 1
                retras.update(await llm.retraduire_lot(items, cfg))
            except Exception as e:  # noqa: BLE001
                noter_erreur(classer_erreur(e))

    await asyncio.gather(*(retraduire_un_lot(a_verifier[i : i + LOT]) for i in range(0, len(a_verifier), LOT)))
    await _controler_et_ecrire([u for u in unites if u["id"] in traductions], traductions, langue, sortie, retras)
    return sortie


async def _controler_et_ecrire(unites, traductions, langue, sortie, retras):
    for u in unites:
        trad, termes = traductions[u["id"]]
        v = verdict(u, trad, retras.get(u["id"], ""), langue, termes)
        if v.get("bloque"):
            sortie[u["id"]] = reponse(u["id"], u["texte"], "original", "faible", langue=langue, afficher_original=True, raison=v["raison"])
            continue
        afficher = u["alerte"] or v["type"] in ("erreur", "alerte")  # type deja verifie par type_fiable
        r = reponse(u["id"], v["traduction"], "moteur", v["confiance"], v["type"], langue, afficher, v["raison"])
        sortie[u["id"]] = r
        cache.ecrire(langue.code, normaliser(u["texte"]), r)


def combiner(seg_id, parties, resultats, langue):
    """Texte long decoupe en phrases : on recolle les morceaux. Un morceau refuse = tout le texte reste en original."""
    rs = [resultats[p["id"]] for p in parties]
    for r in rs:
        if r["origine"] == "original":
            return reponse(seg_id, parties[0]["tout"], "original", "faible", langue=langue, afficher_original=r["afficher_original"], raison=r["raison"])
    ordre = {"faible": 0, "moyenne": 1, "elevee": 2}
    conf = min((r["confiance"] for r in rs), key=lambda c: ordre[c])
    type_ = next((r["type"] for r in rs if r["type"] in ("alerte", "erreur")), rs[0]["type"])
    return reponse(seg_id, " ".join(r["texte_traduit"] for r in rs), "moteur", conf, type_, langue, any(r["afficher_original"] for r in rs), None)


async def traiter_lot(segments, langue):
    """Chaine complete pour une liste de segments : unites, glossaire, cache, moteur par lots, controle."""
    etat["segments"] += len(segments)
    resultats = {}
    unites = []
    groupes = {}
    for seg in segments:
        texte = seg.texte.strip()
        alerte = est_alerte(texte)
        if not texte:
            resultats[seg.id] = reponse(seg.id, texte, "original", "elevee", langue=langue, raison="vide")
            continue
        # Une valeur brute ne doit pas arriver ici
        if contient_valeur(texte):
            resultats[seg.id] = reponse(seg.id, texte, "original", "faible", langue=langue, afficher_original=alerte, raison="valeur_non_protegee")
            continue
        src = seg.langue_source if seg.langue_source in ("fr", "en") else None
        detectee = detecter_langue_complete(texte)
        if detectee == "sans_lettres":
            resultats[seg.id] = reponse(seg.id, texte, "original", "elevee", langue=langue, raison="sans_lettres")
            continue
        if detectee == "pcm":
            resultats[seg.id] = reponse(seg.id, texte, "original", "elevee", langue=langue, raison="deja_langue_cible")
            continue
        if detectee == "autre" and not src:
            resultats[seg.id] = reponse(seg.id, texte, "original", "faible", langue=langue, afficher_original=alerte, raison="langue_non_geree")
            continue
        src = src or ("en" if detectee == "en" else "fr")

        # 1. Glossaire
        ligne, suffixe = langue.glossaire.chercher(texte) if not MARQUEUR.search(texte) else (None, "")
        if ligne:
            resultats[seg.id] = reponse(seg.id, ligne["cible"] + suffixe, "glossaire", langue.glossaire.confiance_affichee(ligne), "libelle", langue, alerte)
            continue
        # 2. Cache
        deja = cache.lire(langue.code, normaliser(texte))
        if deja:
            r = dict(deja)
            r.update({"id": seg.id, "origine": "cache"})
            if r.get("type") in ("erreur", "alerte") and type_fiable(texte, r["type"]) == "autre":
                r["type"] = "autre"  # ancienne entree classee a tort en alerte
                r["afficher_original"] = bool(alerte)
            resultats[seg.id] = r
            continue
        # 3. Moteur de langue (les textes longs sans marqueur sont coupes en phrases)
        if len(texte) > SEUIL_PHRASES and not MARQUEUR.search(texte):
            parties = []
            for k, morceau in enumerate(decouper_phrases(texte)):
                ident = "%s#%d" % (seg.id, k)
                parties.append({"id": ident, "tout": texte})
                unites.append({"id": ident, "texte": morceau, "role": seg.role, "src": src, "alerte": alerte, "critique": est_critique(morceau)})
            groupes[seg.id] = parties
        else:
            unites.append({"id": seg.id, "texte": texte, "role": seg.role, "src": src, "alerte": alerte, "critique": est_critique(texte)})

    if unites:
        traduits = await traiter_unites(unites, langue)
        for seg_id, parties in groupes.items():
            resultats[seg_id] = combiner(seg_id, parties, traduits, langue)
        for u in unites:
            if "#" not in u["id"] or u["id"].split("#")[0] not in groupes:
                resultats[u["id"]] = traduits[u["id"]]
    return [resultats[s.id] for s in segments]


async def traiter(seg, langue):
    """Un seul segment (utilise par les outils)."""
    return (await traiter_lot([seg], langue))[0]


@app.post("/v1/translate")
async def translate(req: Requete):
    langue = langues.get(req.langue_cible)
    if langue is None:
        raise HTTPException(status_code=400, detail="langue_inconnue")
    debut = time.monotonic()
    appels_avant = etat["appels_moteur"]
    resultats = await traiter_lot(req.segments, langue)
    # Duree de la requete et nombre d'appels au modele (jamais le texte)
    etat["durees"] = (etat["durees"] + [{"segments": len(resultats), "appels_modele": etat["appels_moteur"] - appels_avant, "secondes": round(time.monotonic() - debut, 1)}])[-12:]
    journal.info("lot langue=%s segments=%d origines=%s", langue.code, len(resultats), sorted({r["origine"] for r in resultats}))
    return {
        "segments": resultats,
        "audio_url": None,
        "moteur": {"disponible": bool(llm.disponible), "cause": llm.cause, "phrase": PHRASES_ERREUR.get(llm.cause) if llm.cause else None},
    }


@app.get("/v1/langues")
def liste_langues():
    return [l.public() for l in langues.values()]


@app.get("/health")
def sante():
    return {"ok": True, "moteur_llm": bool(llm.disponible), "cause": llm.cause, "langues": [l.public() for l in langues.values()]}


@app.get("/diagnostic")
async def diagnostic(sonde: int = 0, modeles: int = 0):
    """Etat detaille. Avec ?sonde=1, un tout petit appel reel au moteur donne la cause exacte d'un echec."""
    cause = llm.cause
    detail = None
    liste_modeles = None
    par_modele = {}
    if sonde and llm.disponible:
        # On teste le modele principal ET le modele rapide : l'un peut marcher quand l'autre n'a plus de quota
        for rapide in ((False, True) if llm.modele != llm.modele_rapide else (False,)):
            nom_modele = llm.modele_rapide if rapide else llm.modele
            try:
                await llm._appel("Reponds par le mot ok.", "ok", 64, rapide)
                par_modele[nom_modele] = "ok"
            except Exception as e:  # noqa: BLE001
                type_ = classer_erreur(e)
                par_modele[nom_modele] = type_ + " | " + str(getattr(e, "detail", "") or "")[:120]
                if cause is None:
                    cause = type_
                    detail = getattr(e, "detail", None)
                noter_erreur(type_)
    if modeles and hasattr(llm, "lister_modeles"):
        try:
            liste_modeles = await llm.lister_modeles()
        except Exception as e:  # noqa: BLE001
            liste_modeles = ["erreur : " + classer_erreur(e) + " " + str(getattr(e, "detail", "") or "")]
    return {
        "version": app.version,
        "python": "%d.%d.%d" % sys.version_info[:3],
        "moteur": {
            "fournisseur": llm.nom,
            "disponible": bool(llm.disponible) and cause is None,
            "cause": cause,
            "phrase": PHRASES_ERREUR.get(cause) if cause else None,
            "detail": detail or getattr(llm, "dernier_detail", None),
            "sonde_par_modele": par_modele,
            "modeles_disponibles": liste_modeles,
            "repli_sur_modele_rapide": bool(getattr(llm, "repli_modele", False)),
            "modele": llm.modele,
            "modele_rapide": llm.modele_rapide,
        },
        "debit": {"lot": LOT, "concurrence": CONCURRENCE, "delai": os.getenv("SAFINUM_DELAI", "25"), "requetes_par_minute": DEBIT_MAX},
        "strict": os.getenv("SAFINUM_STRICT", "0") == "1",
        "tts": os.getenv("SAFINUM_TTS", "0") == "1",
        "cache": cache.stats(),
        "appels_moteur": etat["appels_moteur"],
        "dernieres_requetes": etat["durees"],
        "segments_recus": etat["segments"],
        "erreurs_par_type": dict(etat["erreurs"]),
        "derniere_erreur": etat["derniere_erreur"],
        "langues": [l.public() for l in langues.values()],
        "cors": _origines,
    }


@app.post("/v1/tts")
def tts(req: RequeteVoix):
    """Voix MMS pour un texte SANS valeur. Les montants sont lus par le navigateur."""
    if os.getenv("SAFINUM_TTS", "0") != "1":
        raise HTTPException(status_code=501, detail="tts_desactive")
    langue = langues.get(req.langue)
    if langue is None:
        raise HTTPException(status_code=400, detail="langue_inconnue")
    if contient_valeur(req.texte):
        raise HTTPException(status_code=400, detail="valeur_non_protegee")
    try:
        from voix_serveur import synthetiser

        octets = synthetiser(langue.cfg["voix"]["modele"], req.texte)
    except Exception:  # noqa: BLE001
        raise HTTPException(status_code=501, detail="tts_indisponible")
    return Response(content=octets, media_type="audio/wav")


@app.get("/safinum-inject.js")
def script_autonome():
    """Plan B : le script autonome, pour un favori ou la console (voir README)."""
    chemin = RACINE / "extension" / "safinum-inject.js"
    if not chemin.exists():
        raise HTTPException(status_code=404, detail="script_non_construit")
    return Response(content=chemin.read_bytes(), media_type="application/javascript")


PAGE_ESSAYER = """<!DOCTYPE html>
<html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Essayer SAFINUM</title>
<style>
body{font-family:system-ui,Arial,sans-serif;margin:0;background:#f4f7f5;color:#12261d;line-height:1.5}
main{max-width:760px;margin:0 auto;padding:24px 16px 48px}
h1{margin:0 0 4px}h2{margin-top:32px}
.carte{background:#fff;border:2px solid #0f5c45;border-radius:14px;padding:16px 18px;margin:14px 0}
a.gros{display:inline-block;background:#0f5c45;color:#fff;text-decoration:none;font-weight:700;padding:14px 20px;border-radius:10px;min-height:44px;box-sizing:border-box}
a.gros:focus,a.gros:hover{outline:3px solid #f0b429}
code{background:#eef2ef;padding:2px 6px;border-radius:4px;word-break:break-all}
.note{font-size:.92rem;color:#3a4d44}
</style></head><body><main>
<h1>SAFINUM</h1>
<p>Traduit une application financi&egrave;re en Pidgin ou en Fulfulde (exp&eacute;rimental) et la lit &agrave; voix haute. Les montants, frais et b&eacute;n&eacute;ficiaires ne sont jamais modifi&eacute;s. SAFINUM n'effectue aucune action &agrave; votre place.</p>

<h2>Installer l'extension (recommand&eacute; : fonctionne sur n'importe quel site)</h2>
<div class="carte">
<p><a class="gros" href="/safinum-extension.zip">T&eacute;l&eacute;charger l'extension SAFINUM</a></p>
<ol>
<li>D&eacute;compressez le fichier t&eacute;l&eacute;charg&eacute; (clic droit, &laquo; Extraire tout &raquo;).</li>
<li>Dans Chrome ou Edge, ouvrez <code>chrome://extensions</code> (Edge : <code>edge://extensions</code>) et activez le <b>mode d&eacute;veloppeur</b>.</li>
<li>Cliquez sur <b>Charger l'extension non empaquet&eacute;e</b> et choisissez le dossier <code>safinum-extension</code>.</li>
<li>Ouvrez un site, cliquez sur l'ic&ocirc;ne SAFINUM (ou sur la puce SAFINUM de la page), acceptez, puis choisissez <b>Pidgin</b> ou <b>Fulfulde</b>.</li>
</ol>
<p class="note">L'extension est d&eacute;j&agrave; r&eacute;gl&eacute;e sur ce serveur : aucune adresse &agrave; saisir. La langue choisie reste active d'une page &agrave; l'autre ; &laquo; Arr&ecirc;ter &raquo; remet la page comme avant.</p>
</div>

<h2>Sans rien installer</h2>
<div class="carte">
<p>Banque de d&eacute;monstration (donn&eacute;es simul&eacute;es) avec SAFINUM d&eacute;j&agrave; actif :</p>
<p><a class="gros" href="/banque/banque_simple/?safinum=1">Ouvrir la banque de d&eacute;monstration</a></p>
<p class="note">Autres variantes : <a href="/banque/?safinum=1">liste des pages de test</a>. Pour une autre page web sans extension : glissez ce bouton dans vos favoris puis cliquez dessus sur la page
(<a href="javascript:(function(){window.SAFINUM_URL='__URL__';var s=document.createElement('script');s.src='__URL__/safinum-inject.js';document.head.appendChild(s);})();">SAFINUM</a>) ; certains sites le bloquent, l'extension n'a pas cette limite.</p>
</div>

<h2>&Agrave; savoir</h2>
<ul>
<li>La premi&egrave;re traduction d'une page jamais vue prend quelques secondes ; une page d&eacute;j&agrave; vue est quasi instantan&eacute;e.</li>
<li>Le Pidgin et le Fulfulde n'ont pas encore &eacute;t&eacute; relus par des locuteurs : en cas de doute, l'original est affich&eacute; entre parenth&egrave;ses.</li>
<li>Aucun texte de page n'est conserv&eacute; avec un nom ; les champs secrets (mot de passe, PIN, code) ne sont jamais lus ni envoy&eacute;s.</li>
<li>Bouton &laquo; Arr&ecirc;ter &raquo; : la page revient exactement comme avant.</li>
</ul>
<p class="note">&Eacute;tat du serveur : <a href="/health">/health</a></p>
</main></body></html>"""


def _url_publique(request: Request) -> str:
    fixe = os.getenv("SAFINUM_URL_PUBLIQUE", "").strip().rstrip("/")
    if fixe:
        return fixe
    proto = request.headers.get("x-forwarded-proto", request.url.scheme)
    hote = request.headers.get("x-forwarded-host", request.headers.get("host", "localhost:8000"))
    return "%s://%s" % (proto.split(",")[0].strip(), hote.split(",")[0].strip())


@app.get("/safinum-extension.zip", include_in_schema=False)
def telecharger_extension(request: Request):
    """L'extension prete a installer, reglee sur l'adresse de CE serveur : le jury n'a rien a configurer."""
    dossier = RACINE / "extension"
    if not (dossier / "manifest.json").exists():
        raise HTTPException(status_code=404, detail="extension_absente")
    tampon = io.BytesIO()
    with zipfile.ZipFile(tampon, "w", zipfile.ZIP_DEFLATED) as z:
        for f in sorted(dossier.rglob("*")):
            rel = f.relative_to(dossier).as_posix()
            if not f.is_file() or rel.startswith("tests/") or rel.startswith("node_modules/") or rel == "safinum-inject.js" or rel == "config.json":
                continue
            z.write(f, "safinum-extension/" + rel)
        z.writestr("safinum-extension/config.json", json.dumps({"serveur": _url_publique(request)}))
    return Response(content=tampon.getvalue(), media_type="application/zip",
                    headers={"Content-Disposition": "attachment; filename=safinum-extension.zip"})


@app.get("/", include_in_schema=False)
def racine():
    return RedirectResponse("/essayer")


@app.get("/essayer", include_in_schema=False)
def essayer(request: Request):
    """Page d'accueil pour le jury : un clic, rien a installer."""
    return HTMLResponse(PAGE_ESSAYER.replace("__URL__", _url_publique(request)))


# Pages de test de la banque simulee : http://localhost:8000/banque/
app.mount("/banque", StaticFiles(directory=str(RACINE / "pages_test"), html=True), name="banque")
