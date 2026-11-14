# Option Docker / hebergement en ligne (en plus des scripts de demarrage, pas a la place).
FROM python:3.12-slim
WORKDIR /app
COPY serveur/requirements.txt serveur/requirements.txt
RUN pip install --no-cache-dir --only-binary=:all: -r serveur/requirements.txt
COPY serveur serveur
COPY pages_test pages_test
COPY extension extension
WORKDIR /app/serveur
EXPOSE 8000
# La cle API arrive par l'environnement (docker-compose.yml ou l'hebergeur), jamais dans l'image.
# Les hebergeurs fournissent le port dans $PORT.
CMD ["sh", "-c", "python -m uvicorn main:app --host 0.0.0.0 --port ${PORT:-8000}"]
