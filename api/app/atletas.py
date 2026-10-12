"""Cadastro público de atletas (fila de moderação) e a foto do atleta.

Cadastro (POST /api/atletas, sem login): a pessoa informa os dados e a MATRÍCULA escolar; não envia foto.
O worker tenta buscar a foto na API do site institucional pela matrícula (app/institucional.py) e guarda uma
cópia no Cloudinary (se configurado) ou na pasta local gravacoes/fotos/. Se a busca der errado (API fora do
ar ou não configurada, matrícula desconhecida, aluno sem foto), o cadastro é aceito mesmo assim, SEM foto, e
o motivo fica em athletePrivate/{id}.photoStatus para o admin resolver pelo painel.

A matrícula NÃO vai para o perfil público: fica em athletePrivate/{id} (só admin lê), junto com o nome
devolvido pela API, para o admin conferir se bate com o cadastro.

Painel (ID token de admin em "Authorization: Bearer ..."):
- PUT  /api/atletas/{id}/foto                 o admin envia uma foto (corpo = a imagem)
- POST /api/atletas/{id}/foto/institucional   busca de novo a foto pela matrícula
- PUT  /api/atletas/{id}/matricula            corrige (ou informa) a matrícula

Validação estrita, limite de envios por IP e o servidor SEMPRE grava status="pending", submittedAt e
submittedIp (nunca vêm do cliente). O perfil só aparece no site depois que um admin aprova.
"""

import io
import re
import threading
import time
from datetime import date

import cloudinary.uploader
from fastapi import APIRouter, HTTPException, Request
from fastapi.concurrency import run_in_threadpool
from google.cloud.firestore_v1.base_query import FieldFilter
from pydantic import BaseModel, ConfigDict, Field, field_validator

from . import cloud, config, fb, institucional
from .rotas_armazenamento import admin

router = APIRouter(prefix="/api")

LIMITE = 10                   # envios por IP...
JANELA = 60                   # ...a cada minuto
_envios = {}                  # ip -> [instantes]
_lock = threading.Lock()

FOTOS_LOCAIS = config.RECORDINGS / "fotos"
EMAIL = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
ID_ATLETA = re.compile(r"^[A-Za-z0-9_-]{1,64}$")

# Por que o atleta ficou sem foto (athletePrivate.photoStatus) e o que o admin lê no painel
SEM_FOTO = {
    "nao_configurada": "A API do site institucional não está configurada no servidor.",
    "nao_encontrada": "Matrícula não encontrada no cadastro da instituição.",
    "sem_foto": "A matrícula foi encontrada, mas o cadastro dela não tem foto.",
    "erro": "Não foi possível consultar o site da instituição.",
}


def _conferir_matricula(v):
    if not institucional.matricula_valida(v):
        raise ValueError("use só letras e números (de 4 a 20 caracteres)")
    return v


class Cadastro(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)

    name: str = Field(min_length=2, max_length=60)
    nickname: str | None = Field(None, max_length=30)
    birthDate: str
    matricula: str = Field(max_length=30)
    jerseyNumber: int | None = Field(None, ge=0, le=999)
    position: str | None = Field(None, max_length=40)
    bio: str | None = Field(None, max_length=400)
    modalityCode: str = Field(pattern=r"^[A-Z]{3}$")
    classId: str = Field(min_length=1, max_length=100)
    submittedByName: str | None = Field(None, max_length=60)
    submittedByEmail: str | None = Field(None, max_length=120)

    @field_validator("matricula")
    @classmethod
    def _matricula(cls, v):
        return _conferir_matricula(v)

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

    @field_validator("submittedByEmail")
    @classmethod
    def _email(cls, v):
        if v and not EMAIL.match(v):
            raise ValueError("e-mail inválido")
        return v or None


class Matricula(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)

    matricula: str = Field(max_length=30)

    @field_validator("matricula")
    @classmethod
    def _matricula(cls, v):
        return _conferir_matricula(v)


def _ip(request: Request):
    # Atrás do túnel da Cloudflare o IP real vem neste cabeçalho
    return (request.headers.get("cf-connecting-ip")
            or request.headers.get("x-real-ip")
            or (request.client.host if request.client else "?"))


def _limitar(ip):
    with _lock:
        agora = time.time()
        recentes = [t for t in _envios.get(ip, []) if t > agora - JANELA]
        if len(_envios) > 5000:
            _envios.clear()
        _envios[ip] = recentes
        if len(recentes) >= LIMITE:
            raise HTTPException(429, "Muitos envios. Aguarde um minuto e tente de novo.")
        recentes.append(agora)


