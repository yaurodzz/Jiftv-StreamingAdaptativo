"""Cadastro público de atletas (fila de moderação).

Mesmo contrato do POST /public/athletes/submit do sistema anterior:
- o visitante envia a foto direto ao Cloudinary (preset unsigned) e depois os dados aqui;
- validação estrita, limite de 10 envios por minuto por IP;
- o servidor SEMPRE grava status="pending", submittedAt e submittedIp (nunca vêm do cliente).
O perfil só aparece no site depois que um admin aprova no painel.
"""

import re
import threading
import time
from datetime import date

from fastapi import APIRouter, HTTPException, Request
from google.cloud.firestore_v1.base_query import FieldFilter
from pydantic import BaseModel, ConfigDict, Field, field_validator

from . import fb

router = APIRouter(prefix="/api")

LIMITE = 10          # envios
JANELA = 60          # segundos
_envios = {}         # ip -> [instantes]
_lock = threading.Lock()

FOTO = re.compile(r"^https://res\.cloudinary\.com/[^/]+/image/upload/.+")
EMAIL = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


class Cadastro(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)

    name: str = Field(min_length=2, max_length=60)
    nickname: str | None = Field(None, max_length=30)
    birthDate: str
    photoUrl: str = Field(max_length=500)
    jerseyNumber: int | None = Field(None, ge=0, le=999)
    position: str | None = Field(None, max_length=40)
    bio: str | None = Field(None, max_length=400)
    modalityCode: str = Field(pattern=r"^[A-Z]{3}$")
    classId: str = Field(min_length=1, max_length=100)
    submittedByName: str | None = Field(None, max_length=60)
    submittedByEmail: str | None = Field(None, max_length=120)

    @field_validator("birthDate")
    @classmethod
    def _nascimento(cls, v):
        if not re.fullmatch(r"\d{4}-\d{2}-\d{2}", v):
            raise ValueError("use o formato AAAA-MM-DD")
        try:
            d = date.fromisoformat(v)
        except ValueError as exc:
            raise ValueError("data inválida") from exc
        idade = (date.today() - d).days / 365.25
        if not 8 <= idade <= 80:
            raise ValueError("idade fora da faixa aceita (8 a 80 anos)")
        return v

    @field_validator("photoUrl")
    @classmethod
    def _foto(cls, v):
        # Só imagens do Cloudinary: evita hotlink de imagens externas
        if not FOTO.match(v):
            raise ValueError("a foto precisa ter sido enviada ao Cloudinary")
        return v

    @field_validator("submittedByEmail")
    @classmethod
    def _email(cls, v):
        if v and not EMAIL.match(v):
            raise ValueError("e-mail inválido")
        return v or None


def _ip(request: Request):
    # Atrás do túnel da Cloudflare o IP real vem neste cabeçalho
    return (request.headers.get("cf-connecting-ip")
            or request.headers.get("x-real-ip")
            or (request.client.host if request.client else "?"))


def _limitar(ip):
    agora = time.time()
    with _lock:
        recentes = [t for t in _envios.get(ip, []) if t > agora - JANELA]
        if len(recentes) >= LIMITE:
            raise HTTPException(429, "Muitos envios. Aguarde um minuto e tente de novo.")
        recentes.append(agora)
        _envios[ip] = recentes
        if len(_envios) > 5000:
            _envios.clear()


@router.post("/atletas", status_code=201)
def cadastrar(corpo: Cadastro, request: Request):
    ip = _ip(request)
    _limitar(ip)

    db = fb.db()
    modalidades = list(db.collection("modalities")
                       .where(filter=FieldFilter("code", "==", corpo.modalityCode)).limit(1).stream())
    if not modalidades:
        raise HTTPException(400, "Modalidade não encontrada.")
    turma = db.collection("classes").document(corpo.classId).get()
    if not turma.exists:
        raise HTTPException(400, "Turma não encontrada.")

    modalidade = modalidades[0].to_dict()
    t = turma.to_dict()
    _hora, ref = db.collection("athletes").add({
        "name": corpo.name,
        "nickname": corpo.nickname or None,
        "birthDate": corpo.birthDate,
        "photoUrl": corpo.photoUrl,
        "jerseyNumber": corpo.jerseyNumber,
        "position": corpo.position or None,
        "bio": corpo.bio or None,
        "modalityCode": corpo.modalityCode,
        "modalityName": modalidade.get("name"),
        "classId": corpo.classId,
        "className": t.get("name"),
        "classCampus": t.get("campus") or None,
        "submittedByName": corpo.submittedByName or None,
        "submittedByEmail": corpo.submittedByEmail,
        # Campos travados no servidor
        "status": "pending",
        "submittedAt": fb.SERVER_TIMESTAMP,
        "submittedIp": ip,
        "approvedAt": None,
        "approvedBy": None,
    })
    fb.evento("atleta", f"Novo cadastro de atleta aguardando aprovação: {corpo.name} ({corpo.modalityCode})")
    return {"id": ref.id, "status": "pending"}
