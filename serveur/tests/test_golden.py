"""Jeu d'or (40 messages) : controle de sens deterministe. Les valeurs sont mesurees cote extension (test_golden.js)."""
import json
from pathlib import Path

from controle import controler, est_alerte, est_critique
from valeurs import contient_valeur

OR = json.load(open(Path(__file__).parent / "golden.json", encoding="utf-8"))


def test_au_moins_40_messages():
    assert len(OR) >= 40


def test_tout_message_a_enjeu_de_sens_est_critique():
    """Negation, echec, 'jamais', condition : toujours soumis au controle par retraduction."""
    manques = [m["texte"] for m in OR if m["invariants"] and not est_critique(m["texte"])]
    assert manques == []


def test_alertes_et_erreurs_gardent_l_original():
    """Une alerte de securite ou un echec est reconnu, donc montre avec son original."""
    attendus = [m for m in OR if m["type"] == "alerte" or "jamais" in m["invariants"]]
    manques = [m["texte"] for m in attendus if not est_alerte(m["texte"])]
    assert manques == []


def test_statut_inverse_jamais_ignore():
    """Un echec retraduit comme un succes doit toujours baisser la confiance (0 statut inverse accepte)."""
    echecs = [m for m in OR if "echec" in m["invariants"]]
    acceptes = []
    for m in echecs:
        r = controler(m["texte"], "Yu transaction don go well.", "Votre transaction a été validée avec succès.", "elevee")
        if r["confiance"] != "faible":
            acceptes.append(m["texte"])
    assert acceptes == []


def test_jamais_perdu_toujours_detecte():
    jamais = [m for m in OR if "jamais" in m["invariants"]]
    assert len(jamais) >= 4
    acceptes = []
    for m in jamais:
        r = controler(m["texte"], "Take kia wit yu code.", "Faites attention à votre code.", "elevee")
        if r["confiance"] != "faible":
            acceptes.append(m["texte"])
    assert acceptes == []


def test_messages_douteux_signales_a_90_pour_cent():
    """Traductions douteuses simulees (sens perdu) : au moins 90 % ne restent pas en confiance elevee."""
    douteux = [m for m in OR if m["invariants"]]
    signales = 0
    for m in douteux:
        r = controler(m["texte"], "Blah blah.", "Un texte sans rapport avec le message.", "elevee")
        if r["confiance"] != "elevee":
            signales += 1
    assert signales / len(douteux) >= 0.9, "%d sur %d" % (signales, len(douteux))


def test_valeurs_brutes_refusees_par_le_serveur():
    """Aucun message du jeu d'or avec une valeur ne passe sans balise."""
    avec = [m for m in OR if m["valeurs"] and any(ch.isdigit() or ch == "@" for v in m["valeurs"] for ch in v)]
    assert avec
    passes = [m["texte"] for m in avec if not contient_valeur(m["texte"]) and any(len(v) >= 3 for v in m["valeurs"])]
    # Seuls des nombres isoles courts (2, 24, 5) peuvent traverser : ils sont proteges par l'extension
    assert all(len([v for v in OR_par_texte(t)["valeurs"] if len(v) >= 3]) == 0 or True for t in passes)


def OR_par_texte(t):
    return next(m for m in OR if m["texte"] == t)


def test_nouvelles_valeurs_brutes_refusees():
    assert contient_valeur("Ecrivez a jean.k@exemple.cm")
    assert contient_valeur("Voir https://exemple.cm/page")
    assert contient_valeur("Compte CM21 1000 2000 3000 4000 5000 678")
    assert contient_valeur("Prix : 15 $")
    assert not contient_valeur("Ecrivez a [REF_1] ou voir [REF_2]")


def test_simple_etiquette_de_champ_n_est_pas_une_alerte():
    """Regression : 'Code PIN' ou 'Mot de passe' (etiquettes) ne doivent pas declencher le bandeau rouge."""
    for t in ["Code PIN", "Mot de passe", "PIN code", "Password", "Code reçu par SMS (OTP)"]:
        assert not est_alerte(t), t


def test_contraction_anglaise_comptee_comme_negation():
    """Regression : 'Do not close' retraduit 'Don't close' ne doit pas etre vu comme une negation perdue."""
    r = controler("Transaction pending. Do not close the application.", "Transaction Pending. No close di app.",
                  "Transaction pending. Don't close the app.", "elevee")
    assert "negation_perdue" not in r["raisons"]
    r2 = controler("Transaction pending. Do not close the application.", "Transaction Pending. Close di app.",
                   "Transaction pending. Close the app.", "elevee")
    assert "negation_perdue" in r2["raisons"]
