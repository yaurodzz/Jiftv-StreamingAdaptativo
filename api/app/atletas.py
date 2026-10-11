"""Cadastro público de atletas (fila de moderação).

Duas origens para a foto (ATLETAS_PHOTO_SOURCE; padrão "institucional" quando INSTITUCIONAL_API_URL existe):

- institucional: a pessoa informa a matrícula escolar e o worker busca a foto na API do site
  institucional (app/institucional.py). A foto é guardada no Cloudinary (se configurado) ou na pasta
  local gravacoes/fotos/. A matrícula NÃO vai para o perfil público: fica em athletePrivate/{id}
  (só admin lê), junto com o nome devolvido pela API, para o admin conferir se bate com o cadastro.
- upload: a pessoa envia a foto direto ao Cloudinary (preset unsigned) e manda a URL aqui.

Em ambos: validação estrita, limite de envios por IP e o servidor SEMPRE grava status="pending",
submittedAt e submittedIp (nunca vêm do cliente). O perfil só aparece no site depois que um admin aprova.
"""

import io
import re
import threading
import time
from datetime import date

import cloudinary.uploader
from fastapi import APIRouter, HTTPException, Request
from google.cloud.firestore_v1.base_query import FieldFilter
from pydantic import BaseModel, ConfigDict, Field, field_validator

from . import cloud, config, fb, institucional

router = APIRouter(prefix="/api")

LIMITE = 10                   # envios por IP...
JANELA = 60                   # ...a cada minuto
LIMITE_NAO_ENCONTRADA = 5     # matrículas inexistentes por IP...
JANELA_NAO_ENCONTRADA = 600   # ...a cada 10 minutos (dificulta varrer matrículas)
_envios = {}                  # ip -> [instantes]
_falhas = {}                  # ip -> [instantes]
_lock = threading.Lock()

FOTOS_LOCAIS = config.RECORDINGS / "fotos"
FOTO = re.compile(r"^https://res\.cloudinary\.com/[^/]+/image/upload/.+")
EMAIL = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


class Cadastro(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)

    name: str = Field(min_length=2, max_length=60)
    nickname: str | None = Field(None, max_length=30)
    birthDate: str
    photoUrl: str | None = Field(None, max_length=500)   # só no modo "upload"
    matricula: str | None = Field(None, max_length=30)   # só no modo "institucional"
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
        if v and not FOTO.match(v):
            raise ValueError("a foto precisa ter sido enviada ao Cloudinary")
        return v or None

    @field_validator("matricula")
    @classmethod
    def _matricula(cls, v):
        if v and not institucional.matricula_valida(v):
            raise ValueError("use só letras e números (de 4 a 20 caracteres)")
        return v or None

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


def _recentes(tabela, ip, janela):
    agora = time.time()
    recentes = [t for t in tabela.get(ip, []) if t > agora - janela]
    tabela[ip] = recentes
    if len(tabela) > 5000:
        tabela.clear()
    return recentes


def _limitar(ip):
    with _lock:
        recentes = _recentes(_envios, ip, JANELA)
        if len(recentes) >= LIMITE:
            raise HTTPException(429, "Muitos envios. Aguarde um minuto e tente de novo.")
        recentes.append(time.time())


def _checar_buscas(ip):
    with _lock:
        if len(_recentes(_falhas, ip, JANELA_NAO_ENCONTRADA)) >= LIMITE_NAO_ENCONTRADA:
            raise HTTPException(429, "Muitas matrículas não encontradas. Aguarde alguns minutos e confira os números.")


def _registrar_falha(ip):
    with _lock:
        _recentes(_falhas, ip, JANELA_NAO_ENCONTRADA).append(time.time())


