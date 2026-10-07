"""Configurações do worker do JIFTv, lidas das variáveis de ambiente (arquivo .env)."""

import os
from pathlib import Path
from zoneinfo import ZoneInfo


def _env(nome, padrao=""):
    return os.environ.get(nome, padrao).strip()


def _int(nome, padrao):
    try:
        return int(_env(nome) or padrao)
    except ValueError:
        return padrao


def _bool(nome, padrao):
    valor = _env(nome).lower()
    if not valor:
        return padrao
    return valor not in ("0", "false", "nao", "não", "no", "off")


RECORDINGS = Path("/recordings")
VIDEOS = RECORDINGS / "videos"
LOGS = RECORDINGS / "logs"

# Servidor interno do nginx (estatísticas e controle do RTMP)
MEDIA_URL = _env("MEDIA_INTERNAL_URL", "http://media:8081").rstrip("/")
TZ = ZoneInfo(_env("TZ") or "America/Sao_Paulo")

# Firebase. Com FIRESTORE_EMULATOR_HOST definido, usa os emuladores (sem credenciais).
FIREBASE_PROJECT_ID = _env("FIREBASE_PROJECT_ID", "demo-jiftv")
CREDENCIAIS = Path(_env("GOOGLE_APPLICATION_CREDENTIALS", "/secrets/firebase-service-account.json"))
EMULADOR = bool(_env("FIRESTORE_EMULATOR_HOST"))

CLOUDINARY_URL = _env("CLOUDINARY_URL")
CLOUDINARY_FOLDER = _env("CLOUDINARY_FOLDER", "jiftv").strip("/")
RETRY_INTERVAL_MIN = max(0, _int("RETRY_INTERVAL_MIN", 15))

RTMP_PORT = _int("RTMP_PORT", 1935)
QUALIDADES = _env("QUALIDADES") or "1080:5000 720:2800 480:1200 240:400"
# Novas gravações aparecem no site automaticamente?
GRAVACOES_PUBLICAS = _bool("GRAVACOES_PUBLICAS", True)


def qualidades():
    """Escada de qualidades, da maior para a menor: [{"height": 1080, "kbps": 5000}, ...]."""
    itens = []
    for q in QUALIDADES.split():
        altura, _, kbps = q.partition(":")
        if altura.isdigit() and kbps.isdigit():
            itens.append({"height": int(altura), "kbps": int(kbps)})
    return sorted(itens, key=lambda q: -q["height"])
