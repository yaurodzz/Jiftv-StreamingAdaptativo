# Emuladores do Firebase (Auth + Firestore) para desenvolvimento e testes locais.
# Não usa o projeto real: o id "demo-jiftv" funciona offline e sem credenciais.
FROM node:20-bookworm-slim

RUN apt-get update \
 && apt-get install -y --no-install-recommends openjdk-17-jre-headless \
 && rm -rf /var/lib/apt/lists/* \
 && npm install -g firebase-tools@13 \
 && npm cache clean --force

WORKDIR /projeto
ENV FIREBASE_PROJECT=demo-jiftv

EXPOSE 4000 4400 8085 9099 9150

# Os dados ficam em /dados/export (volume): exportados ao parar e importados ao iniciar.
# (Exporta numa subpasta: o emulador apaga e recria a pasta, e o ponto de montagem não pode ser apagado.)
CMD ["sh", "-c", "IMPORT=''; [ -f /dados/export/firebase-export-metadata.json ] && IMPORT='--import /dados/export'; exec firebase emulators:start --project \"$FIREBASE_PROJECT\" --only auth,firestore $IMPORT --export-on-exit /dados/export"]
