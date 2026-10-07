"""Acervo de gravações: sincroniza a pasta gravacoes/videos/ com a coleção `vods`.

O servidor de mídia grava, converte para MP4 e escreve ao lado de cada vídeo a miniatura
(<nome>.jpg) e os metadados (<nome>.info.json). Este módulo cria o documento de cada
vídeo novo no Firestore e mantém tamanho, duração e disponibilidade atualizados.

ID do documento (mesmo formato do sistema anterior): AAAAMMDD-COD-HHMMSS,
com o horário de início da gravação e o código de 3 letras da modalidade.
"""

import json
import re
import threading
import traceback
from datetime import datetime
from pathlib import Path

from google.api_core.exceptions import AlreadyExists

from . import cloud, config, estado, fb

EXTENSOES = (".mp4", ".flv")
SUFIXOS = (".mp4", ".flv", ".jpg", ".info.json", ".cloudinary.json", ".cloudinary-erro.txt")
DATA_NO_NOME = re.compile(r"_(\d{4})-(\d{2})-(\d{2})_(\d{2})-(\d{2})-(\d{2})$")

_acordar = threading.Event()
_lock = threading.Lock()
_recentes = set()  # registradas há pouco, antes de o ouvinte do Firestore atualizar a cópia local


def acordar():
    _acordar.set()


