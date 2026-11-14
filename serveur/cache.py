"""Cache en memoire des phrases deja traduites (texte sans valeurs, rien sur disque)."""
import json
import os
from collections import OrderedDict


class Cache:
    def __init__(self, taille_max=2000):
        self.taille_max = taille_max
        self.donnees = OrderedDict()
        self.succes = 0
        self.echecs = 0

    def lire(self, langue, cle):
        k = (langue, cle)
        if k in self.donnees:
            self.donnees.move_to_end(k)
            self.succes += 1
            return self.donnees[k]
        self.echecs += 1
        return None

    def stats(self):
        return {"entrees": len(self.donnees), "succes": self.succes, "echecs": self.echecs}

    def ecrire(self, langue, cle, valeur):
        self.donnees[(langue, cle)] = valeur
        self.donnees.move_to_end((langue, cle))
        while len(self.donnees) > self.taille_max:
            self.donnees.popitem(last=False)

    def precharger(self, chemin):
        """Charge cache_precharge.json (plan B : demo sans connexion)."""
        if not os.path.exists(chemin):
            return 0
        with open(chemin, encoding="utf-8") as fh:
            lignes = json.load(fh)
        for l in lignes:
            self.ecrire(l["langue"], l["cle"], l["resultat"])
        return len(lignes)
