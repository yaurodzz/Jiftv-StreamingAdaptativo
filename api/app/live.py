"""Estado ao vivo: espectadores, início/fim das transmissões e sincronia com o nginx-rtmp."""

import re
import threading
import time
import traceback

from . import config, estado, fb, media

JANELA = 45  # segundos sem ping para considerar que o espectador saiu

_espectadores = {}  # slug -> {id_do_espectador: último_ping}
_escrito = {}       # id da transmissão -> últimos valores gravados (evita escritas repetidas)
_lock = threading.RLock()


# ------------------------------------------------------------------ espectadores
def ping(slug, espectador):
    with _lock:
        _espectadores.setdefault(slug, {})[espectador] = time.time()
    return contar(slug)


def contar(slug):
    limite = time.time() - JANELA
    with _lock:
        vistos = _espectadores.get(slug)
        if not vistos:
            return 0
        for k in [k for k, t in vistos.items() if t < limite]:
            del vistos[k]
        return len(vistos)


def total():
    with _lock:
        return sum(contar(s) for s in list(_espectadores))


# ------------------------------------------------------------------ início e fim
def iniciar(sid, s, cliente=None, origem=None):
    fb.db().collection("streams").document(sid).update({
        "isLive": True,
        "startedAt": fb.SERVER_TIMESTAMP,
        "endedAt": None,
        "clientId": cliente,
        "origin": origem,
        "viewers": 0,
    })
    with _lock:
        _escrito.pop(sid, None)
    fb.evento("ao_vivo", f"Transmissão no ar: {s.get('title')}" + (f" (OBS em {origem})" if origem else ""))


def encerrar(sid, s, motivo=""):
    fb.db().collection("streams").document(sid).update({
        "isLive": False,
        "endedAt": fb.SERVER_TIMESTAMP,
        "clientId": None,
        "viewers": 0,
        "input": None,
    })
    with _lock:
        _espectadores.pop(s.get("slug"), None)
        _escrito.pop(sid, None)
    fb.evento("encerrada", f"Transmissão encerrada: {s.get('title')}" + (f" ({motivo})" if motivo else ""))


# ------------------------------------------------------------------ reconciliação
def _sinal(info):
    return {
        "width": info["largura"], "height": info["altura"], "fps": info["fps"],
        "bitrate": info["bw_in"], "videoCodec": info["codec_video"], "audioCodec": info["codec_audio"],
    }


def reconciliar():
    """Corrige o status das transmissões a partir do que o nginx-rtmp está recebendo de fato.

    Também publica no Firestore os dados do sinal (resolução, bitrate), as qualidades geradas
    e o número de espectadores, e derruba o OBS de transmissões bloqueadas ou excluídas.
    """
    st = media.stat(max_idade=0)
    if not st["online"]:
        return
    publicando = st["live"]
    total_qualidades = len(config.qualidades())
    agora = time.time()

    for sid, s in estado.copia_streams().items():
        slug = s.get("slug")
        if not s.get("isLive"):
            continue
        if slug in publicando:
            info = publicando[slug]
            padrao = re.compile(re.escape(slug) + r"_\d+p$")
            n = contar(slug)
            dados = {
                "input": _sinal(info),
                "qualitiesActive": sum(1 for nome in st["hls"] if padrao.match(nome)),
                "qualitiesTotal": total_qualidades,
                "viewers": n,
            }
            if n > (s.get("peakViewers") or 0):
                dados["peakViewers"] = n
            # No máximo uma escrita a cada 10 s por transmissão (o bitrate muda o tempo todo,
            # e cada escrita volta para o ouvinte, que acorda este laço)
            with _lock:
                anterior, quando = _escrito.get(sid, (None, 0))
                gravar = anterior != dados and agora - quando >= 10
                if gravar:
                    _escrito[sid] = (dados, agora)
            if gravar:
                fb.db().collection("streams").document(sid).update(dados)
        elif (fb.segundos(s.get("startedAt")) or 0) < agora - 20:
            encerrar(sid, s, "sinal do OBS não encontrado")

    # Sinais no nginx: liga transmissões que o Firestore não sabia que estavam no ar
    # e derruba as que foram bloqueadas ou excluídas no painel.
    for slug, info in publicando.items():
        sid, s = estado.stream_por_slug(slug)
        if s is None or not s.get("keyActive", True):
            if media.derrubar(slug):
                fb.evento("encerrada", f"OBS desconectado: transmissão '{slug}' "
                          + ("excluída" if s is None else "com a chave bloqueada"))
        elif not s.get("isLive"):
            iniciar(sid, s, info["cliente"], info["endereco"])


_acordar = threading.Event()


def loop():
    # Mudanças no painel (chave bloqueada, transmissão excluída) agem na hora
    estado.ao_mudar("streams", _acordar.set)
    while True:
        try:
            reconciliar()
        except Exception:  # noqa: BLE001
            traceback.print_exc()
        _acordar.wait(10)
        _acordar.clear()
        time.sleep(0.5)  # agrupa rajadas de mudanças
