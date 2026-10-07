"""Envio das gravações ao Cloudinary (fila com novas tentativas automáticas).

A fila é o próprio Firestore: gravações com cloudinary.status = "pending" (ou "failed"
com nova tentativa vencida). O botão "Reenviar" do painel só muda o status para "pending".
As credenciais vêm de CLOUDINARY_URL (cloudinary://API_KEY:API_SECRET@CLOUD_NAME).
A cópia local nunca é apagada por este módulo.
"""

import json
import threading
import time
import traceback
import urllib.parse
from datetime import datetime, timedelta, timezone

import cloudinary
import cloudinary.uploader
import cloudinary.utils

from . import config, estado, fb

CHUNK = 20 * 1024 * 1024
# Erros em que tentar de novo sozinho não adianta (limite do plano, credenciais)
NAO_REPETIR = ("too large", "unknown api key", "invalid signature", "disabled", "invalid cloud_name")

_acordar = threading.Event()


def configurado():
    return bool(config.CLOUDINARY_URL)


def nome_da_conta():
    if not configurado():
        return None
    return urllib.parse.urlsplit(config.CLOUDINARY_URL).hostname


def acordar():
    _acordar.set()


def _mensagem(exc):
    msg = str(exc) or type(exc).__name__
    if "too large" in msg.lower():
        return ("O vídeo é maior que o limite do seu plano do Cloudinary (no plano gratuito, 100 MB por vídeo). "
                f"A cópia local continua salva. Detalhe: {msg}")
    return msg


_processadas = {}  # id -> quando foi processada (a cópia local pode ainda mostrar o status antigo)


def _proxima():
    agora = time.time()
    for vid, v in sorted(estado.copia_vods().items(), key=lambda x: fb.segundos(x[1].get("recordedAt")) or 0):
        c = v.get("cloudinary") or {}
        if not v.get("localFile") or not v.get("localAvailable"):
            continue
        if agora - _processadas.get(vid, 0) < 30:
            continue
        if c.get("status") == "pending":
            return vid, v
        if c.get("status") == "failed" and c.get("nextAttemptAt") and fb.segundos(c["nextAttemptAt"]) <= agora:
            return vid, v
    return None, None


def enviar(vid, v):
    ref = fb.db().collection("vods").document(vid)
    caminho = config.VIDEOS / v["localFile"]
    pasta = "/".join(p for p in (config.CLOUDINARY_FOLDER, v.get("streamSlug")) if p)
    public_id = v["localFile"].rsplit("/", 1)[-1].rsplit(".", 1)[0]
    tentativas = (v.get("cloudinary") or {}).get("attempts", 0)
    ref.update({"cloudinary.status": "uploading", "cloudinary.error": None})
    fb.evento("cloudinary", f"Enviando ao Cloudinary: {v.get('title')} ({v['localFile']})")

    try:
        res = cloudinary.uploader.upload_large(
            str(caminho),
            resource_type="video",
            folder=pasta,
            public_id=public_id,
            overwrite=True,
            unique_filename=False,
            chunk_size=CHUNK,
            tags=["jiftv", v.get("streamSlug") or "sem-transmissao"],
            context={"title": str(v.get("title") or ""), "modality": str(v.get("modality") or "")},
        )
        if "error" in res:
            raise RuntimeError(res["error"])
    except Exception as exc:  # noqa: BLE001 - qualquer falha precisa ser registrada
        tentativas += 1
        msg = _mensagem(exc)
        repetir = config.RETRY_INTERVAL_MIN > 0 and not any(p in str(exc).lower() for p in NAO_REPETIR)
        proxima = (datetime.now(timezone.utc) + timedelta(minutes=config.RETRY_INTERVAL_MIN * min(tentativas, 4))
                   if repetir else None)
        ref.update({
            "cloudinary.status": "failed",
            "cloudinary.error": msg[:2000],
            "cloudinary.attempts": tentativas,
            "cloudinary.nextAttemptAt": proxima,
        })
        fb.evento("cloudinary_erro", f"Falha no envio de '{v.get('title')}': {msg[:300]}")
        return

    miniatura = cloudinary.utils.cloudinary_url(
        res["public_id"], resource_type="video", format="jpg", secure=True,
        transformation=[{"width": 800, "crop": "scale"}, {"start_offset": "5"}],
    )[0]
    ref.update({
        "playbackUrl": res.get("secure_url"),
        "thumbnailUrl": miniatura,
        "cloudinary": {
            "status": "uploaded",
            "publicId": res.get("public_id"),
            "secureUrl": res.get("secure_url"),
            "duration": res.get("duration"),
            "bytes": res.get("bytes"),
            "format": res.get("format"),
            "attempts": tentativas + 1,
            "uploadedAt": fb.SERVER_TIMESTAMP,
            "error": None,
            "nextAttemptAt": None,
        },
    })
    # Registro ao lado do vídeo: permite reconstruir o acervo a partir da pasta
    try:
        stem = v["localFile"].rsplit(".", 1)[0]
        (config.VIDEOS / f"{stem}.cloudinary.json").write_text(json.dumps({
            "secure_url": res.get("secure_url"), "public_id": res.get("public_id"),
            "bytes": res.get("bytes"), "duration": res.get("duration"),
        }, indent=2, ensure_ascii=False), encoding="utf-8")
    except OSError:
        pass
    fb.evento("cloudinary_ok", f"Enviado ao Cloudinary: {v.get('title')}")


def excluir(public_id):
    """Remove o vídeo do Cloudinary. Retorna o texto de erro, ou None se deu certo."""
    try:
        res = cloudinary.uploader.destroy(public_id, resource_type="video", invalidate=True)
    except Exception as exc:  # noqa: BLE001
        return str(exc)
    if res.get("result") not in ("ok", "not found"):
        return str(res)
    return None


def _ajustar_status_inicial():
    """Ao iniciar: envios interrompidos voltam para a fila; liga/desliga conforme o .env."""
    for vid, v in estado.copia_vods().items():
        status = (v.get("cloudinary") or {}).get("status")
        if not v.get("localFile"):
            continue
        novo = None
        if status == "uploading":
            novo = "pending"
        elif status == "disabled" and configurado():
            novo = "pending"
        elif status == "pending" and not configurado():
            novo = "disabled"
        if novo:
            fb.db().collection("vods").document(vid).update({"cloudinary.status": novo})


def loop():
    estado.ao_mudar("vods", _acordar.set)  # "Reenviar" no painel age na hora
    _ajustar_status_inicial()
    while True:
        try:
            if configurado():
                vid, v = _proxima()
                if vid:
                    _processadas[vid] = time.time()
                    try:
                        enviar(vid, v)
                    finally:
                        _processadas[vid] = time.time()
                    continue
        except Exception:  # noqa: BLE001
            traceback.print_exc()
        _acordar.wait(60)
        _acordar.clear()
