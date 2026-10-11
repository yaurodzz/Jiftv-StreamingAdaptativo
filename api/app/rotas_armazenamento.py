"""Rotas de Painel > Armazenamento e a reprodução dos vídeos que estão no Google Drive.

- GET/PUT /api/armazenamento         liga/desliga pasta local, Drive e Cloudinary; escolhe a pasta local
- GET/POST /api/armazenamento/pastas navega e cria pastas do computador (dentro de PASTAS_DO_PC)
- POST /api/drive/conectar           devolve o endereço de autorização do Google
- GET  /api/drive/callback           retorno do Google (o navegador volta ao painel em seguida)
- POST /api/drive/desconectar
- GET  /api/video/<id>               repassa ao player o vídeo guardado no Drive (aceita Range)

Tudo, menos o callback e o vídeo, exige o ID token de um admin em "Authorization: Bearer ...".
"""

import shutil
from urllib.parse import urlencode, urlsplit

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import RedirectResponse, StreamingResponse
from pydantic import BaseModel, Field

from . import armazenamento, cloud, config, drive, estado, fb, media, recordings
from .routes import _admin

router = APIRouter(prefix="/api")


def somente_admin(request: Request):
    tipo, _, token = request.headers.get("authorization", "").partition(" ")
    if tipo.lower() != "bearer" or not _admin(token.strip()):
        raise HTTPException(401, "Entre no painel como administrador.")


admin = [Depends(somente_admin)]


# ------------------------------------------------------------------ estado
def _ao_vivo():
    if any(s.get("isLive") for s in estado.copia_streams().values()):
        return True
    return bool(media.stat()["live"]) or armazenamento.gravando()


def _disco():
    try:
        uso = shutil.disk_usage(config.VIDEOS)
        return {"total": uso.total, "free": uso.free}
    except OSError:
        return None


def _fila(campo):
    contagem = {}
    for v in estado.copia_vods().values():
        status = (v.get(campo) or {}).get("status")
        if status:
            contagem[status] = contagem.get(status, 0) + 1
    return contagem


def _situacao():
    cfg = armazenamento.ler()
    locais = [v for v in estado.copia_vods().values() if v.get("localFile") and v.get("localAvailable")]
    conta = drive.conta() or {}
    return {
        "config": cfg,
        "live": _ao_vivo(),
        "local": {
            "folder": armazenamento.no_pc(cfg["local"]["path"]),
            "defaultFolder": armazenamento.no_pc(None),
            "root": armazenamento.no_pc(""),
            "disk": _disco(),
            "count": len(locais),
            "bytes": sum(v.get("bytes") or 0 for v in locais),
            "moving": armazenamento.estado_da_mudanca(),
        },
        "drive": {
            "configured": drive.configurado(),
            "connected": drive.conectado(),
            "active": drive.ativo(),
            "email": conta.get("email"),
            "name": conta.get("name"),
            "limit": conta.get("limit"),
            "usage": conta.get("usage"),
            "folder": drive.pasta().get("name") or cfg["drive"]["folderName"],
            "redirectUri": drive.endereco_de_retorno(),
            "queue": _fila("drive"),
            "error": drive.ultimo_erro(),
        },
        "cloudinary": {
            "configured": cloud.configurado(),
            "active": cloud.ativo(),
            "cloudName": cloud.nome_da_conta(),
            "queue": _fila("cloudinary"),
        },
    }


@router.get("/armazenamento", dependencies=admin)
def ver():
    return _situacao()


# ------------------------------------------------------------------ salvar
class Local(BaseModel):
    enabled: bool
    path: str | None = Field(default=None, max_length=400)


class Drive(BaseModel):
    enabled: bool
    folderName: str = Field(default=armazenamento.PADRAO["drive"]["folderName"], min_length=1, max_length=80)


class Cloudinary(BaseModel):
    enabled: bool


class Configuracao(BaseModel):
    local: Local
    drive: Drive
    cloudinary: Cloudinary


@router.put("/armazenamento", dependencies=admin)
def salvar(corpo: Configuracao):
    atual = armazenamento.ler()
    novo = corpo.model_dump()
    novo["drive"]["folderName"] = novo["drive"]["folderName"].strip()
    if novo["local"]["path"] is not None:
        novo["local"]["path"] = novo["local"]["path"].strip().replace("\\", "/").strip("/")
    if not armazenamento.NOME_DE_PASTA.match(novo["drive"]["folderName"]):
        raise HTTPException(400, "Nome inválido para a pasta do Google Drive.")

    if novo["drive"]["enabled"] and not drive.conectado():
        raise HTTPException(400, "Conecte uma conta do Google Drive antes de ligar esse destino.")
    drive_ok = novo["drive"]["enabled"] and drive.conectado()
    cloud_ok = novo["cloudinary"]["enabled"] and cloud.configurado()
    if not novo["local"]["enabled"] and not (drive_ok or cloud_ok):
        raise HTTPException(400, "Para desligar a pasta local, deixe ligado o Google Drive (conectado) ou o Cloudinary "
                                 "(configurado): as gravações precisam ficar em algum lugar.")

    mudou_pasta = novo["local"]["path"] != atual["local"]["path"]
    if mudou_pasta:
        if armazenamento.movendo():
            raise HTTPException(409, "Ainda há vídeos sendo levados para a pasta escolhida antes. Aguarde terminar.")
        if _ao_vivo():
            raise HTTPException(409, "Há uma transmissão sendo gravada agora. Troque a pasta quando ela terminar.")
        try:
            base = armazenamento.base_de(novo["local"]["path"])
            if not base.is_dir():
                raise ValueError("Pasta não encontrada.")
            armazenamento.testar_escrita(base)
        except ValueError as exc:
            raise HTTPException(400, str(exc)) from exc

    armazenamento.salvar(novo)
    if mudou_pasta:
        armazenamento.trocar_pasta(novo["local"]["path"], ao_terminar=recordings.acordar)
        fb.evento("armazenamento", f"Pasta local das gravações: {armazenamento.no_pc(novo['local']['path'])}")
    for destino, nome in (("local", "Pasta local"), ("drive", "Google Drive"), ("cloudinary", "Cloudinary")):
        if novo[destino]["enabled"] != atual[destino]["enabled"]:
            fb.evento("armazenamento", f"{nome}: {'ligado' if novo[destino]['enabled'] else 'desligado'}")

    # As filas passam a valer na hora: o que estava "só local" entra na fila do destino ligado
    cloud.ajustar_status()
    drive.ajustar_status()
    cloud.acordar()
    drive.acordar()
    recordings.acordar()
    return _situacao()


