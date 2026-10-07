"""Worker do JIFTv: liga o servidor de mídia (nginx-rtmp) ao Firebase."""

import threading
import time
import traceback
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from . import cloud, comandos, estado, fb, live, recordings, sistema
from .atletas import router as atletas
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
        (comandos.loop, "comandos"),         # pedidos do painel
        (sistema.loop, "sistema"),           # estado do servidor para o painel
    ):
        _em_segundo_plano(funcao, nome)
    print("[jiftv] worker pronto", flush=True)


@asynccontextmanager
async def lifespan(_app):
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

# O site (Firebase Hosting) chama /api/audiencia de outro domínio
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["GET", "POST"], allow_headers=["Content-Type"])

NOMES_CAMPOS = {
    "name": "nome", "nickname": "apelido", "birthDate": "data de nascimento", "photoUrl": "foto",
    "jerseyNumber": "número", "position": "posição", "bio": "bio", "modalityCode": "modalidade",
    "classId": "turma", "submittedByName": "seu nome", "submittedByEmail": "seu e-mail",
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
