#!/bin/bash
# Executado pelo nginx-rtmp (exec_record_done) quando uma gravação termina.
#   1. Converte o .flv gravado pelo nginx num único .mp4 (sem recodificar)
#   2. Gera miniatura e metadados ao lado do vídeo
#   3. Avisa a API, que registra no acervo e envia ao Cloudinary
#      (a cópia local é sempre mantida)
# Uso: on_record_done.sh <caminho.flv> [nome_da_transmissao]
set -u
source /opt/jiftv/bin/common.sh

FLV="$1"
NAME="${2:-}"
BASE=$(basename "$FLV" .flv)

if [ ! -f "$FLV" ]; then
    log "gravação não encontrada: $FLV"
    exit 1
fi

# Sem nome (recuperação após reinício): extrai de "<nome>_AAAA-MM-DD_HH-MM-SS"
if [ -z "$NAME" ]; then
    NAME=$(sed -E 's/_[0-9]{4}-[0-9]{2}-[0-9]{2}_[0-9]{2}-[0-9]{2}-[0-9]{2}$//' <<< "$BASE")
fi
# O "-" fica no fim do conjunto para o tr não interpretá-lo como intervalo
NAME=$(tr -c 'A-Za-z0-9_.\n-' '_' <<< "$NAME")
NAME=${NAME:-transmissao}

SIZE=$(stat -c %s "$FLV")
if [ "$SIZE" -lt $(( ${MIN_RECORDING_KB:-512} * 1024 )) ]; then
    log "gravação descartada por estar vazia/curta demais (${SIZE} bytes): $FLV"
    rm -f "$FLV"
    exit 0
fi

DEST_DIR="$REC_VIDEOS/$NAME"
mkdir -p "$DEST_DIR"
STEM="$DEST_DIR/$BASE"
# Arquivo oculto durante a conversão: a API só enxerga o .mp4 quando ele está completo
PART="$DEST_DIR/.$BASE.mp4.part"

if ffmpeg -nostdin -hide_banner -loglevel error -y -i "$FLV" -map 0 -c copy \
        -movflags +faststart -f mp4 "$PART" 2>> "$LOG_DIR/remux.log"; then
    /opt/jiftv/bin/metadata.sh "$PART" "$STEM"
    mv -f "$PART" "$STEM.mp4"
    rm -f "$FLV"
    FINAL="$STEM.mp4"
else
    # Se a conversão falhar, preserva o arquivo original para não perder o jogo
    rm -f "$PART"
    mv -f "$FLV" "$DEST_DIR/"
    FINAL="$STEM.flv"
    /opt/jiftv/bin/metadata.sh "$FINAL" "$STEM"
    log "conversão para MP4 falhou, mantido o FLV original"
fi

log "gravação salva localmente: $FINAL ($(du -h "$FINAL" | cut -f1))"
avisar_api
