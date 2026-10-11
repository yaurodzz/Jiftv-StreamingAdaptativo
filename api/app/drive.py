"""Envio das gravações ao Google Drive e leitura delas para o player.

- Autorização: OAuth da conta dona do Drive, feita uma vez pelo painel (Armazenamento >
  Google Drive > Conectar). O cliente OAuth vem do .env (GOOGLE_OAUTH_CLIENT_ID/SECRET) e a
  autorização fica em <estado>/drive.json. O escopo é drive.file: o JIFTv só enxerga os
  arquivos que ele mesmo criou. Passo a passo em docs/armazenamento.md.
- Fila: igual à do Cloudinary, baseada no Firestore (vods.drive.status = "pending", ou
  "failed" com nova tentativa vencida). "Reenviar" no painel só muda o status para "pending".
- Envio retomável em pedaços; no fim o MD5 do Drive é comparado com o do arquivo local.
  Só depois disso a cópia local pode ser apagada (recordings.liberar_locais).
- O Drive não entrega vídeo para player; por isso GET /api/video/<id> (rotas_armazenamento)
  busca o arquivo com a autorização do worker e repassa ao espectador.
"""

import hashlib
import json
import os
import secrets
import threading
import time
import traceback
import urllib.parse
from datetime import datetime, timedelta, timezone

import requests

from . import armazenamento, config, estado, fb

AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth"
TOKEN_URL = "https://oauth2.googleapis.com/token"
REVOGAR_URL = "https://oauth2.googleapis.com/revoke"
API = "https://www.googleapis.com/drive/v3"
UPLOAD = "https://www.googleapis.com/upload/drive/v3"
ESCOPO = "https://www.googleapis.com/auth/drive.file"

ARQUIVO = config.ESTADO / "drive.json"
PEDACO = 16 * 1024 * 1024  # múltiplo de 256 KiB, como o envio retomável exige
TIPO_PASTA = "application/vnd.google-apps.folder"
CAMPOS = "id,name,size,md5Checksum,webViewLink"
# Erros em que tentar de novo sozinho não adianta
NAO_REPETIR = ("storagequotaexceeded", "quota has been exceeded", "autorização", "não está conectado")

_lock = threading.RLock()
_acordar = threading.Event()
_dados = None                  # conteúdo de drive.json
_acesso = {"token": None, "validade": 0.0}
_pedidos = {}                  # state do OAuth -> (voltar, validade)
_subpastas = {}                # nome -> id
_conta = {"quando": 0.0, "dados": None}
_processadas = {}
_ultimo_erro = None


class ErroDrive(RuntimeError):
    pass


# ------------------------------------------------------------------ autorização
def _ler():
    global _dados
    with _lock:
        if _dados is None:
            try:
                _dados = json.loads(ARQUIVO.read_text(encoding="utf-8"))
            except (OSError, ValueError):
                _dados = {}
        return _dados


def _gravar(dados):
    global _dados
    with _lock:
        config.ESTADO.mkdir(parents=True, exist_ok=True)
        provisorio = ARQUIVO.with_suffix(".tmp")
        provisorio.write_text(json.dumps(dados, indent=2, ensure_ascii=False), encoding="utf-8")
        os.chmod(provisorio, 0o600)
        os.replace(provisorio, ARQUIVO)
        _dados = dados


def configurado():
    return bool(config.DRIVE_CLIENT_ID and config.DRIVE_CLIENT_SECRET)


def conectado():
    return configurado() and bool(_ler().get("refreshToken"))


def ativo():
    return conectado() and armazenamento.drive_ligado()


def acordar():
    _acordar.set()


def endereco_de_retorno():
    return f"{config.API_PUBLICA}/api/drive/callback"


def url_de_autorizacao(voltar):
    if not configurado():
        raise ErroDrive("Falta o cliente OAuth do Google no .env do servidor (GOOGLE_OAUTH_CLIENT_ID e GOOGLE_OAUTH_CLIENT_SECRET).")
    agora = time.time()
    for antigo in [s for s, (_v, validade) in _pedidos.items() if validade < agora]:
        _pedidos.pop(antigo, None)
    state = secrets.token_urlsafe(24)
    _pedidos[state] = (voltar, agora + 600)
    return AUTH_URL + "?" + urllib.parse.urlencode({
        "client_id": config.DRIVE_CLIENT_ID,
        "redirect_uri": endereco_de_retorno(),
        "response_type": "code",
        "scope": ESCOPO,
        "access_type": "offline",   # pede o refresh token (o worker envia sem ninguém logado)
        "prompt": "consent",
        "state": state,
    })


