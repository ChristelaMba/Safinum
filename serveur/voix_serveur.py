"""Voix MMS-TTS (facultatif). Active seulement avec SAFINUM_TTS=1 et transformers, torch, scipy."""
import io

_modeles = {}


def synthetiser(nom_modele, texte):
    """Retourne les octets d'un fichier WAV. Leve une erreur si les bibliotheques manquent."""
    import torch
    from scipy.io import wavfile
    from transformers import AutoTokenizer, VitsModel

    if nom_modele not in _modeles:
        _modeles[nom_modele] = (
            AutoTokenizer.from_pretrained(nom_modele),
            VitsModel.from_pretrained(nom_modele),
        )
    tokenizer, modele = _modeles[nom_modele]
    entree = tokenizer(texte, return_tensors="pt")
    with torch.no_grad():
        onde = modele(**entree).waveform[0].numpy()
    tampon = io.BytesIO()
    wavfile.write(tampon, modele.config.sampling_rate, onde)
    return tampon.getvalue()
