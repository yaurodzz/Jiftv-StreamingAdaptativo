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

# API do site institucional (feito pelo professor): fornece a foto de cada aluno pela matrícula.
# Veja docs/integracao-site-institucional.md. Vazio = cadastro de atleta com upload de foto.
INSTITUCIONAL_URL = _env("INSTITUCIONAL_API_URL").rstrip("/")
INSTITUCIONAL_TOKEN = _env("INSTITUCIONAL_API_TOKEN")
INSTITUCIONAL_CABECALHO = _env("INSTITUCIONAL_API_HEADER", "Authorization")
# Caminho da consulta; {matricula} é substituída. A resposta pode ser a própria imagem ou um JSON.
INSTITUCIONAL_CAMINHO = _env("INSTITUCIONAL_API_PATH", "/alunos/{matricula}/foto")
# Em respostas JSON: campos (em ordem de preferência) que trazem a foto e o nome do aluno.
INSTITUCIONAL_CAMPOS_FOTO = [c.strip() for c in
                             (_env("INSTITUCIONAL_API_PHOTO_FIELDS") or "foto,photo,fotoUrl,photoUrl,imagem,url").split(",") if c.strip()]
INSTITUCIONAL_CAMPOS_NOME = [c.strip() for c in
                             (_env("INSTITUCIONAL_API_NAME_FIELDS") or "nome,name,nomeCompleto").split(",") if c.strip()]
# Servidores extras autorizados a hospedar a foto (CDN), além do host da API. Separados por vírgula.
INSTITUCIONAL_HOSTS_FOTO = {h.strip().lower() for h in _env("INSTITUCIONAL_PHOTO_HOSTS").split(",") if h.strip()}
INSTITUCIONAL_TIMEOUT = max(2, _int("INSTITUCIONAL_API_TIMEOUT", 10))
# Origem da foto no cadastro público: "institucional" (pela matrícula) ou "upload" (foto enviada ao Cloudinary).
ATLETAS_FOTO = _env("ATLETAS_PHOTO_SOURCE").lower() or ("institucional" if INSTITUCIONAL_URL else "upload")

# Sites autorizados a chamar o worker pelo navegador (contagem de espectadores, cadastro de atletas).
# Nos emuladores (desenvolvimento) qualquer origem é aceita.
CORS_ORIGENS = [o.strip().rstrip("/") for o in (_env("CORS_ORIGINS") or
                ",".join(["https://jiftv.org", "https://www.jiftv.org",
                          f"https://{FIREBASE_PROJECT_ID}.web.app", f"https://{FIREBASE_PROJECT_ID}.firebaseapp.com",
                          "http://localhost:5173"])).split(",") if o.strip()]
if EMULADOR:
    CORS_ORIGENS = ["*"]

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
