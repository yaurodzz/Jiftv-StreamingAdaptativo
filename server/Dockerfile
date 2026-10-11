# JIFTv - Servidor de mídia
# Nginx + libnginx-mod-rtmp (ingestão RTMP, HLS, gravação) + FFmpeg (transcodificação)
# O site e o painel ficam no Firebase Hosting; aqui só passa o vídeo.
FROM debian:bookworm-slim

ENV DEBIAN_FRONTEND=noninteractive \
    TZ=America/Sao_Paulo

RUN apt-get update \
 && apt-get install -y --no-install-recommends \
      nginx libnginx-mod-rtmp ffmpeg ca-certificates tzdata curl \
 && rm -rf /var/lib/apt/lists/* \
 && rm -f /etc/nginx/sites-enabled/default

# Volume de estado compartilhado com o worker (atalho da pasta local escolhida no painel)
RUN mkdir -p /var/jiftv && chown www-data:www-data /var/jiftv

COPY nginx/nginx.conf /etc/nginx/nginx.conf
COPY scripts/ /opt/jiftv/bin/

# Garante finais de linha LF mesmo se o repositório for clonado no Windows com CRLF
RUN sed -i 's/\r$//' /opt/jiftv/bin/* /etc/nginx/nginx.conf \
 && chmod 755 /opt/jiftv/bin/*

# 1935 = RTMP (OBS/DroidCam)   80 = HTTP (HLS, DASH, miniaturas, gravações)
EXPOSE 1935 80

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s \
  CMD curl -fs http://127.0.0.1/healthz || exit 1

ENTRYPOINT ["/opt/jiftv/bin/entrypoint.sh"]
