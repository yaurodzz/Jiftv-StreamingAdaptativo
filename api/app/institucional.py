"""Cliente da API do site institucional: foto do aluno pela matrícula escolar.

O site institucional (feito pelo professor) já tem as fotos de todos os alunos. Em vez de a pessoa
enviar uma foto no cadastro de atleta, ela informa a matrícula e o worker busca a foto lá.

O contrato exato da API ainda precisa ser confirmado (veja docs/integracao-site-institucional.md).
Por isso o formato é configurável e dois tipos de resposta são aceitos:
  1. a própria imagem (Content-Type image/*);
  2. JSON com a foto em um dos campos de INSTITUCIONAL_API_PHOTO_FIELDS: URL (http/https ou
     caminho relativo), data URI ou base64. O nome do aluno, se vier, é guardado só para o admin conferir.

Segurança (a matrícula e a URL da foto são dados que o servidor não controla):
- a matrícula só aceita letras e números e vai codificada na URL;
- só se baixa foto do host da API ou de INSTITUCIONAL_PHOTO_HOSTS, sem seguir redirecionamento para
  outro servidor (evita SSRF);
- o token da API só é enviado ao host da API;
- tamanho máximo de 5 MB e tipo conferido pelos bytes (JPEG, PNG ou WebP).
"""

import base64
import binascii
import json
import re
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timezone

from . import config

MATRICULA = re.compile(r"^[0-9A-Za-z]{4,20}$")
MAX_IMAGEM = 5 * 1024 * 1024

# Resultado da última consulta, publicado em system/server para o painel
ultimo = {"quando": None, "ok": None, "erro": None}


class ErroInstitucional(Exception):
    """Falha ao falar com o site institucional (rede, credenciais, resposta inesperada)."""


class AlunoNaoEncontrado(ErroInstitucional):
    """A API respondeu, mas não conhece essa matrícula."""


class SemFoto(ErroInstitucional):
    """A matrícula existe, mas o cadastro dela não tem foto."""


def configurada():
    return bool(config.INSTITUCIONAL_URL)


def matricula_valida(matricula):
    return bool(MATRICULA.match(matricula or ""))


def _host(url):
    return (urllib.parse.urlsplit(url).hostname or "").lower()


def _host_permitido(url):
    partes = urllib.parse.urlsplit(url)
    if partes.scheme not in ("http", "https"):
        return False
    # Se a API é HTTPS, a foto também precisa ser (sem rebaixar a segurança)
    if urllib.parse.urlsplit(config.INSTITUCIONAL_URL).scheme == "https" and partes.scheme != "https":
        return False
    return _host(url) in ({_host(config.INSTITUCIONAL_URL)} | config.INSTITUCIONAL_HOSTS_FOTO)