# ------------------------------------------------------------------ pastas do computador
class NovaPasta(BaseModel):
    caminho: str = Field(default="", max_length=400)
    nome: str = Field(min_length=1, max_length=80)


@router.get("/armazenamento/pastas", dependencies=admin)
def pastas(caminho: str = ""):
    try:
        return armazenamento.listar(caminho)
    except ValueError as exc:
        raise HTTPException(400, str(exc)) from exc


@router.post("/armazenamento/pastas", dependencies=admin)
def criar_pasta(corpo: NovaPasta):
    try:
        return armazenamento.listar(armazenamento.criar_pasta(corpo.caminho, corpo.nome))
    except ValueError as exc:
        raise HTTPException(400, str(exc)) from exc


# ------------------------------------------------------------------ Google Drive
class Conectar(BaseModel):
    voltar: str = Field(min_length=8, max_length=300)


def _origem_permitida(endereco):
    partes = urlsplit(endereco)
    if partes.scheme not in ("http", "https") or not partes.netloc:
        return False
    return "*" in config.CORS_ORIGENS or f"{partes.scheme}://{partes.netloc}" in config.CORS_ORIGENS


@router.post("/drive/conectar", dependencies=admin)
def conectar(corpo: Conectar):
    if not _origem_permitida(corpo.voltar):
        raise HTTPException(400, "Endereço de retorno não autorizado.")
    try:
        return {"url": drive.url_de_autorizacao(corpo.voltar)}
    except drive.ErroDrive as exc:
        raise HTTPException(400, str(exc)) from exc


@router.get("/drive/callback")
def callback(request: Request):
    """O Google manda o navegador para cá depois da autorização; daqui ele volta ao painel."""
    q = request.query_params
    voltar = drive.pedido(q.get("state"))
    if not voltar:
        raise HTTPException(400, "Pedido de autorização expirado. Volte ao painel e conecte de novo.")
    resultado = {"drive": "ok"}
    if q.get("error") or not q.get("code"):
        resultado = {"drive": "erro", "motivo": "A autorização foi cancelada."}
    else:
        try:
            drive.concluir(q["code"], q["state"])
        except drive.ErroDrive as exc:
            resultado = {"drive": "erro", "motivo": str(exc)[:200]}
    return RedirectResponse(f"{voltar}{'&' if '?' in voltar else '?'}{urlencode(resultado)}", status_code=303)


@router.post("/drive/desconectar", dependencies=admin)
def desconectar():
    cfg = armazenamento.ler()
    if not cfg["local"]["enabled"] and not cloud.ativo():
        raise HTTPException(400, "Ligue a pasta local antes de desconectar o Drive: as gravações precisam ficar em algum lugar.")
    cfg["drive"]["enabled"] = False
    armazenamento.salvar(cfg)
    drive.desconectar()
    drive.ajustar_status()
    return _situacao()


@router.get("/video/{vid}")
def video(vid: str, request: Request):
    """Vídeo guardado no Google Drive, repassado ao player (o Drive não entrega vídeo direto).

    Mesma regra de /arquivos/: gravações visíveis são públicas; ocultas só com ?token=<admin>.
    """
    v = estado.copia_vods().get(vid)
    no_drive = (v or {}).get("drive") or {}
    if not v or no_drive.get("status") != "uploaded" or not no_drive.get("fileId"):
        raise HTTPException(404)
    if not v.get("visible") and not _admin(request.query_params.get("token", "")):
        raise HTTPException(403)
    try:
        r = drive.abrir(no_drive["fileId"], request.headers.get("range"))
    except drive.ErroDrive as exc:
        raise HTTPException(502, str(exc)) from exc
    if r.status_code not in (200, 206):
        r.close()
        raise HTTPException(r.status_code if r.status_code in (404, 416) else 502)

    def corpo():
        try:
            yield from r.iter_content(256 * 1024)
        finally:
            r.close()

    cabecalhos = {k: r.headers[k] for k in ("Content-Length", "Content-Range") if k in r.headers}
    cabecalhos.update({"Accept-Ranges": "bytes", "Cache-Control": "private, max-age=3600",
                       "Access-Control-Allow-Origin": "*"})
    tipo = "video/x-flv" if (v.get("localFile") or "").endswith(".flv") else "video/mp4"
    return StreamingResponse(corpo(), status_code=r.status_code, media_type=tipo, headers=cabecalhos)