def _guardar_foto(athlete_id, dados, formato):
    """Cloudinary quando configurado (e funcionando); senão a pasta local servida pelo servidor de mídia.

    Devolve os campos do perfil já apagando o da outra origem (um atleta tem photoUrl OU photoPath).
    """
    if cloud.configurado():
        try:
            res = cloudinary.uploader.upload(
                io.BytesIO(dados), resource_type="image", overwrite=True, invalidate=True, unique_filename=False,
                folder=f"{config.CLOUDINARY_FOLDER}/athletes/pending", public_id=athlete_id,
            )
            return {"photoUrl": res["secure_url"], "photoPath": fb.DELETE_FIELD}
        except Exception as exc:  # noqa: BLE001 - cai para a pasta local em vez de perder a foto
            fb.evento("cloudinary_erro", f"Foto de atleta não enviada ao Cloudinary, guardada localmente: {str(exc)[:200]}")
    FOTOS_LOCAIS.mkdir(parents=True, exist_ok=True)
    for antiga in FOTOS_LOCAIS.glob(f"{athlete_id}.*"):
        antiga.unlink(missing_ok=True)
    (FOTOS_LOCAIS / f"{athlete_id}.{formato}").write_bytes(dados)
    # ?v= muda a cada troca: o navegador não fica com a foto antiga em cache
    return {"photoPath": f"fotos/{athlete_id}.{formato}?v={int(time.time())}", "photoUrl": fb.DELETE_FIELD}


def _foto_institucional(athlete_id, matricula):
    """Busca a foto pela matrícula. Devolve (campos do perfil público, campos de athletePrivate).

    Nunca levanta erro: sem foto, o perfil fica sem os campos e o motivo vai em photoStatus.
    """
    if not institucional.configurada():
        return {}, {"photoStatus": "nao_configurada"}
    try:
        aluno = institucional.buscar_aluno(matricula)
    except institucional.AlunoNaoEncontrado:
        return {}, {"photoStatus": "nao_encontrada"}
    except institucional.SemFoto:
        return {}, {"photoStatus": "sem_foto"}
    except institucional.ErroInstitucional as exc:
        fb.evento("institucional_erro", f"Consulta ao site institucional falhou: {exc}")
        return {}, {"photoStatus": "erro"}
    foto = _guardar_foto(athlete_id, aluno["foto"], aluno["tipo"])
    return ({**foto, "photoSource": "institucional"},
            {"photoStatus": "ok", "institutionalName": aluno["nome"], "verifiedAt": fb.SERVER_TIMESTAMP})


def _ja_cadastrada(db, matricula, modalidade, ignorar=None):
    """A mesma matrícula não pode ter dois cadastros ativos na mesma modalidade."""
    consulta = (db.collection("athletePrivate").where(filter=FieldFilter("matricula", "==", matricula))
                .where(filter=FieldFilter("modalityCode", "==", modalidade)))
    for p in consulta.stream():
        if p.id == ignorar:
            continue
        atleta = db.collection("athletes").document(p.id).get()
        if atleta.exists and atleta.to_dict().get("status") != "rejected":
            return True
    return False


