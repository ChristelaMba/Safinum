#!/usr/bin/env bash
# Demarrage de SAFINUM en une commande (Linux, Mac).
#   ./demarrer.sh            serveur sur le port 8000
#   PORT=8010 ./demarrer.sh  autre port
#   TEST=1 ./demarrer.sh     moteur de TEST (ne traduit pas, prefixe seulement)
set -e
RACINE="$(cd "$(dirname "$0")" && pwd)"
SERVEUR="$RACINE/serveur"
PORT="${PORT:-8000}"

# 1. Python 3.10 a 3.13
PYTHON=""
for v in 3.13 3.12 3.11 3.10; do
  if command -v "python$v" >/dev/null 2>&1; then PYTHON="python$v"; break; fi
done
if [ -z "$PYTHON" ] && command -v python3 >/dev/null 2>&1; then
  if python3 -c 'import sys; sys.exit(0 if (3, 10) <= sys.version_info[:2] <= (3, 13) else 1)'; then PYTHON=python3; fi
fi
if [ -z "$PYTHON" ]; then
  echo "Python 3.10 a 3.13 introuvable (3.14 et plus n'est pas supporte). Installez Python 3.12." >&2
  exit 1
fi
echo "Python utilise : $PYTHON"

# 2. Environnement et dependances (roues precompilees seulement)
if [ ! -x "$SERVEUR/.venv/bin/python" ]; then
  "$PYTHON" -m venv "$SERVEUR/.venv"
fi
"$SERVEUR/.venv/bin/python" -m pip install --quiet --only-binary=:all: -r "$SERVEUR/requirements.txt"

# 3. Fichier .env
if [ ! -f "$SERVEUR/.env" ]; then
  cp "$SERVEUR/.env.example" "$SERVEUR/.env"
  echo "Fichier .env cree. Ajoutez votre cle dans serveur/.env (voir README)."
fi

if [ "${TEST:-0}" = "1" ]; then
  export SAFINUM_MOTEUR=test
  echo "MODE TEST : le moteur ne traduit pas, il ajoute seulement un prefixe."
fi

echo
echo "Etat et diagnostic : http://localhost:$PORT/diagnostic"
echo "Pages de test      : http://localhost:$PORT/banque/"
cd "$SERVEUR"
exec "$SERVEUR/.venv/bin/python" -m uvicorn main:app --port "$PORT"