def pedido(state):
    """Endereço do painel para onde voltar depois da autorização (None se o pedido não existe)."""
    voltar, validade = _pedidos.get(state or "", (None, 0))
    return voltar if validade > time.time() else None


def concluir(code, state):
    """Troca o código devolvido pelo Google pela autorização permanente."""
    if not _pedidos.pop(state or "", None):
        raise ErroDrive("Pedido de autorização expirado. Comece de novo pelo painel.")
    r = requests.post(TOKEN_URL, timeout=20, data={
        "code": code, "client_id": config.DRIVE_CLIENT_ID, "client_secret": config.DRIVE_CLIENT_SECRET,
        "redirect_uri": endereco_de_retorno(), "grant_type": "authorization_code",
    })
    dados = _json(r)
    if r.status_code != 200 or not dados.get("refresh_token"):
        raise ErroDrive(f"O Google não liberou o acesso: {dados.get('error_description') or dados.get('error') or r.status_code}")
    global _ultimo_erro
    with _lock:
        _acesso.update(token=dados.get("access_token"), validade=time.time() + int(dados.get("expires_in") or 0) - 60)
        _gravar({"refreshToken": dados["refresh_token"], "connectedAt": fb.agora().isoformat()})
        _subpastas.clear()
        _conta.update(quando=0.0, dados=None)
        _ultimo_erro = None
    info = conta(atualizar=True) or {}
    _gravar({**_ler(), "email": info.get("email"), "name": info.get("name")})
    fb.evento("drive", f"Google Drive conectado: {info.get('email') or 'conta autorizada'}")
    acordar()


def desconectar():
    token = _ler().get("refreshToken")
    if token:
        try:
            requests.post(REVOGAR_URL, data={"token": token}, timeout=10)
        except requests.RequestException:
            pass
    with _lock:
        _gravar({})
        _acesso.update(token=None, validade=0.0)
        _subpastas.clear()
        _conta.update(quando=0.0, dados=None)
    fb.evento("drive", "Google Drive desconectado")


def _token(renovar=False):
    global _ultimo_erro
    with _lock:
        if not conectado():
            raise ErroDrive("O Google Drive não está conectado.")
        if not renovar and _acesso["token"] and _acesso["validade"] > time.time():
            return _acesso["token"]
        r = requests.post(TOKEN_URL, timeout=20, data={
            "client_id": config.DRIVE_CLIENT_ID, "client_secret": config.DRIVE_CLIENT_SECRET,
            "refresh_token": _ler()["refreshToken"], "grant_type": "refresh_token",
        })
        dados = _json(r)
        if r.status_code != 200 or not dados.get("access_token"):
            if dados.get("error") == "invalid_grant":
                _ultimo_erro = "A autorização do Google Drive expirou ou foi revogada. Conecte de novo no painel."
                raise ErroDrive(_ultimo_erro)
            raise ErroDrive(f"Não foi possível renovar o acesso ao Google Drive: {dados.get('error') or r.status_code}")
        _acesso.update(token=dados["access_token"], validade=time.time() + int(dados.get("expires_in") or 3600) - 60)
        return _acesso["token"]


def _json(r):
    try:
        dados = r.json()
    except ValueError:
        return {}
    return dados if isinstance(dados, dict) else {}


def _mensagem_do_google(r):
    erro = _json(r).get("error")
    if isinstance(erro, dict):
        motivo = next((e.get("reason") for e in erro.get("errors") or [] if e.get("reason")), "")
        return f"{erro.get('message') or r.status_code}" + (f" ({motivo})" if motivo else "")
    return str(erro or f"erro {r.status_code}")


def _pedir(metodo, url, *, cabecalhos=None, timeout=30, **kw):
    """Chamada autenticada à API do Drive (renova o acesso uma vez se ele tiver vencido)."""
    for tentativa in (0, 1):
        try:
            r = requests.request(metodo, url, timeout=timeout,
                                 headers={**(cabecalhos or {}), "Authorization": f"Bearer {_token(renovar=tentativa == 1)}"}, **kw)
        except requests.RequestException as exc:
            raise ErroDrive(f"Sem conexão com o Google Drive: {type(exc).__name__}") from exc
        if r.status_code != 401:
            return r
        r.close()
    return r


