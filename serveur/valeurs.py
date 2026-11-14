"""Outils sur les balises de valeurs protegees et les marqueurs de structure.

Le remplacement des valeurs par des balises se fait dans l'extension. Ici le serveur verifie seulement
qu'il ne recoit aucune valeur brute et que les balises et marqueurs reviennent identiques.
"""
import re

BALISE = re.compile(r"\[(?:MONTANT|FRAIS|BENEF|NOMBRE|DATE|TEL|REF|POURCENT)_\d+\]")
# Marqueurs des elements en ligne : <s1>texte</s1>
MARQUEUR = re.compile(r"</?s\d+>")

# Une valeur brute (chiffres, devise, e-mail, adresse) ne doit jamais arriver jusqu'au serveur
VALEUR_BRUTE = re.compile(
    r"\d{3,}|\d+[.,]\d+|\d+\s?(?:FCFA|XAF|XOF|CFA|EUR|USD)\b|[$€£]"
    r"|[\w.+-]+@[\w-]+\.[\w.-]+|https?://\S+|\b[A-Z]{2}\d{2}[A-Z0-9]{10,}\b",
    re.IGNORECASE,
)


def balises(texte):
    return sorted(BALISE.findall(texte))


def marqueurs(texte):
    """Marqueurs dans l'ordre du texte."""
    return MARQUEUR.findall(texte)


def memes_balises(a, b):
    return balises(a) == balises(b)


def memes_marqueurs(a, b):
    """Memes marqueurs, dans le meme ordre."""
    return marqueurs(a) == marqueurs(b)


def sans_structure(texte):
    """Le texte sans balises ni marqueurs (pour regarder ce qui reste)."""
    return MARQUEUR.sub("", BALISE.sub("", texte))


def contient_valeur(texte):
    return bool(VALEUR_BRUTE.search(sans_structure(texte)))
