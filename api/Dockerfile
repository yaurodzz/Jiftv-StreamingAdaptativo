# JIFTv - worker: liga o servidor de mídia ao Firebase (Firestore + Auth) e ao Cloudinary
FROM python:3.12-slim

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    TZ=America/Sao_Paulo

WORKDIR /opt/jiftv-api

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY app/ app/

# Volume de estado (configuração do armazenamento, autorização do Google Drive, atalho da pasta local)
RUN mkdir -p /var/jiftv && chown www-data:www-data /var/jiftv

# Mesmo usuário (uid 33) que grava os vídeos no container de mídia
USER www-data

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s \
  CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8000/api/saude', timeout=3)" || exit 1

# Um único processo: o estado ao vivo (espectadores) fica na memória
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--no-access-log"]
