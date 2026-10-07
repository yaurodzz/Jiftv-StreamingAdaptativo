#!/bin/bash
# Gera miniatura e metadados para vídeos do acervo que ainda não os têm
# (gravações feitas antes do painel, ou vídeos copiados manualmente para a pasta).
set -u
source /opt/jiftv/bin/common.sh

gerados=0
while IFS= read -r -d '' video; do
    stem="${video%.*}"
    if [ ! -f "$stem.info.json" ] || [ ! -f "$stem.jpg" ]; then
        /opt/jiftv/bin/metadata.sh "$video" "$stem"
        gerados=$((gerados + 1))
    fi
done < <(find "$REC_VIDEOS" -type f \( -name '*.mp4' -o -name '*.flv' \) ! -name '.*' -print0 2>/dev/null)

if [ "$gerados" -gt 0 ]; then
    log "miniaturas/metadados gerados para $gerados vídeo(s) do acervo"
    avisar_api
fi
