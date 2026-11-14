"""Chargement des modules de langue (un fichier YAML + un glossaire CSV par langue)."""
import os
from pathlib import Path

import yaml

from glossaire import Glossaire

BASE = Path(__file__).parent


class Langue:
    def __init__(self, cfg, strict):
        self.cfg = cfg
        self.code = cfg["code"]
        self.glossaire = Glossaire(BASE / cfg["glossaire"], cfg.get("mapping_confiance", {}), strict)

    def public(self):
        return {
            "code": self.code,
            "nom": self.cfg["nom"],
            "statut": self.cfg["statut"],
            "variete": self.cfg.get("variete", ""),
            "voix": self.cfg.get("voix", {}),
            "termes": len(self.glossaire.lignes),
            "termes_non_valides": self.glossaire.nb_brouillons(),
        }


def charger_langues():
    strict = os.getenv("SAFINUM_STRICT", "0") == "1"
    langues = {}
    for f in sorted((BASE / "langues").glob("*.yaml")):
        with open(f, encoding="utf-8") as fh:
            cfg = yaml.safe_load(fh)
        langues[cfg["code"]] = Langue(cfg, strict)
    return langues