class _RedirecionamentoSeguro(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        if not _host_permitido(newurl):
            raise ErroInstitucional("a API redirecionou para um servidor não autorizado")
        return super().redirect_request(req, fp, code, msg, headers, newurl)


def _cabecalho_de_acesso():
    token = config.INSTITUCIONAL_TOKEN
    if not token:
        return {}
    nome = config.INSTITUCIONAL_CABECALHO
    if nome.lower() == "authorization" and not token.lower().startswith(("bearer ", "basic ")):
        token = f"Bearer {token}"
    return {nome: token}


def _baixar(url, aceitar):
    """GET com limites. Retorna (content_type, bytes)."""
    if not _host_permitido(url):
        raise ErroInstitucional("endereço fora dos servidores autorizados do site institucional")
    cabecalhos = {"Accept": aceitar, "User-Agent": "JIFTv/1.0"}
    if _host(url) == _host(config.INSTITUCIONAL_URL):
        cabecalhos.update(_cabecalho_de_acesso())
    abrir = urllib.request.build_opener(_RedirecionamentoSeguro).open
    try:
        with abrir(urllib.request.Request(url, headers=cabecalhos), timeout=config.INSTITUCIONAL_TIMEOUT) as r:
            tipo = (r.headers.get_content_type() or "").lower()
            corpo = r.read(MAX_IMAGEM + 1)
    except urllib.error.HTTPError as exc:
        if exc.code == 404:
            raise AlunoNaoEncontrado() from exc
        if exc.code in (401, 403):
            raise ErroInstitucional("a API do site institucional recusou as credenciais do JIFTv") from exc
        raise ErroInstitucional(f"a API do site institucional respondeu HTTP {exc.code}") from exc
    except (urllib.error.URLError, TimeoutError, OSError) as exc:
        raise ErroInstitucional("não foi possível falar com o site institucional") from exc
    if len(corpo) > MAX_IMAGEM:
        raise ErroInstitucional("a resposta do site institucional passa de 5 MB")
    return tipo, corpo


def tipo_da_imagem(dados):
    """Confere pelos bytes (não pelo que a API diz): 'jpg', 'png', 'webp' ou None."""
    if dados[:3] == b"\xff\xd8\xff":
        return "jpg"
    if dados[:8] == b"\x89PNG\r\n\x1a\n":
        return "png"
    if dados[:4] == b"RIFF" and dados[8:12] == b"WEBP":
        return "webp"
    return None


def _desembrulhar(dados):
    """Aceita {"data": {...}}, {"aluno": {...}} ou lista de um item."""
    if isinstance(dados, list) and dados and isinstance(dados[0], dict):
        dados = dados[0]
    if isinstance(dados, dict):
        for chave in ("data", "aluno", "student", "resultado"):
            if isinstance(dados.get(chave), dict):
                return dados[chave]
    return dados if isinstance(dados, dict) else {}


def _campo(dados, nomes):
    for nome in nomes:
        valor = dados.get(nome)
        if isinstance(valor, str) and valor.strip():
            return valor.strip()
    return None


def _foto_do_campo(valor):
    if valor.startswith("data:image"):
        valor = valor.split(",", 1)[-1]
    elif valor.startswith(("http://", "https://")):
        return _baixar(valor, "image/*")[1]
    elif valor.startswith("/"):
        return _baixar(urllib.parse.urljoin(config.INSTITUCIONAL_URL + "/", valor.lstrip("/")), "image/*")[1]
    try:
        return base64.b64decode(valor, validate=True)
    except (binascii.Error, ValueError) as exc:
        raise ErroInstitucional("o campo da foto não é uma URL nem uma imagem em base64") from exc


def _consultar(matricula):
    url = config.INSTITUCIONAL_URL + config.INSTITUCIONAL_CAMINHO.replace(
        "{matricula}", urllib.parse.quote(matricula, safe=""))
    tipo, corpo = _baixar(url, "application/json, image/*")

    nome = None
    if tipo.startswith("image/") or tipo_da_imagem(corpo):
        foto = corpo
    else:
        try:
            dados = _desembrulhar(json.loads(corpo.decode("utf-8")))
        except (ValueError, UnicodeDecodeError) as exc:
            raise ErroInstitucional("resposta inesperada do site institucional (nem imagem nem JSON)") from exc
        nome = _campo(dados, config.INSTITUCIONAL_CAMPOS_NOME)
        bruto = _campo(dados, config.INSTITUCIONAL_CAMPOS_FOTO)
        if not bruto:
            raise SemFoto()
        foto = _foto_do_campo(bruto)

    formato = tipo_da_imagem(foto)
    if not formato:
        raise ErroInstitucional("a foto recebida não é uma imagem JPEG, PNG ou WebP")
    return {"foto": foto, "tipo": formato, "nome": nome}


def buscar_aluno(matricula):
    """Consulta a API e devolve {"foto": bytes, "tipo": "jpg|png|webp", "nome": str|None}.

    Levanta AlunoNaoEncontrado, SemFoto ou ErroInstitucional.
    """
    if not configurada():
        raise ErroInstitucional("API do site institucional não configurada")
    if not matricula_valida(matricula):
        raise AlunoNaoEncontrado()
    ultimo["quando"] = datetime.now(timezone.utc)
    try:
        resultado = _consultar(matricula)
    except (AlunoNaoEncontrado, SemFoto):
        ultimo.update(ok=True, erro=None)  # a API respondeu normalmente
        raise
    except ErroInstitucional as exc:
        ultimo.update(ok=False, erro=str(exc)[:200])
        raise
    ultimo.update(ok=True, erro=None)
    return resultado


def estado():
    """Resumo para o painel (system/server). Não inclui token nem matrículas."""
    return {
        "configured": configurada(),
        "host": _host(config.INSTITUCIONAL_URL) or None,
        "mode": config.ATLETAS_FOTO,
        "lastAt": ultimo["quando"],
        "lastOk": ultimo["ok"],
        "lastError": ultimo["erro"],
    }
