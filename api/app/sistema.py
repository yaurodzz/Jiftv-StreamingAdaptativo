"""Publica o estado do servidor de mídia em `system/server` (lido pelo painel).

Se o painel não receber um sinal novo há mais de um minuto, mostra o servidor como fora do ar.
"""

import shutil
import time
import traceback

from . import armazenamento, cloud, config, drive, estado, fb, institucional, live, media

INTERVALO = 20
_inicio = time.time()


def _disco():
    try:
        uso = shutil.disk_usage(config.VIDEOS)  # disco da pasta local escolhida no painel
        return {"total": uso.total, "used": uso.used, "free": uso.free}
    except OSError:
        return None


def publicar():
    st = media.stat()
    locais = [v for v in estado.copia_vods().values() if v.get("localFile") and v.get("localAvailable")]
    fb.db().collection("system").document("server").set({
        "online": True,
        "lastSeen": fb.SERVER_TIMESTAMP,
        "workerUptime": int(time.time() - _inicio),
        "media": {
            "online": st["online"],
            "uptime": st["uptime"],
            "bwIn": st["bw_in"],
            "bwOut": st["bw_out"],
            "nginxVersion": st["versao_nginx"],
            "rtmpVersion": st["versao_rtmp"],
        },
        "viewers": live.total(),
        "qualities": config.qualidades(),
        "disk": _disco(),
        "recordings": {"count": len(locais), "bytes": sum(v.get("bytes") or 0 for v in locais)},
        "cloudinary": {
            "configured": cloud.configurado(),
            "enabled": cloud.ativo(),
            "cloudName": cloud.nome_da_conta(),
            "folder": config.CLOUDINARY_FOLDER,
            "retryMin": config.RETRY_INTERVAL_MIN,
        },
        # Resumo de Painel > Armazenamento (os detalhes vêm de GET /api/armazenamento)
        "storage": {
            "local": armazenamento.local_ligado(),
            "drive": drive.ativo(),
            "cloudinary": cloud.ativo(),
        },
        "institutional": institucional.estado(),
        "publicRecordings": config.GRAVACOES_PUBLICAS,
        "rtmpPort": config.RTMP_PORT,
        "firebaseEmulator": config.EMULADOR,
    })


def loop():
    voltas = 0
    while True:
        try:
            publicar()
            voltas += 1
            if voltas % 180 == 1:  # ~1 vez por hora
                fb.limpar_eventos()
        except Exception:  # noqa: BLE001
            traceback.print_exc()
        time.sleep(INTERVALO)
