"""Test obligatoire du premier jour (J-2) : generer un echantillon audio MMS-TTS en Pidgin et en Fulfulde.

    pip install transformers torch scipy
    python outils/tester_voix.py

Fait ecouter les fichiers .wav a une personne qui comprend la langue. Si la voix Fulfulde n'est pas
comprehensible, appliquer le plan de repli (section 4.2 du cahier des charges).
"""
import io
import sys

import torch
from scipy.io import wavfile
from transformers import AutoTokenizer, VitsModel

ECHANTILLONS = {
    "pcm": ("facebook/mms-tts-pcm", "Yu get plenti mone for yu akaunt."),
    "ful": ("facebook/mms-tts-ful", "Ceede ɗe a jogii."),
}

for code, (modele, texte) in ECHANTILLONS.items():
    print("Chargement de", modele)
    tok = AutoTokenizer.from_pretrained(modele)
    mod = VitsModel.from_pretrained(modele)
    with torch.no_grad():
        onde = mod(**tok(texte, return_tensors="pt")).waveform[0].numpy()
    fichier = "echantillon_" + code + ".wav"
    wavfile.write(fichier, mod.config.sampling_rate, onde)
    print("ecrit :", fichier)