def _guardar_foto(athlete_id, dados, formato):
    """Cloudinary quando configurado (e funcionando); senão a pasta local servida pelo servidor de mídia."""
    if cloud.configurado():
        try:
            res = cloudinary.uploader.upload(
                io.BytesIO(dados), resource_type="image", overwrite=True, unique_filename=False,
                folder=f"{config.CLOUDINARY_FOLDER}/athletes/pending", public_id=athlete_id,
            )
            return {"photoUrl": res["secure_url"]}
        except Exception as exc:  # noqa: BLE001 - cai para a pasta local em vez de perder o cadastro
            fb.evento("cloudinary_erro", f"Foto de atleta não enviada ao Cloudinary, guardada localmente: {str(exc)[:200]}")
    FOTOS_LOCAIS.mkdir(parents=True, exist_ok=True)
    (FOTOS_LOCAIS / f"{athlete_id}.{formato}").write_bytes(dados)
    return {"photoPath": f"fotos/{athlete_id}.{formato}"}


def _ja_cadastrada(db, matricula, modalidade):
    """A mesma matrícula não pode ter dois cadastros ativos na mesma modalidade."""
    consulta = (db.collection("athletePrivate").where(filter=FieldFilter("matricula", "==", matricula))
                .where(filter=FieldFilter("modalityCode", "==", modalidade)))
    for p in consulta.stream():
        atleta = db.collection("athletes").document(p.id).get()
        if atleta.exists and atleta.to_dict().get("status") != "rejected":
            return True
    return False


@router.get("/atletas/config")
def configuracao():
    """Diz ao formulário do site como a foto é obtida (matrícula ou upload)."""
    return {"origem": config.ATLETAS_FOTO}


@router.post("/atletas", status_code=201)
def cadastrar(corpo: Cadastro, request: Request):
    ip = _ip(request)
    _limitar(ip)
    por_matricula = config.ATLETAS_FOTO == "institucional"
    if por_matricula:
        if not corpo.matricula:
            raise HTTPException(400, "Informe a matrícula do aluno.")
        _checar_buscas(ip)
    elif not corpo.photoUrl:
        raise HTTPException(400, "Envie a foto do atleta.")

    db = fb.db()
    modalidades = list(db.collection("modalities")
                       .where(filter=FieldFilter("code", "==", corpo.modalityCode)).limit(1).stream())
    if not modalidades:
        raise HTTPException(400, "Modalidade não encontrada.")
    turma = db.collection("classes").document(corpo.classId).get()
    if not turma.exists:
        raise HTTPException(400, "Turma não encontrada.")

    ref = db.collection("athletes").document()
    foto = {"photoUrl": corpo.photoUrl}
    privado = None

    if por_matricula:
        if _ja_cadastrada(db, corpo.matricula, corpo.modalityCode):
            raise HTTPException(409, "Esta matrícula já tem um cadastro nesta modalidade.")
        try:
            aluno = institucional.buscar_aluno(corpo.matricula)
        except institucional.AlunoNaoEncontrado:
            _registrar_falha(ip)
            raise HTTPException(404, "Matrícula não encontrada no cadastro da instituição.") from None
        except institucional.SemFoto:
            raise HTTPException(422, "A matrícula foi encontrada, mas o cadastro dela não tem foto. Procure a coordenação.") from None
        except institucional.ErroInstitucional as exc:
            fb.evento("institucional_erro", f"Consulta ao site institucional falhou: {exc}")
            raise HTTPException(502, "Não foi possível consultar o site da instituição agora. Tente de novo mais tarde.") from None
        foto = _guardar_foto(ref.id, aluno["foto"], aluno["tipo"])
        privado = {
            "matricula": corpo.matricula,
            "modalityCode": corpo.modalityCode,
            "institutionalName": aluno["nome"],     # para o admin conferir com o nome digitado
            "photoSource": "institucional",
            "verifiedAt": fb.SERVER_TIMESTAMP,
        }

    modalidade = modalidades[0].to_dict()
    t = turma.to_dict()
    lote = db.batch()
    lote.set(ref, {
        "name": corpo.name,
        "nickname": corpo.nickname or None,
        "birthDate": corpo.birthDate,
        **foto,
        "photoSource": "institucional" if por_matricula else "upload",
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
    if privado:
        lote.set(db.collection("athletePrivate").document(ref.id), privado)
    lote.commit()
    fb.evento("atleta", f"Novo cadastro de atleta aguardando aprovação: {corpo.name} ({corpo.modalityCode})")
    return {"id": ref.id, "status": "pending"}