def _conferir(r):
    if r.status_code >= 400:
        raise ErroDrive(f"Google Drive: {_mensagem_do_google(r)}")
    return r


def conta(atualizar=False):
    """Conta autorizada e espaço do Drive: {"email", "name", "limit", "usage"} (cache de 5 min)."""
    if not conectado():
        return None
    if not atualizar and _conta["dados"] and time.time() - _conta["quando"] < 300:
        return _conta["dados"]
    try:
        r = _conferir(_pedir("GET", f"{API}/about", params={"fields": "user(emailAddress,displayName),storageQuota(limit,usage)"}))
    except ErroDrive:
        return _conta["dados"]
    dados = _json(r)
    cota = dados.get("storageQuota") or {}
    info = {
        "email": (dados.get("user") or {}).get("emailAddress"),
        "name": (dados.get("user") or {}).get("displayName"),
        "limit": int(cota["limit"]) if cota.get("limit") else None,   # sem limite em algumas contas
        "usage": int(cota.get("usage") or 0),
    }
    _conta.update(quando=time.time(), dados=info)
    return info


def ultimo_erro():
    return _ultimo_erro


# ------------------------------------------------------------------ pastas e arquivos
def _escapar(texto):
    return texto.replace("\\", "\\\\").replace("'", "\\'")


def _achar_pasta(nome, pai):
    consulta = f"name = '{_escapar(nome)}' and mimeType = '{TIPO_PASTA}' and trashed = false"
    if pai:
        consulta += f" and '{pai}' in parents"
    r = _conferir(_pedir("GET", f"{API}/files", params={"q": consulta, "fields": "files(id)", "pageSize": 1, "spaces": "drive"}))
    achadas = _json(r).get("files") or []
    return achadas[0]["id"] if achadas else None


def _criar_pasta(nome, pai):
    corpo = {"name": nome, "mimeType": TIPO_PASTA}
    if pai:
        corpo["parents"] = [pai]
    return _json(_conferir(_pedir("POST", f"{API}/files", params={"fields": "id"}, json=corpo)))["id"]


def _pasta_raiz():
    """Pasta do JIFTv no Drive (criada na primeira vez; o nome vem do painel)."""
    nome = armazenamento.ler()["drive"]["folderName"]
    with _lock:
        dados = _ler()
        if dados.get("folderId") and dados.get("folderName") == nome:
            r = _pedir("GET", f"{API}/files/{dados['folderId']}", params={"fields": "id,trashed"})
            if r.status_code == 200 and not _json(r).get("trashed"):
                return dados["folderId"]
        pasta = _achar_pasta(nome, None) or _criar_pasta(nome, None)
        _gravar({**dados, "folderId": pasta, "folderName": nome})
        _subpastas.clear()
        return pasta


def _subpasta(nome):
    with _lock:
        if nome not in _subpastas:
            raiz = _pasta_raiz()
            _subpastas[nome] = _achar_pasta(nome, raiz) or _criar_pasta(nome, raiz)
        return _subpastas[nome]


def pasta():
    dados = _ler()
    return {"id": dados.get("folderId"), "name": dados.get("folderName")}


def _posicao(r):
    """Quantos bytes o Drive já recebeu, pela resposta 308 do envio retomável."""
    faixa = r.headers.get("Range")
    return int(faixa.rsplit("-", 1)[1]) + 1 if faixa else 0