def _ler_info(stem):
    try:
        dados = json.loads((config.VIDEOS / f"{stem}.info.json").read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return {}
    video = next((s for s in dados.get("streams", []) if s.get("codec_type") == "video"), {})
    try:
        duracao = float(dados.get("format", {}).get("duration") or 0) or None
    except ValueError:
        duracao = None
    return {"durationSec": duracao, "width": video.get("width"), "height": video.get("height")}


def _inicio(nome, mtime):
    m = DATA_NO_NOME.search(nome)
    if m:
        ano, mes, dia, h, mi, s = map(int, m.groups())
        return datetime(ano, mes, dia, h, mi, s, tzinfo=config.TZ)
    return datetime.fromtimestamp(mtime, tz=config.TZ)


def _titulo_bonito(texto):
    texto = re.sub(r"-[0-9a-f]{4}$", "", texto)          # sufixo aleatório do slug
    texto = re.sub(r"[-_]+", " ", texto).strip()
    return texto[:1].upper() + texto[1:] if texto else "Gravação"


def _cloud_inicial(stem):
    registro = config.VIDEOS / f"{stem}.cloudinary.json"
    if registro.exists():
        try:
            dados = json.loads(registro.read_text(encoding="utf-8"))
            return {"status": "uploaded", "publicId": dados.get("public_id"), "secureUrl": dados.get("secure_url")}
        except (OSError, ValueError):
            pass
    return {"status": "pending" if cloud.configurado() else "disabled"}


def _arquivos_na_pasta():
    achados = {}
    if not config.VIDEOS.exists():
        return achados
    for p in config.VIDEOS.rglob("*"):
        ext = p.suffix.lower()
        if ext not in EXTENSOES or p.name.startswith(".") or not p.is_file():
            continue
        rel = p.relative_to(config.VIDEOS).as_posix()
        stem = rel[: -len(ext)]
        if stem in achados and achados[stem][0].endswith(".mp4"):
            continue  # MP4 tem preferência sobre o FLV de mesmo nome
        achados[stem] = (rel, p)
    return achados


def _registrar(stem, rel, p):
    slug = stem.split("/")[0] if "/" in stem else ""
    nome = stem.rsplit("/", 1)[-1]
    sid, s = estado.stream_por_slug(slug) if slug else (None, None)
    s = s or {}
    inicio = _inicio(nome, p.stat().st_mtime)
    codigo = re.sub(r"[^A-Z0-9]", "X", (s.get("modalityCode") or "VOD").upper()).ljust(3, "X")[:3]
    base_id = f"{inicio:%Y%m%d}-{codigo}-{inicio:%H%M%S}"
    miniatura = f"{stem}.jpg" if (config.VIDEOS / f"{stem}.jpg").exists() else None
    cloud_status = _cloud_inicial(stem)

    dados = {
        "title": s.get("title") or _titulo_bonito(slug or nome),
        "description": "",
        "modality": s.get("modalityName") or s.get("modality"),
        "modalityCode": codigo,
        "modalityId": s.get("modalityId"),
        "streamName": slug,
        "streamSlug": slug,
        "sourceStreamId": sid,
        "teamA": s.get("teamA") or None,
        "teamB": s.get("teamB") or None,
        "scoreA": s.get("scoreA"),
        "scoreB": s.get("scoreB"),
        "recordedAt": inicio,
        "createdAt": fb.SERVER_TIMESTAMP,
        "bytes": p.stat().st_size,
        "localFile": rel,
        "localThumb": miniatura,
        "localAvailable": True,
        "visible": config.GRAVACOES_PUBLICAS,
        "views": 0,
        "playbackUrl": cloud_status.get("secureUrl"),
        "thumbnailUrl": None,
        "cloudinary": cloud_status,
        **_ler_info(stem),
    }
    for n in range(1, 50):
        vid = base_id if n == 1 else f"{base_id}-{n}"
        try:
            fb.db().collection("vods").document(vid).create(dados)
            break
        except AlreadyExists:
            existente = fb.db().collection("vods").document(vid).get().to_dict() or {}
            if existente.get("localFile") == rel:
                return False  # já registrada (a cópia local ainda não tinha sido atualizada)
    _recentes.add(stem)
    fb.evento("gravacao", f"Nova gravação no acervo: {dados['title']} ({rel})")
    return True


def _atualizar(vid, v, rel, p):
    mudancas = {}
    tamanho = p.stat().st_size
    if v.get("localFile") != rel:
        mudancas["localFile"] = rel
    if v.get("bytes") != tamanho:
        mudancas["bytes"] = tamanho
    if not v.get("localAvailable"):
        mudancas["localAvailable"] = True
    stem = rel.rsplit(".", 1)[0]
    miniatura = f"{stem}.jpg" if (config.VIDEOS / f"{stem}.jpg").exists() else None
    if v.get("localThumb") != miniatura:
        mudancas["localThumb"] = miniatura
    if not v.get("durationSec"):
        info = _ler_info(stem)
        if info.get("durationSec"):
            mudancas.update(info)
    if mudancas:
        fb.db().collection("vods").document(vid).update(mudancas)


def sincronizar():
    """Retorna quantas gravações novas foram registradas."""
    with _lock:
        achados = _arquivos_na_pasta()
        locais = {vid: v for vid, v in estado.copia_vods().items() if v.get("localFile")}
        por_stem = {v["localFile"].rsplit(".", 1)[0]: vid for vid, v in locais.items()}

        # Pasta vazia ou ausente com gravações registradas: provavelmente o volume não foi
        # montado. Não mexe em nada para não marcar o acervo inteiro como indisponível.
        if not achados and locais:
            print("[jiftv] pasta de gravações vazia; sincronização ignorada", flush=True)
            return 0

        for vid, v in locais.items():
            stem = v["localFile"].rsplit(".", 1)[0]
            if stem not in achados and v.get("localAvailable"):
                fb.db().collection("vods").document(vid).update({"localAvailable": False})
                fb.evento("gravacao", f"Arquivo local não encontrado: {v['localFile']}"
                          + (" (continua disponível no Cloudinary)" if v.get("playbackUrl") else ""))

        _recentes.intersection_update(set(achados) - set(por_stem))
        novas = 0
        for stem, (rel, p) in achados.items():
            try:
                vid = por_stem.get(stem)
                if vid:
                    _atualizar(vid, locais[vid], rel, p)
                elif stem not in _recentes and _registrar(stem, rel, p):
                    novas += 1
            except OSError:
                continue  # arquivo sumiu durante a varredura
    if novas:
        cloud.acordar()
    return novas


def excluir_arquivos(rel):
    """Apaga o vídeo e os arquivos auxiliares (miniatura, metadados) da pasta local."""
    stem = rel.rsplit(".", 1)[0]
    base = (config.VIDEOS / stem).resolve()
    raiz = config.VIDEOS.resolve()
    if raiz not in base.parents:
        raise ValueError("caminho fora da pasta de gravações")
    with _lock:
        for sufixo in SUFIXOS:
            Path(f"{base}{sufixo}").unlink(missing_ok=True)
        if base.parent != raiz:
            try:
                base.parent.rmdir()  # só remove se a pasta da transmissão ficou vazia
            except OSError:
                pass


def loop():
    while True:
        try:
            sincronizar()
        except Exception:  # noqa: BLE001
            traceback.print_exc()
        _acordar.wait(60)
        _acordar.clear()
