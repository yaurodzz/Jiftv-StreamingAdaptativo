#!/bin/bash
# Prepara a configuração a partir das variáveis de ambiente e inicia o nginx.
set -euo pipefail

QUALIDADES=${QUALIDADES:-"1080:5000 720:2800 480:1200 240:400"}
AUDIO_BITRATE=${AUDIO_BITRATE:-128k}

for q in $QUALIDADES; do
    [[ "$q" =~ ^[0-9]+:[0-9]+$ ]] || { echo "QUALIDADES inválida: '$q' (use altura:kbps, ex. 720:2800)" >&2; exit 1; }
done

mkdir -p /etc/nginx/jiftv /var/www/hls /var/www/dash /var/www/thumbs \
         /recordings/em_andamento /recordings/videos /recordings/logs /var/jiftv
chown www-data:www-data /var/www/hls /var/www/dash /var/www/thumbs /var/jiftv
chown -R www-data:www-data /recordings 2>/dev/null || true

# Pasta local das gravações: /var/jiftv/atual é um atalho trocado pelo worker quando a pasta
# é escolhida em Painel > Armazenamento. Sem atalho (primeira vez) ou com a pasta escolhida
# fora do ar (disco desconectado, PASTAS_DO_PC alterado), grava na pasta padrão.
ATUAL=/var/jiftv/atual
if [ ! -L "$ATUAL" ] || [ ! -d "$ATUAL/" ]; then
    [ -L "$ATUAL" ] && echo "[jiftv] AVISO: a pasta local escolhida ($(readlink "$ATUAL")) não está disponível; usando a pasta padrão" >&2
    ln -sfn /recordings "$ATUAL"
fi
mkdir -p "$ATUAL/em_andamento" "$ATUAL/videos"
chown www-data:www-data "$ATUAL/em_andamento" "$ATUAL/videos" 2>/dev/null || true
echo "[jiftv] Pasta local das gravações: $(readlink -f "$ATUAL")"

# Logs grandes demais são girados (mantém uma cópia .1)
for f in /recordings/logs/*.log; do
    [ -f "$f" ] && [ "$(stat -c %s "$f")" -gt $((20 * 1024 * 1024)) ] && mv -f "$f" "$f.1"
done

# --- Variantes do HLS adaptativo (uma por qualidade) ---
audio_kbps=${AUDIO_BITRATE%k}
: > /etc/nginx/jiftv/hls_variants.conf
for q in $QUALIDADES; do
    h=${q%%:*}; kbps=${q##*:}
    w=$(( (h * 16 / 9 + 1) / 2 * 2 ))
    echo "hls_variant _${h}p BANDWIDTH=$(( (kbps + audio_kbps) * 1000 )),RESOLUTION=${w}x${h};" \
        >> /etc/nginx/jiftv/hls_variants.conf
done

# --- Configuração lida pelos scripts executados pelo nginx ---
for v in QUALIDADES AUDIO_BITRATE X264_PRESET MIN_RECORDING_KB TZ; do
    printf '%s=%q\n' "$v" "${!v:-}"
done | grep -v "=''$" > /opt/jiftv/jiftv.env
chown root:www-data /opt/jiftv/jiftv.env
chmod 640 /opt/jiftv/jiftv.env

echo "[jiftv] Qualidades: $QUALIDADES"

# Gravações interrompidas (queda do container durante uma transmissão)
for f in "$ATUAL"/em_andamento/*.flv; do
    [ -e "$f" ] || continue
    echo "[jiftv] recuperando gravação interrompida: $f"
    runuser -u www-data -- /opt/jiftv/bin/on_record_done.sh "$f" &
done

# Miniaturas e metadados de vídeos antigos (depois que o nginx subir)
( sleep 5; runuser -u www-data -- /opt/jiftv/bin/backfill.sh ) &

nginx -t
exec nginx -g 'daemon off;'
