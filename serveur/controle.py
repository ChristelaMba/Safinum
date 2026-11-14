"""Controle de fidelite (F6) : balises, sens critique, comparaison avec la retraduction.

Limite declaree : la retraduction est faite par le meme modele, ce n'est pas un controle
independant. Il est complete par des regles deterministes sur les mots critiques.
"""
import re

from glossaire import normaliser
from valeurs import BALISE, memes_balises, memes_marqueurs, sans_structure

ORDRE = {"faible": 0, "moyenne": 1, "elevee": 2}

NEGATION = re.compile(
    r"\b(jamais|never|pas|not|non|aucun|[a-z]+n't|cannot|insuffisan\w*|insufficient|incorrect\w*|invalide\w*|invalid|"
    r"echou\w*|fail\w*|refus\w*|declin\w*|reject\w*|erreur|error|impossible|interdit|bloqu\w*|"
    r"block\w*|expire\w*|suspect\w*|fraud\w*|arnaque|scam|indisponible\w*|unavailable|reessay\w*|try again)\b"
)
JAMAIS = re.compile(r"\b(jamais|never)\b")
RETOUR_JAMAIS = re.compile(r"\b(jamais|never|pas|not|aucun|interdit|ne\s+\w+\s+pas)\b")
SUCCES = re.compile(
    r"\b(succes|reussi\w*|effectue\w*|valide\w*|accepte\w*|termine\w*|complete\w*|enregistre\w*|recu\w*|"
    r"success\w*|approved|done|recorded|completed|received|accepted)\b"
)
ALERTE = re.compile(
    r"\b(jamais|never|insuffisan\w*|insufficient|incorrect\w*|erreur|error|suspect\w*|"
    r"alerte|alert|attention|warning|fraud\w*|arnaque|scam|bloqu\w*|blocked|irreversible|"
    r"partag\w*|share|divulg\w*)\b"
)
CONDITION = re.compile(
    r"\b(si|avant|apres|au plus|au moins|maximum|minimum|plafond|limite\w*|jusqu\w*|seulement|uniquement|valable|par jour|par transfert|"
    r"if|before|after|at most|at least|limit\w*|up to|only|unless|valid for)\b"
)
# Mots de securite dont la forme du glossaire doit apparaitre dans la traduction
TERMES_CRITIQUES = {"pin", "code", "code pin", "code secret", "otp", "mot de passe", "password", "solde insuffisant",
                    "insufficient balance", "cvv", "arnaque", "fraude", "scam", "fraud"}
MOTS_VIDES = {
    "votre", "vous", "pour", "dans", "cette", "avec", "sont", "etre", "plus", "vers", "your",
    "this", "that", "with", "have", "been", "from", "will", "des", "les", "une", "est", "que",
}


def mots(texte):
    t = normaliser(sans_structure(texte))
    return {m for m in t.split() if len(m) > 3 and m not in MOTS_VIDES}


def est_alerte(texte):
    """Vrai si le message est une erreur ou une alerte de securite : l'original reste toujours montre."""
    return bool(ALERTE.search(normaliser(texte)))


def signal_alerte_lexical(texte):
    """Vrai si le texte contient un mot d'erreur, de refus ou d'alerte. Sert a ne pas croire seul
    le modele quand il classe une phrase ordinaire (description, publicite) en alerte."""
    t = normaliser(sans_structure(texte))
    return bool(NEGATION.search(t) or ALERTE.search(t))


def est_critique(texte):
    """Vrai si le sens peut changer une operation : negation, statut, condition, alerte, ou texte long.
    Ces textes subissent le controle par retraduction."""
    t = normaliser(sans_structure(texte))
    return bool(NEGATION.search(t) or ALERTE.search(t) or CONDITION.search(t) or SUCCES.search(t) or len(t) > 90)


MOTS_PIDGIN = ("wetin", "dey", "na", "yu", "fo", "don", "pikin", "dis", "dem", "make", "sabi", "wan", "no", "go")


def detecter_langue_complete(texte):
    """Retourne fr, en, pcm (deja dans la langue cible) ou autre (langue non geree)."""
    t = " " + normaliser(sans_structure(texte)) + " "
    if not re.search(r"[a-z]", t):
        return "sans_lettres"
    pcm = sum(1 for m in MOTS_PIDGIN if " " + m + " " in t)
    langue = detecter_langue(texte)
    mots_longs = [m for m in t.split() if len(m) > 2]
    if pcm >= 3 and pcm >= len(mots_longs) / 3:
        return "pcm"
    if len(mots_longs) >= 5 and not _mots_connus(t) and _autre_langue(t):
        return "autre"
    return langue


