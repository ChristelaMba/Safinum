import os
import sys

# Pas de cle API pendant les tests : le moteur est remplace par un faux moteur
# Les tests ne lisent JAMAIS le vrai .env et n'appellent jamais un vrai fournisseur
os.environ["SAFINUM_MOTEUR"] = "anthropic"
os.environ["ANTHROPIC_API_KEY"] = ""
os.environ["SAFINUM_LLM_KEY"] = ""
os.environ["SAFINUM_LLM_URL"] = ""
os.environ["SAFINUM_MODEL"] = "modele-de-test"
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
