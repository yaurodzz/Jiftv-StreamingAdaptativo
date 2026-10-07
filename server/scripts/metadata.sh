#!/bin/bash
# Gera, ao lado de um vídeo, os arquivos usados pelo acervo:
#   <saida>.info.json  -> duração, resolução e codecs (ffprobe)
#   <saida>.jpg        -> miniatura (quadro a 10% do vídeo, no máximo aos 30 s)
# Uso: metadata.sh <video> <caminho_de_saida_sem_extensao>
set -u

VIDEO="$1"
OUT="$2"

ffprobe -v error \
    -show_entries format=duration,size,bit_rate:stream=codec_type,codec_name,width,height,r_frame_rate \
    -of json "$VIDEO" > "$OUT.info.json.tmp" 2>/dev/null \
    && mv -f "$OUT.info.json.tmp" "$OUT.info.json" \
    || rm -f "$OUT.info.json.tmp"

DUR=$(ffprobe -v error -show_entries format=duration -of default=nw=1:nk=1 "$VIDEO" 2>/dev/null)
POS=$(awk -v d="${DUR:-0}" 'BEGIN { p = d * 0.1; if (p > 30) p = 30; printf "%.2f", p }')

ffmpeg -nostdin -hide_banner -loglevel error -y -ss "$POS" -i "$VIDEO" \
    -frames:v 1 -vf "scale=-2:360" -q:v 4 -f image2 -update 1 "$OUT.tmp.jpg" 2>/dev/null \
    && mv -f "$OUT.tmp.jpg" "$OUT.jpg" \
    || rm -f "$OUT.tmp.jpg"

exit 0
