"""Conexão com o Firebase (Firestore + Auth) pelo Admin SDK.

Em desenvolvimento, as variáveis FIRESTORE_EMULATOR_HOST e FIREBASE_AUTH_EMULATOR_HOST
apontam para os emuladores e nenhuma credencial é necessária. Em produção, a conta de
serviço fica em secrets/firebase-service-account.json.
"""

import threading
from datetime import datetime, timezone

import firebase_admin
from firebase_admin import auth, credentials
from google.cloud import firestore

from . import config

SERVER_TIMESTAMP = firestore.SERVER_TIMESTAMP
DELETE_FIELD = firestore.DELETE_FIELD
Increment = firestore.Increment

_db = None
_lock = threading.Lock()


def iniciar():
    global _db
    with _lock:
        if _db is not None:
            return _db
        opcoes = {"projectId": config.FIREBASE_PROJECT_ID}
        if config.EMULADOR:
            firebase_admin.initialize_app(options=opcoes)
            _db = firestore.Client(project=config.FIREBASE_PROJECT_ID)
            print(f"[jiftv] Firebase: usando os EMULADORES (projeto {config.FIREBASE_PROJECT_ID})", flush=True)
        else:
            if not config.CREDENCIAIS.exists():
                raise SystemExit(
                    f"[jiftv] Conta de serviço não encontrada em {config.CREDENCIAIS}. "
                    "Gere a chave no Console do Firebase (Configurações do projeto > Contas de serviço) "
                    "e salve em secrets/firebase-service-account.json."
                )
            app = firebase_admin.initialize_app(credentials.Certificate(str(config.CREDENCIAIS)), opcoes)
            _db = firestore.Client(project=config.FIREBASE_PROJECT_ID, credentials=app.credential.get_credential())
            print(f"[jiftv] Firebase: projeto {config.FIREBASE_PROJECT_ID}", flush=True)
        return _db


def db():
    return _db or iniciar()


def agora():
    return datetime.now(timezone.utc)


def segundos(ts):
    """Timestamp do Firestore (datetime) -> segundos desde 1970, ou None."""
    if ts is None:
        return None
    try:
        return ts.timestamp()
    except AttributeError:
        return None


def evento(tipo, mensagem):
    """Registra uma atividade exibida no painel (coleção `events`)."""
    print(f"[jiftv] {tipo}: {mensagem}", flush=True)
    try:
        db().collection("events").add({"type": tipo, "message": mensagem[:500], "at": SERVER_TIMESTAMP})
    except Exception as exc:  # noqa: BLE001 - o registro nunca pode derrubar o fluxo principal
        print(f"[jiftv] não foi possível registrar o evento: {exc}", flush=True)


def limpar_eventos(manter=300):
    antigos = (db().collection("events").order_by("at", direction=firestore.Query.DESCENDING)
               .offset(manter).limit(200).stream())
    for doc in antigos:
        doc.reference.delete()


def verificar_admin(token):
    """Valida um ID token do Firebase Auth e confere o custom claim { admin: true }."""
    try:
        dados = auth.verify_id_token(token)
    except Exception:  # noqa: BLE001 - token inválido, expirado ou de outro projeto
        return False
    return bool(dados.get("admin"))