@router.get("/atletas/config")
def configuracao():
    """Mantido para versões antigas do site, que perguntavam aqui se a foto era por matrícula ou upload."""
    return {"origem": "institucional"}


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
    if _ja_cadastrada(db, corpo.matricula, corpo.modalityCode):
        raise HTTPException(409, "Esta matrícula já tem um cadastro nesta modalidade.")

    ref = db.collection("athletes").document()
    foto, privado = _foto_institucional(ref.id, corpo.matricula)
    foto = {k: v for k, v in foto.items() if v is not fb.DELETE_FIELD}  # documento novo: nada a apagar

    modalidade = modalidades[0].to_dict()
    t = turma.to_dict()
    lote = db.batch()
    lote.set(ref, {
        "name": corpo.name,
        "nickname": corpo.nickname or None,
        "birthDate": corpo.birthDate,
        "photoSource": None,
        **foto,
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
    lote.set(db.collection("athletePrivate").document(ref.id),
             {"matricula": corpo.matricula, "modalityCode": corpo.modalityCode, **privado})
    lote.commit()
    sem_foto = "" if foto else " (sem foto: confira no painel)"
    fb.evento("atleta", f"Novo cadastro de atleta aguardando aprovação: {corpo.name} ({corpo.modalityCode}){sem_foto}")
    # A resposta é a mesma com ou sem foto: o formulário público não revela quais matrículas existem
    return {"id": ref.id, "status": "pending"}


# ------------------------------------------------------------------ painel
def _atleta(db, athlete_id):
    if not ID_ATLETA.match(athlete_id):
        raise HTTPException(404, "Atleta não encontrado.")
    ref = db.collection("athletes").document(athlete_id)
    doc = ref.get()
    if not doc.exists:
        raise HTTPException(404, "Atleta não encontrado.")
    return ref, doc.to_dict()


def _salvar_foto_enviada(athlete_id, dados):
    formato = institucional.tipo_da_imagem(dados)
    if not formato:
        raise HTTPException(400, "A foto precisa ser uma imagem JPEG, PNG ou WebP.")
    db = fb.db()
    ref, atleta = _atleta(db, athlete_id)
    foto = _guardar_foto(athlete_id, dados, formato)
    lote = db.batch()
    lote.update(ref, {**foto, "photoSource": "admin"})
    lote.set(db.collection("athletePrivate").document(athlete_id),
             {"photoStatus": "ok", "modalityCode": atleta.get("modalityCode")}, merge=True)
    lote.commit()
    return {"photoSource": "admin"}


@router.put("/atletas/{athlete_id}/foto", dependencies=admin)
async def enviar_foto(athlete_id: str, request: Request):
    """Foto enviada pelo admin (corpo = a imagem), para quando a busca pela matrícula não trouxe foto."""
    try:
        tamanho = int(request.headers.get("content-length", "0"))
    except ValueError:
        tamanho = 0
    if tamanho > institucional.MAX_IMAGEM:
        raise HTTPException(413, "A foto precisa ter no máximo 5 MB.")
    dados = await request.body()
    if not dados or len(dados) > institucional.MAX_IMAGEM:
        raise HTTPException(413 if dados else 400, "Envie uma foto de até 5 MB.")
    return await run_in_threadpool(_salvar_foto_enviada, athlete_id, dados)


@router.put("/atletas/{athlete_id}/matricula", dependencies=admin)
def corrigir_matricula(athlete_id: str, corpo: Matricula):
    db = fb.db()
    _ref, atleta = _atleta(db, athlete_id)
    modalidade = atleta.get("modalityCode")
    if modalidade and _ja_cadastrada(db, corpo.matricula, modalidade, ignorar=athlete_id):
        raise HTTPException(409, "Esta matrícula já tem outro cadastro nesta modalidade.")
    privado = db.collection("athletePrivate").document(athlete_id)
    anterior = (privado.get().to_dict() or {}).get("matricula")
    mudancas = {"matricula": corpo.matricula, "modalityCode": modalidade}
    if anterior != corpo.matricula:
        # O nome conferido era o da matrícula anterior
        mudancas.update({"institutionalName": fb.DELETE_FIELD, "verifiedAt": fb.DELETE_FIELD})
    privado.set(mudancas, merge=True)
    return {"matricula": corpo.matricula}


@router.post("/atletas/{athlete_id}/foto/institucional", dependencies=admin)
def buscar_foto(athlete_id: str):
    """Tenta de novo a busca da foto pela matrícula guardada (a API estava fora, a matrícula foi corrigida…)."""
    db = fb.db()
    ref, _atleta_atual = _atleta(db, athlete_id)
    privado = db.collection("athletePrivate").document(athlete_id)
    matricula = (privado.get().to_dict() or {}).get("matricula")
    if not matricula:
        raise HTTPException(400, "Este atleta não tem matrícula. Informe a matrícula e salve antes de buscar a foto.")
    foto, resultado = _foto_institucional(athlete_id, matricula)
    if not foto:
        privado.set(resultado, merge=True)
        codigo = {"nao_encontrada": 404, "sem_foto": 422, "nao_configurada": 503}.get(resultado["photoStatus"], 502)
        raise HTTPException(codigo, SEM_FOTO[resultado["photoStatus"]])
    lote = db.batch()
    lote.update(ref, foto)
    lote.set(privado, resultado, merge=True)
    lote.commit()
    return {"photoStatus": "ok", "institutionalName": resultado.get("institutionalName")}
