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


# Pasta padrão das gravações (RECORDINGS_DIR do .env): também guarda logs e fotos de atletas.
RECORDINGS = Path(_env("JIFTV_RECORDINGS", "/recordings"))
LOGS = RECORDINGS / "logs"
# Volume compartilhado com o servidor de mídia: configuração do armazenamento, autorização do
# Google Drive e o atalho "atual", que aponta para a pasta local escolhida no painel.
ESTADO = Path(_env("JIFTV_ESTADO", "/var/jiftv"))
PASTA_ATUAL = ESTADO / "atual"
# Raiz das pastas do computador que o painel pode escolher (PASTAS_DO_PC do .env, montada em /pc).
PASTAS = Path(_env("JIFTV_PASTAS", "/pc"))
# Caminhos no computador, só para mostrar no painel (dentro do container eles são /recordings e /pc).
RECORDINGS_NO_PC = _env("RECORDINGS_DIR", "./gravacoes")
PASTAS_NO_PC = _env("PASTAS_DO_PC") or RECORDINGS_NO_PC
# O nginx grava e entrega os vídeos por este caminho, que segue o atalho "atual".
EM_ANDAMENTO = PASTA_ATUAL / "em_andamento"
VIDEOS = PASTA_ATUAL / "videos"

# Servidor interno do nginx (estatísticas e controle do RTMP)
MEDIA_URL = _env("MEDIA_INTERNAL_URL", "http://media:8081").rstrip("/")
# Entrada RTMP do nginx pela rede do Docker: destino da câmera do celular (camera.py)
RTMP_INTERNO = _env("RTMP_INTERNAL_URL", "rtmp://media:1935/live").rstrip("/")
TZ = ZoneInfo(_env("TZ") or "America/Sao_Paulo")

# Firebase. Com FIRESTORE_EMULATOR_HOST definido, usa os emuladores (sem credenciais).
FIREBASE_PROJECT_ID = _env("FIREBASE_PROJECT_ID", "demo-jiftv")
CREDENCIAIS = Path(_env("GOOGLE_APPLICATION_CREDENTIALS", "/secrets/firebase-service-account.json"))
EMULADOR = bool(_env("FIRESTORE_EMULATOR_HOST"))

CLOUDINARY_URL = _env("CLOUDINARY_URL")
CLOUDINARY_FOLDER = _env("CLOUDINARY_FOLDER", "jiftv").strip("/")
RETRY_INTERVAL_MIN = max(0, _int("RETRY_INTERVAL_MIN", 15))

# Google Drive (docs/armazenamento.md): cliente OAuth criado no Google Cloud. A autorização da conta
# é feita pelo painel e fica guardada no volume de estado, não no .env.
DRIVE_CLIENT_ID = _env("GOOGLE_OAUTH_CLIENT_ID")
DRIVE_CLIENT_SECRET = _env("GOOGLE_OAUTH_CLIENT_SECRET")
# Endereço público do worker, usado no retorno da autorização (precisa estar cadastrado no cliente OAuth).
API_PUBLICA = (_env("API_PUBLIC_URL") or "https://api.jiftv.org").rstrip("/")

# API do site institucional (feito pelo professor): fornece a foto de cada aluno pela matrícula.
# Veja docs/integracao-site-institucional.md. Vazio = o atleta é cadastrado sem foto e o admin envia uma pelo painel.
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