FR_EN_COURANTS = ("le", "la", "les", "de", "du", "des", "votre", "vous", "est", "un", "une", "pour", "dans", "vers", "sur", "et",
                  "the", "your", "you", "is", "are", "has", "been", "to", "for", "of", "and", "in", "on", "will", "can", "please",
                  "qui", "que", "au", "aux", "en", "par", "avec", "sans", "ce", "ces", "nos", "vos", "son", "ses", "ou", "ne", "pas", "plus", "moins", "ma", "mon", "mes")


# Mots courants d'autres langues : "autre" seulement si on en reconnait vraiment (jamais par simple absence de mots francais)
AUTRES_LANGUES = (
    "der", "die", "das", "und", "ist", "nicht", "ein", "eine", "mit", "auf", "heute", "leider",
    "el", "los", "las", "una", "por", "para", "con", "esta", "pero", "como",
    "o", "os", "uma", "para", "com", "nao", "mais", "voce",
    "il", "gli", "una", "per", "con", "non", "che", "sono",
    "het", "een", "niet", "van", "zijn",
)


def _autre_langue(t):
    return sum(1 for m in set(AUTRES_LANGUES) if " " + m + " " in t) >= 3


def _mots_connus(t):
    return any(" " + m + " " in t for m in FR_EN_COURANTS)


def termes_imposes_absents(termes, source, traduction):
    """Termes de securite du glossaire presents dans la source mais absents (sous leur forme du glossaire) de la traduction."""
    s = " " + normaliser(sans_structure(source)) + " "
    t = " " + normaliser(sans_structure(traduction)) + " "
    absents = []
    for terme in termes:
        k = normaliser(terme["source"])
        if k in TERMES_CRITIQUES and (" " + k + " ") in s:
            if normaliser(terme["cible"]) not in t:
                absents.append(terme["source"])
    return absents


def detecter_langue(texte):
    t = " " + normaliser(sans_structure(texte)) + " "
    en = sum(1 for m in ("the", "your", "has", "been", "is", "was", "amount", "please", "never", "you", "fee", "balance", "transfer", "insufficient") if " " + m + " " in t)
    fr = sum(1 for m in ("le", "la", "les", "votre", "vos", "est", "a", "ete", "de", "du", "des", "vous", "pas", "jamais", "solde", "frais", "montant", "une", "un", "pour", "vers", "dans", "cette") if " " + m + " " in t)
    return "en" if en > fr else "fr"


def controler(source, traduction, retraduction, confiance_moteur="moyenne", retraduction_requise=True):
    """Retourne un dict : ok (bool), confiance (elevee/moyenne/faible), raisons (liste)."""
    raisons = []
    if not memes_balises(source, traduction):
        return {"ok": False, "confiance": "faible", "raisons": ["balises_modifiees"]}
    if not memes_marqueurs(source, traduction):
        return {"ok": False, "confiance": "faible", "raisons": ["marqueurs_modifies"]}

    confiance = confiance_moteur if confiance_moteur in ORDRE else "moyenne"

    if not retraduction and not retraduction_requise:
        # Texte sans enjeu de sens : pas de retraduction demandee, on garde la confiance du moteur
        return {"ok": True, "confiance": confiance, "raisons": raisons}
    if not retraduction:
        raisons.append("pas_de_retraduction")
        confiance = min(confiance, "moyenne", key=lambda c: ORDRE[c])
        return {"ok": True, "confiance": confiance, "raisons": raisons}

    s = normaliser(source)
    r = normaliser(retraduction)

    # Statut inverse : un echec devenu un succes, ou l'inverse
    s_neg, r_neg = bool(NEGATION.search(s)), bool(NEGATION.search(r))
    s_ok, r_ok = bool(SUCCES.search(s)), bool(SUCCES.search(r))
    if s_neg and not r_neg:
        raisons.append("negation_perdue")
        confiance = "faible"
    if (not s_neg) and s_ok and r_neg and not r_ok:
        raisons.append("statut_inverse")
        confiance = "faible"
    # Les 'jamais' des messages de securite
    if JAMAIS.search(s) and not RETOUR_JAMAIS.search(r):
        raisons.append("jamais_perdu")
        confiance = "faible"

    # Recouvrement des mots importants
    ms, mr = mots(source), mots(retraduction)
    if len(ms) >= 2:
        taux = len(ms & mr) / len(ms)
        if taux < 0.2:
            raisons.append("sens_different")
            confiance = "faible"
        elif taux < 0.4:
            raisons.append("sens_proche")
            confiance = min(confiance, "moyenne", key=lambda c: ORDRE[c])
    return {"ok": True, "confiance": confiance, "raisons": raisons}


def plafonner(confiance, plafond):
    if plafond in ORDRE and ORDRE[confiance] > ORDRE[plafond]:
        return plafond
    return confiance
