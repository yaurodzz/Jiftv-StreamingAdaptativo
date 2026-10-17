"""Worker do JIFTv: liga o servidor de mídia (nginx-rtmp) ao Firebase."""

import threading
import time
import traceback
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from . import armazenamento, cloud, comandos, config, drive, estado, fb, live, recordings, sistema
from .atletas import router as atletas
from .camera import router as camera
from .ponte import router as ponte
from .rotas_armazenamento import router as rotas_armazenamento
from .routes import interno, publico


def _em_segundo_plano(funcao, nome):
    threading.Thread(target=funcao, name=nome, daemon=True).start()


def _conectar():
    """Conecta ao Firestore (tenta de novo até conseguir) e inicia as tarefas."""
    fb.iniciar()
    while True:
        try:
            estado.carregar()
            break
        except Exception as exc:  # noqa: BLE001
            print(f"[jiftv] Firestore indisponível ({exc}); nova tentativa em 10 s", flush=True)
            time.sleep(10)
    for funcao, nome in (
        (estado.vigiar, "ouvintes"),         # reconecta os ouvintes do Firestore
        (live.loop, "ao-vivo"),              # status das transmissões x nginx-rtmp
        (recordings.loop, "acervo"),         # pasta de gravações -> coleção vods
        (cloud.loop, "cloudinary"),          # fila de envio ao Cloudinary
        (drive.loop, "drive"),               # fila de envio ao Google Drive
        (comandos.loop, "comandos"),         # pedidos do painel
        (sistema.loop, "sistema"),           # estado do servidor para o painel
    ):
        _em_segundo_plano(funcao, nome)
    print("[jiftv] worker pronto", flush=True)


@asynccontextmanager
async def lifespan(_app):
    armazenamento.preparar()  # atalho da pasta local, antes de qualquer varredura

    def iniciar():
        try:
            _conectar()
        except SystemExit as exc:
            print(exc, flush=True)
        except Exception:  # noqa: BLE001
            traceback.print_exc()
    _em_segundo_plano(iniciar, "inicio")
    yield


app = FastAPI(title="JIFTv worker", lifespan=lifespan, docs_url=None, redoc_url=None, openapi_url=None)

# O site (Firebase Hosting, jiftv.org) chama /api/* de outro domínio: só as origens de CORS_ORIGINS
app.add_middleware(CORSMiddleware, allow_origins=config.CORS_ORIGENS, allow_methods=["GET", "POST", "PUT"],
                   allow_headers=["Content-Type", "Authorization"])

NOMES_CAMPOS = {
    "name": "nome", "nickname": "apelido", "birthDate": "data de nascimento",
    "jerseyNumber": "número", "position": "posição", "bio": "bio", "modalityCode": "modalidade", "modalityCodes": "modalidades",
    "classId": "turma", "matricula": "matrícula", "submittedByName": "seu nome", "submittedByEmail": "seu e-mail",
}


@app.exception_handler(RequestValidationError)
async def dados_invalidos(_request: Request, exc: RequestValidationError):
    erro = exc.errors()[0] if exc.errors() else {}
    campo = str((erro.get("loc") or ["", "dados"])[-1])
    msg = str(erro.get("msg", "")).removeprefix("Value error, ")
    return JSONResponse(status_code=400, content={"detail": f"Confira o campo {NOMES_CAMPOS.get(campo, campo)}: {msg}"})


app.include_router(interno)
app.include_router(publico)
app.include_router(atletas)
app.include_router(camera)
app.include_router(ponte)
app.include_router(rotas_armazenamento)
