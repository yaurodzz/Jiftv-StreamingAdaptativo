#!/bin/bash
# Funções e variáveis compartilhadas pelos scripts do JIFTv.
# O nginx limpa o ambiente dos processos que executa (exec_push, exec_record_done),
# por isso as configurações são lidas do arquivo gerado pelo entrypoint.

export PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin

if [ -r /opt/jiftv/jiftv.env ]; then
    set -a
    # shellcheck disable=SC1091
    . /opt/jiftv/jiftv.env
    set +a
fi

REC_ROOT=/recordings
REC_TMP=$REC_ROOT/em_andamento
REC_VIDEOS=$REC_ROOT/videos
LOG_DIR=$REC_ROOT/logs
LOG_FILE=$LOG_DIR/jiftv.log

log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*" >> "$LOG_FILE"
}

# Avisa a API que há gravação nova. Se ela estiver fora do ar, a varredura
# periódica da pasta (a cada minuto) registra o vídeo do mesmo jeito.
avisar_api() {
    curl -fsS -m 5 -o /dev/null "http://127.0.0.1:8081/internal/gravacao" 2>/dev/null \
        || log "aviso: API indisponível, a gravação será registrada na próxima varredura"
}