def _enviar_arquivo(caminho, nome, pasta_id, tipo, progresso=None):
    total = caminho.stat().st_size
    if total == 0:
        raise ErroDrive(f"Arquivo vazio: {nome}")
    inicio = _conferir(_pedir(
        "POST", f"{UPLOAD}/files", params={"uploadType": "resumable", "fields": CAMPOS},
        cabecalhos={"X-Upload-Content-Type": tipo, "X-Upload-Content-Length": str(total)},
        json={"name": nome, "parents": [pasta_id]}))
    sessao = inicio.headers.get("Location")
    if not sessao:
        raise ErroDrive("O Google Drive não abriu a sessão de envio.")

    enviado, falhas = 0, 0
    with caminho.open("rb") as f:
        while True:
            f.seek(enviado)
            bloco = f.read(PEDACO)
            try:
                r = requests.put(sessao, data=bloco, timeout=600, headers={
                    "Content-Length": str(len(bloco)),
                    "Content-Range": f"bytes {enviado}-{enviado + len(bloco) - 1}/{total}"})
            except requests.RequestException:
                r = None
            if r is not None and r.status_code in (200, 201):
                return _json(r)
            if r is not None and r.status_code == 308:
                enviado, falhas = _posicao(r), 0
                if progresso:
                    progresso(enviado, total)
                continue
            if r is not None and r.status_code in (400, 401, 403, 404):
                raise ErroDrive(f"Google Drive: {_mensagem_do_google(r)}")
            # Queda de rede ou erro 5xx: pergunta ao Drive onde parou e continua dali
            falhas += 1
            if falhas > 6:
                raise ErroDrive("O envio ao Google Drive foi interrompido várias vezes seguidas.")
            time.sleep(min(2 ** falhas, 30))
            try:
                c = requests.put(sessao, timeout=60, headers={"Content-Length": "0", "Content-Range": f"bytes */{total}"})
            except requests.RequestException:
                continue
            if c.status_code in (200, 201):
                return _json(c)
            if c.status_code == 308:
                enviado = _posicao(c)
            elif c.status_code == 404:
                raise ErroDrive("A sessão de envio do Google Drive expirou.")


def _md5(caminho):
    soma = hashlib.md5()  # noqa: S324 - é o código de conferência que o Drive devolve
    with caminho.open("rb") as f:
        for bloco in iter(lambda: f.read(4 * 1024 * 1024), b""):
            soma.update(bloco)
    return soma.hexdigest()


def lixeira(file_id):
    """Manda um arquivo para a lixeira do Drive (recuperável por 30 dias). Retorna o erro, ou None."""
    try:
        r = _pedir("PATCH", f"{API}/files/{file_id}", params={"fields": "id"}, json={"trashed": True})
    except ErroDrive as exc:
        return str(exc)
    if r.status_code in (200, 404):
        return None
    return _mensagem_do_google(r)


def abrir(file_id, faixa=None):
    """Abre o vídeo no Drive para repassar ao player. `faixa` é o cabeçalho Range do navegador."""
    cabecalhos = {"Accept-Encoding": "identity"}
    if faixa:
        cabecalhos["Range"] = faixa
    return _pedir("GET", f"{API}/files/{file_id}", params={"alt": "media"}, cabecalhos=cabecalhos,
                  stream=True, timeout=(10, 60))


# ------------------------------------------------------------------ fila de envio
def _mensagem(exc):
    msg = str(exc) or type(exc).__name__
    if "quota" in msg.lower():
        return f"O Google Drive está sem espaço. A cópia local continua salva. Detalhe: {msg}"
    return msg


def _proxima():
    agora = time.time()
    for vid, v in sorted(estado.copia_vods().items(), key=lambda x: fb.segundos(x[1].get("recordedAt")) or 0):
        d = v.get("drive") or {}
        if not v.get("localFile") or not v.get("localAvailable"):
            continue
        if agora - _processadas.get(vid, 0) < 30:
            continue
        if d.get("status") == "pending":
            return vid, v
        if d.get("status") == "failed" and d.get("nextAttemptAt") and fb.segundos(d["nextAttemptAt"]) <= agora:
            return vid, v
    return None, None


