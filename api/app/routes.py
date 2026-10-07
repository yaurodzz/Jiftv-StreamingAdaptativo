"""Rotas HTTP do worker.

- /internal/*  ganchos do nginx-rtmp e dos scripts (só pela rede interna do Docker)
- /api/*       chamadas públicas que passam pelo servidor de mídia:
               contagem de espectadores e autorização dos arquivos de gravação
"""

import hmac
import time
from urllib.parse import parse_qs, unquote, urlsplit

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from google.cloud.firestore_v1.base_query import FieldFilter
from pydantic import BaseModel, Field

from . import estado, fb, live, media, recordings

# ------------------------------------------------------------------ ganchos internos


def somente_interno(request: Request):
    # O proxy público do nginx marca as requisições externas com este cabeçalho
    if request.headers.get("x-jiftv-public"):
        raise HTTPException(404)


interno = APIRouter(prefix="/internal", dependencies=[Depends(somente_interno)])


def _buscar_por_chave(chave):
    """Consulta direta, para o caso de a cópia local ainda não ter a chave (recém-criada)."""
    docs = list(fb.db().collection("streamKeys").where(filter=FieldFilter("streamKey", "==", chave)).limit(1).stream())
    if not docs:
        return None, None
    sid = docs[0].id
    s = fb.db().collection("streams").document(sid).get().to_dict()
    return (sid, s) if s else (None, None)


@interno.get("/publish")
def publish(request: Request):
    """O OBS começou a transmitir. Valida a chave e define o nome público da transmissão.

    No OBS, a chave de transmissão é a chave secreta criada no painel. Respondendo com um
    redirecionamento (3xx), o nginx-rtmp troca a chave pelo nome público (slug), usado no HLS,
    no DASH e na pasta de gravação. Também é aceito "<slug>?key=<chave>".
    """
    q = request.query_params
    nome = q.get("name", "")
    origem = q.get("addr")

    sid, s = estado.stream_por_chave(nome)
    if s is None:
        sid, s = _buscar_por_chave(nome)
    redirecionar = s is not None
    if s is None:
        sid, s = estado.stream_por_slug(nome)
        if s is not None and not hmac.compare_digest(q.get("key", ""), estado.chave_de.get(sid, "")):
            sid, s = None, None
    if s is None:
        fb.evento("seguranca", f"Transmissão recusada: chave inválida (de {origem})")
        return Response(status_code=403)
    if not s.get("keyActive", True):
        fb.evento("seguranca", f"Transmissão recusada: chave bloqueada para '{s.get('title')}' (de {origem})")
        return Response(status_code=403)
    if not s.get("slug"):
        return Response(status_code=503)  # transmissão antiga ainda sendo migrada; o OBS tenta de novo

    # Se já houver um OBS no ar com esta transmissão, o nginx recusa o segundo sozinho
    if not (s.get("isLive") and s["slug"] in media.stat(max_idade=0)["live"]):
        live.iniciar(sid, s, q.get("clientid"), origem)

    if redirecionar:
        return Response(status_code=302, headers={"Location": s["slug"]})
    return Response(status_code=204)


@interno.get("/publish_done", status_code=204)
def publish_done(request: Request):
    q = request.query_params
    nome = q.get("name", "")
    sid, s = estado.stream_por_slug(nome)
    if s is None:
        sid, s = estado.stream_por_chave(nome)
    if s and s.get("isLive") and s.get("clientId") in (None, q.get("clientid")):
        live.encerrar(sid, s)


@interno.get("/gravacao", status_code=204)
def gravacao():
    """Uma gravação terminou de ser convertida: atualiza o acervo agora."""
    recordings.acordar()


# ------------------------------------------------------------------ rotas públicas
publico = APIRouter(prefix="/api")


class Audiencia(BaseModel):
    slug: str = Field(min_length=1, max_length=80)
    id: str = Field(min_length=4, max_length=64)


@publico.get("/saude")
def saude():
    return {"ok": True}


@publico.post("/audiencia")
def audiencia(corpo: Audiencia):
    """Ping do player a cada ~20 s: conta quem está assistindo agora."""
    _sid, s = estado.stream_por_slug(corpo.slug)
    if not s or not s.get("isLive"):
        return {"viewers": 0}
    return {"viewers": live.ping(corpo.slug, corpo.id)}


_tokens_ok = {}  # token -> validade (evita verificar o mesmo token a cada pedaço do vídeo)


def _admin(token):
    agora = time.time()
    if _tokens_ok.get(token, 0) > agora:
        return True
    if token and fb.verificar_admin(token):
        if len(_tokens_ok) > 500:
            _tokens_ok.clear()
        _tokens_ok[token] = agora + 300
        return True
    return False


@publico.get("/arquivo-auth")
def arquivo_auth(request: Request):
    """Chamado pelo nginx (auth_request) antes de entregar /arquivos/...

    Gravações visíveis são públicas. Gravações ocultas só com ?token=<ID token de um admin>.
    """
    original = urlsplit(request.headers.get("x-original-uri", ""))
    caminho = unquote(original.path)
    prefixo = "/arquivos/"
    if not caminho.startswith(prefixo):
        raise HTTPException(403)
    rel = caminho[len(prefixo):]
    for sufixo in (".mp4", ".flv", ".jpg"):
        if rel.endswith(sufixo):
            _vid, v = estado.vod_por_stem(rel[: -len(sufixo)])
            if v and v.get("visible"):
                return Response(status_code=204)
            break
    token = (parse_qs(original.query).get("token") or [""])[0]
    if _admin(token):
        return Response(status_code=204)
    raise HTTPException(403)
