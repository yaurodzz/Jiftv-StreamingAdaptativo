"""Cópia local (em memória) das coleções do Firestore usadas pelo worker.

Os ouvintes (onSnapshot) mantêm as cópias atualizadas em tempo real, então o gancho
on_publish do nginx responde sem consultar a nuvem a cada conexão do OBS.
Um vigia recria os ouvintes se a conexão com o Firestore cair.
"""

import re
import secrets
import threading
import time
import traceback
import unicodedata

from . import fb

_lock = threading.RLock()
streams = {}      # id -> dados do documento
chaves = {}       # streamKey -> id da transmissão
chave_de = {}     # id da transmissão -> streamKey
vods = {}         # id -> dados do documento

_ouvintes = {}
_assinantes = {"streams": [], "vods": []}  # funções chamadas a cada mudança


def ao_mudar(colecao, funcao):
    _assinantes[colecao].append(funcao)


def _avisar(colecao):
    for funcao in _assinantes[colecao]:
        try:
            funcao()
        except Exception:  # noqa: BLE001
            traceback.print_exc()


# ------------------------------------------------------------------ consultas
def stream_por_chave(chave):
    with _lock:
        sid = chaves.get(chave)
        return (sid, streams.get(sid)) if sid else (None, None)


def stream_por_slug(slug):
    with _lock:
        for sid, s in streams.items():
            if s.get("slug") == slug:
                return sid, s
    return None, None


def vod_por_arquivo(rel):
    with _lock:
        for vid, v in vods.items():
            if v.get("localFile") == rel:
                return vid, v
    return None, None


def vod_por_stem(stem):
    with _lock:
        for vid, v in vods.items():
            arquivo = v.get("localFile") or ""
            if arquivo.rsplit(".", 1)[0] == stem:
                return vid, v
    return None, None


def copia_streams():
    with _lock:
        return dict(streams)


def copia_vods():
    with _lock:
        return dict(vods)


# ------------------------------------------------------------------ migração do modelo antigo
def gerar_slug(titulo):
    texto = unicodedata.normalize("NFKD", titulo or "").encode("ascii", "ignore").decode()
    base = re.sub(r"[^a-z0-9]+", "-", texto.lower()).strip("-")[:40].strip("-") or "transmissao"
    return f"{base}-{secrets.token_hex(2)}"


def _migrar_stream(sid, dados):
    """Transmissões criadas pelo sistema anterior guardavam a chave em `streams` (público).

    Move a chave para `streamKeys` (só admin lê) e completa os campos novos.
    """
    mudancas = {}
    if dados.get("streamKey"):
        fb.db().collection("streamKeys").document(sid).set(
            {"streamKey": dados["streamKey"], "updatedAt": fb.SERVER_TIMESTAMP}, merge=True)
        mudancas["streamKey"] = fb.DELETE_FIELD
    if not dados.get("slug"):
        mudancas["slug"] = gerar_slug(dados.get("title"))
    if "keyActive" not in dados:
        mudancas["keyActive"] = True
    if "listed" not in dados:
        mudancas["listed"] = True
    if "createdAt" not in dados:  # sem ele, a lista ordenada do painel não mostra o documento
        mudancas["createdAt"] = fb.SERVER_TIMESTAMP
    if mudancas:
        fb.db().collection("streams").document(sid).update(mudancas)
        fb.evento("transmissao", f"Transmissão atualizada para o modelo novo: {dados.get('title')}")


def _migrar_vod(vid, dados):
    """Gravações do sistema anterior não tinham `visible`: sem ele, as regras escondem o vídeo."""
    if "visible" not in dados:
        fb.db().collection("vods").document(vid).update({"visible": True})


# ------------------------------------------------------------------ ouvintes
def _ao_receber_streams(docs, _mudancas, _quando):
    novos = {}
    for d in docs:
        dados = d.to_dict() or {}
        novos[d.id] = dados
        if dados.get("streamKey") or not dados.get("slug") or "keyActive" not in dados or "createdAt" not in dados:
            threading.Thread(target=_migrar_stream, args=(d.id, dados), daemon=True).start()
    with _lock:
        streams.clear()
        streams.update(novos)
    _avisar("streams")


def _ao_receber_chaves(docs, _mudancas, _quando):
    with _lock:
        chaves.clear()
        chave_de.clear()
        for d in docs:
            chave = (d.to_dict() or {}).get("streamKey")
            if chave:
                chaves[chave] = d.id
                chave_de[d.id] = chave


def _ao_receber_vods(docs, _mudancas, _quando):
    novos = {}
    for d in docs:
        dados = d.to_dict() or {}
        novos[d.id] = dados
        if "visible" not in dados:
            threading.Thread(target=_migrar_vod, args=(d.id, dados), daemon=True).start()
    with _lock:
        vods.clear()
        vods.update(novos)
    _avisar("vods")


_COLECOES = {
    "streams": _ao_receber_streams,
    "streamKeys": _ao_receber_chaves,
    "vods": _ao_receber_vods,
}


def _iniciar_ouvinte(nome):
    antigo = _ouvintes.get(nome)
    if antigo is not None:
        try:
            antigo.unsubscribe()
        except Exception:  # noqa: BLE001
            pass
    _ouvintes[nome] = fb.db().collection(nome).on_snapshot(_COLECOES[nome])


def carregar():
    """Leitura inicial síncrona + ouvintes em tempo real."""
    for nome, funcao in _COLECOES.items():
        docs = list(fb.db().collection(nome).stream())
        funcao(docs, None, None)
        _iniciar_ouvinte(nome)
    print(f"[jiftv] Firestore: {len(streams)} transmissões, {len(vods)} gravações carregadas", flush=True)


def vigiar():
    """Recria ouvintes que pararam (queda de rede, reinício dos emuladores...)."""
    while True:
        time.sleep(30)
        for nome in _COLECOES:
            ouvinte = _ouvintes.get(nome)
            if ouvinte is None or getattr(ouvinte, "_closed", False):
                try:
                    print(f"[jiftv] reconectando o ouvinte de '{nome}'", flush=True)
                    docs = list(fb.db().collection(nome).stream())
                    _COLECOES[nome](docs, None, None)
                    _iniciar_ouvinte(nome)
                except Exception as exc:  # noqa: BLE001
                    print(f"[jiftv] Firestore indisponível ({exc}); nova tentativa em 30 s", flush=True)