def enviar(vid, v):
    global _ultimo_erro
    ref = fb.db().collection("vods").document(vid)
    caminho = config.VIDEOS / v["localFile"]
    stem = v["localFile"].rsplit(".", 1)[0]
    anterior = v.get("drive") or {}
    tentativas = anterior.get("attempts", 0)
    ref.update({"drive.status": "uploading", "drive.error": None, "drive.progress": 0})
    fb.evento("drive", f"Enviando ao Google Drive: {v.get('title')} ({v['localFile']})")

    marca = {"pct": 0, "quando": time.time()}

    def progresso(enviado, total):
        pct = int(enviado * 100 / total)
        if pct - marca["pct"] >= 5 and time.time() - marca["quando"] >= 10:
            marca.update(pct=pct, quando=time.time())
            try:
                ref.update({"drive.progress": pct})
            except Exception:  # noqa: BLE001 - o progresso é só informativo
                pass

    enviado = None
    try:
        pasta_id = _subpasta(v.get("streamSlug") or "sem-transmissao")
        tipo = "video/mp4" if caminho.suffix.lower() == ".mp4" else "video/x-flv"
        enviado = _enviar_arquivo(caminho, caminho.name, pasta_id, tipo, progresso)
        if int(enviado.get("size") or 0) != caminho.stat().st_size or enviado.get("md5Checksum") != _md5(caminho):
            lixeira(enviado["id"])
            raise ErroDrive("O arquivo chegou diferente ao Google Drive (conferência de integridade falhou).")
    except Exception as exc:  # noqa: BLE001 - qualquer falha precisa ser registrada
        tentativas += 1
        msg = _mensagem(exc)
        repetir = config.RETRY_INTERVAL_MIN > 0 and not any(p in str(exc).lower() for p in NAO_REPETIR)
        proxima = (datetime.now(timezone.utc) + timedelta(minutes=config.RETRY_INTERVAL_MIN * min(tentativas, 4))
                   if repetir else None)
        _ultimo_erro = msg[:300]
        ref.update({
            "drive.status": "failed",
            "drive.error": msg[:2000],
            "drive.attempts": tentativas,
            "drive.nextAttemptAt": proxima,
            "drive.progress": None,
        })
        fb.evento("drive_erro", f"Falha no envio de '{v.get('title')}' ao Google Drive: {msg[:300]}")
        return

    # Miniatura e metadados vão juntos (pequenos; se falharem, o vídeo já está salvo)
    extras = {}
    for sufixo, tipo, campo in ((".jpg", "image/jpeg", "thumbId"), (".info.json", "application/json", "infoId")):
        extra = config.VIDEOS / f"{stem}{sufixo}"
        try:
            if extra.is_file() and extra.stat().st_size:
                extras[campo] = _enviar_arquivo(extra, extra.name, pasta_id, tipo)["id"]
        except Exception:  # noqa: BLE001
            pass
    # Reenvio: a cópia anterior vai para a lixeira para não duplicar no Drive
    for campo in ("fileId", "thumbId", "infoId"):
        if anterior.get(campo) and anterior[campo] not in (enviado["id"], *extras.values()):
            lixeira(anterior[campo])

    registro = {
        "status": "uploaded",
        "fileId": enviado["id"],
        "folderId": pasta_id,
        "webViewLink": enviado.get("webViewLink"),
        "bytes": int(enviado.get("size") or 0),
        "md5": enviado.get("md5Checksum"),
        "attempts": tentativas + 1,
        "uploadedAt": fb.SERVER_TIMESTAMP,
        "error": None,
        "nextAttemptAt": None,
        "progress": None,
        **extras,
    }
    ref.update({"drive": registro})
    # Registro ao lado do vídeo: continua lá depois que a cópia local for apagada
    try:
        (config.VIDEOS / f"{stem}.drive.json").write_text(json.dumps({
            "file_id": enviado["id"], "web_view_link": enviado.get("webViewLink"),
            "bytes": registro["bytes"], "md5": registro["md5"],
        }, indent=2, ensure_ascii=False), encoding="utf-8")
    except OSError:
        pass
    _ultimo_erro = None
    _conta["quando"] = 0.0
    fb.evento("drive_ok", f"Enviado ao Google Drive: {v.get('title')}")
    from . import recordings  # importado aqui: recordings importa este módulo
    recordings.acordar()      # com a pasta local desligada, a cópia do computador já pode sair


def ajustar_status():
    """Ao iniciar e a cada mudança no painel: liga/desliga a fila; envios interrompidos voltam."""
    for vid, v in estado.copia_vods().items():
        if not v.get("localFile"):
            continue
        status = (v.get("drive") or {}).get("status")
        novo = None
        if status == "uploading" and vid not in _processadas:
            novo = "pending"
        elif status in (None, "disabled") and ativo() and v.get("localAvailable"):
            novo = "pending"
        elif status == "pending" and not ativo():
            novo = "disabled"
        if novo:
            fb.db().collection("vods").document(vid).update({"drive.status": novo})


def loop():
    estado.ao_mudar("vods", _acordar.set)  # "Reenviar" no painel age na hora
    ajustar_status()
    while True:
        try:
            if ativo() and not armazenamento.movendo():
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
        # Com algo na fila (ex.: "Reenviar" logo depois de uma falha), olha de novo em poucos segundos
        na_fila = any((v.get("drive") or {}).get("status") == "pending" and v.get("localAvailable")
                      for v in estado.copia_vods().values())
        _acordar.wait(10 if na_fila and ativo() else 60)
        _acordar.clear()
