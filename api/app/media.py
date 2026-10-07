"""Comunicação com o servidor de mídia (nginx-rtmp): estatísticas e controle."""

import threading
import time
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET

from . import config

_cache = {"quando": 0.0, "dados": None}
_lock = threading.Lock()


def _get(caminho, timeout=3):
    with urllib.request.urlopen(config.MEDIA_URL + caminho, timeout=timeout) as r:
        return r.read()


def _int(el, tag):
    if el is None:
        return 0
    try:
        return int(float(el.findtext(tag) or 0))
    except ValueError:
        return 0


def _stream(s):
    publicador = next((c for c in s.findall("client") if c.find("publishing") is not None), None)
    video = s.find("meta/video")
    audio = s.find("meta/audio")
    return {
        "tempo": _int(s, "time") // 1000,
        "bw_in": _int(s, "bw_in"),
        "bw_video": _int(s, "bw_video"),
        "bw_audio": _int(s, "bw_audio"),
        "cliente": publicador.findtext("id") if publicador is not None else None,
        "endereco": publicador.findtext("address") if publicador is not None else None,
        "largura": _int(video, "width"),
        "altura": _int(video, "height"),
        "fps": _int(video, "frame_rate"),
        "codec_video": video.findtext("codec") if video is not None else None,
        "codec_audio": audio.findtext("codec") if audio is not None else None,
    }


def stat(max_idade=2.0):
    """Estado atual do nginx-rtmp.

    {"online", "uptime", "bw_in", "bw_out", "versao_nginx", "versao_rtmp",
     "live": {nome: {...}},  # sinais recebidos do OBS
     "hls":  {nome: {...}}}  # qualidades geradas pelo FFmpeg (nome_720p, ...)
    """
    with _lock:
        if _cache["dados"] and time.time() - _cache["quando"] < max_idade:
            return _cache["dados"]

    dados = {"online": False, "uptime": 0, "bw_in": 0, "bw_out": 0,
             "versao_nginx": None, "versao_rtmp": None, "live": {}, "hls": {}}
    try:
        raiz = ET.fromstring(_get("/stat"))
    except Exception:  # noqa: BLE001 - servidor de mídia fora do ar
        pass
    else:
        dados.update(online=True, uptime=_int(raiz, "uptime"), bw_in=_int(raiz, "bw_in"),
                     bw_out=_int(raiz, "bw_out"), versao_nginx=raiz.findtext("nginx_version"),
                     versao_rtmp=raiz.findtext("nginx_rtmp_version"))
        for app in raiz.iter("application"):
            nome_app = app.findtext("name")
            if nome_app not in ("live", "hls"):
                continue
            for s in app.findall("live/stream"):
                if s.find("publishing") is not None:
                    dados[nome_app][s.findtext("name")] = _stream(s)

    with _lock:
        _cache.update(quando=time.time(), dados=dados)
    return dados


def derrubar(slug):
    """Desconecta o OBS que está transmitindo em live/<slug>."""
    consulta = urllib.parse.urlencode({"app": "live", "name": slug})
    try:
        _get(f"/control/drop/publisher?{consulta}")
        return True
    except Exception:  # noqa: BLE001
        return False
    finally:
        with _lock:
            _cache["quando"] = 0.0
