#!/bin/bash
# Executado pelo nginx-rtmp (exec_push) a cada nova transmissão.
# Codifica o sinal do OBS uma única vez em várias qualidades e entrega:
#   - cada qualidade via RTMP para a aplicação "hls" do nginx (HLS adaptativo)
#   - todas as qualidades num único manifesto MPEG-DASH (DASH adaptativo)
#   - uma miniatura JPEG atualizada a cada 5 s (vitrine "ao vivo" do site)
# Uso: transcode.sh <nome_da_transmissao>
set -u
source /opt/jiftv/bin/common.sh

NAME="$1"
IN="rtmp://127.0.0.1:1935/live/${NAME}"
DASH_DIR="/var/www/dash/${NAME}"
THUMB="/var/www/thumbs/${NAME}.jpg"

rm -rf "$DASH_DIR"
mkdir -p "$DASH_DIR"
rm -f "$THUMB"

read -ra QS <<< "${QUALIDADES:-1080:5000 720:2800 480:1200 240:400}"
N=${#QS[@]}

# Uma cópia do vídeo para cada qualidade + uma para a miniatura
filter="[0:v]split=$((N + 1))"
for i in "${!QS[@]}"; do filter+="[s$i]"; done
filter+="[sthumb];"

maps=()
outputs=""
for i in "${!QS[@]}"; do
    h=${QS[$i]%%:*}
    kbps=${QS[$i]##*:}
    filter+="[s$i]scale=-2:${h}[v$i];"
    maps+=(-map "[v$i]"
           -b:v:$i "${kbps}k"
           -maxrate:v:$i "$((kbps * 110 / 100))k"
           -bufsize:v:$i "$((kbps * 2))k")
    outputs+="[f=flv:select=\\'v:$i,a\\':onfail=ignore]rtmp://127.0.0.1:1935/hls/${NAME}_${h}p|"
done
filter+="[sthumb]fps=1/5,scale=-2:360[thumb]"

outputs+="[f=dash:select=\\'v,a\\':onfail=ignore"
outputs+=":seg_duration=2:window_size=15:extra_window_size=10:remove_at_exit=1"
outputs+=":use_template=1:use_timeline=1"
outputs+=":adaptation_sets=id=0,streams=v id=1,streams=a]${DASH_DIR}/manifest.mpd"

log "transcodificação iniciada: ${NAME} (${QS[*]})"

# O muxer "tee" reaproveita os mesmos quadros codificados para todas as saídas,
# então cada qualidade é codificada só uma vez.
exec ffmpeg -nostdin -hide_banner -loglevel warning \
    -i "$IN" \
    -filter_complex "$filter" \
    -c:v libx264 -preset "${X264_PRESET:-veryfast}" -tune zerolatency \
    -profile:v main -pix_fmt yuv420p \
    -sc_threshold 0 -force_key_frames "expr:gte(t,n_forced*2)" \
    "${maps[@]}" \
    -map "0:a:0?" -c:a aac -b:a "${AUDIO_BITRATE:-128k}" -ar 48000 -ac 2 \
    -flags +global_header \
    -f tee "$outputs" \
    -map "[thumb]" -c:v mjpeg -q:v 5 -f image2 -update 1 -atomic_writing 1 "$THUMB" \
    2>> "$LOG_DIR/transcode.log"
