"""Pedidos do painel que precisam do servidor local (coleção `commands`).

O painel roda no Firebase Hosting e não alcança o servidor da escola diretamente.
Ele cria um documento em `commands` com status "pending"; o worker escuta a coleção,
executa e grava o resultado no mesmo documento (status "done" ou "error").
"""

import queue
import threading
import traceback

from google.cloud.firestore_v1.base_query import FieldFilter

from . import cloud, config, drive, estado, fb, recordings

LOGS = {"jiftv": "jiftv.log", "transcode": "transcode.log", "remux": "remux.log"}

_fila = queue.Queue()
_vistos = set()
_ouvinte = None


def _excluir_gravacao(dados):
    vid = dados.get("vodId")
    v = fb.db().collection("vods").document(vid).get().to_dict() if vid else None
    if not v:
        raise ValueError("Gravação não encontrada.")
    avisos = []
    publica = (v.get("cloudinary") or {}).get("publicId")
    if dados.get("cloudinary") and publica:
        erro = cloud.excluir(publica)
        if erro:
            raise RuntimeError(f"Não foi possível excluir do Cloudinary: {erro}")
    elif publica:
        avisos.append("A cópia no Cloudinary foi mantida.")
    no_drive = v.get("drive") or {}
    if dados.get("drive") and no_drive.get("fileId"):
        for campo in ("fileId", "thumbId", "infoId"):
            erro = drive.lixeira(no_drive[campo]) if no_drive.get(campo) else None
            if erro and campo == "fileId":
                raise RuntimeError(f"Não foi possível excluir do Google Drive: {erro}")
        avisos.append("A cópia do Google Drive foi para a lixeira do Drive (some de vez em 30 dias).")
    elif no_drive.get("fileId"):
        avisos.append("A cópia no Google Drive foi mantida.")
    if v.get("localFile"):
        recordings.excluir_arquivos(v["localFile"])
    fb.db().collection("vods").document(vid).delete()
    fb.evento("gravacao", f"Gravação excluída: {v.get('title')} ({v.get('localFile') or vid})"
              + (" e do Cloudinary" if dados.get("cloudinary") and publica else "")
              + (" e do Google Drive" if dados.get("drive") and no_drive.get("fileId") else ""))
    return {"aviso": " ".join(avisos) or None}


def _ler_log(dados):
    nome = dados.get("name", "jiftv")
    if nome not in LOGS:
        raise ValueError("Log desconhecido.")
    linhas = max(10, min(int(dados.get("lines") or 300), 1000))
    caminho = config.LOGS / LOGS[nome]
    if not caminho.exists():
        return {"lines": [], "size": 0}
    with caminho.open("rb") as f:
        f.seek(0, 2)
        tamanho = f.tell()
        f.seek(max(0, tamanho - 256 * 1024))
        texto = f.read().decode("utf-8", "replace")
    return {"lines": texto.splitlines()[-linhas:], "size": tamanho}


EXECUTORES = {
    "delete_vod": _excluir_gravacao,
    "resync": lambda _dados: {"novas": recordings.sincronizar()},
    "logs": _ler_log,
}


def _ao_receber(docs, _mudancas, _quando):
    for d in docs:
        if d.id not in _vistos:
            _vistos.add(d.id)
            _fila.put((d.id, d.to_dict() or {}))


def ouvir():
    global _ouvinte
    consulta = fb.db().collection("commands").where(filter=FieldFilter("status", "==", "pending"))
    _ouvinte = consulta.on_snapshot(_ao_receber)


def loop():
    ouvir()
    threading.Thread(target=_vigiar, daemon=True).start()
    while True:
        cid, dados = _fila.get()
        ref = fb.db().collection("commands").document(cid)
        tipo = dados.get("type")
        try:
            ref.update({"status": "running"})
            if tipo not in EXECUTORES:
                raise ValueError(f"Comando desconhecido: {tipo}")
            resultado = EXECUTORES[tipo](dados.get("payload") or {})
            ref.update({"status": "done", "result": resultado, "finishedAt": fb.SERVER_TIMESTAMP})
        except Exception as exc:  # noqa: BLE001
            if not isinstance(exc, (ValueError, RuntimeError, OSError)):
                traceback.print_exc()
            try:
                ref.update({"status": "error", "error": str(exc)[:1000], "finishedAt": fb.SERVER_TIMESTAMP})
            except Exception:  # noqa: BLE001
                traceback.print_exc()


def _vigiar():
    import time
    while True:
        time.sleep(30)
        if _ouvinte is None or getattr(_ouvinte, "_closed", False):
            try:
                ouvir()
            except Exception as exc:  # noqa: BLE001
                print(f"[jiftv] comandos: Firestore indisponível ({exc})", flush=True)
