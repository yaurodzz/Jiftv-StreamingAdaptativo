"""Onde as gravações ficam guardadas: pasta local, Google Drive e Cloudinary.

O painel (Painel > Armazenamento) liga e desliga cada destino e escolhe a pasta local.
A configuração fica em <estado>/armazenamento.json, no volume compartilhado com o servidor
de mídia. Nesse mesmo volume fica o atalho "atual", que aponta para a pasta local escolhida:
o nginx grava em atual/em_andamento e entrega atual/videos, então trocar de pasta é só
trocar o atalho (nenhum container precisa ser reiniciado).

Pasta local desligada = a cópia do computador é apagada depois que o vídeo está confirmado
na nuvem (veja recordings.liberar_locais). Sem cópia confirmada na nuvem, nada é apagado.
"""

import copy
import json
import os
import re
import shutil
import threading
import traceback
from pathlib import Path

from . import config

ARQUIVO = config.ESTADO / "armazenamento.json"
PADRAO = {
    # path: None = pasta padrão (RECORDINGS_DIR); texto = pasta dentro de PASTAS_DO_PC
    "local": {"enabled": True, "path": None},
    "drive": {"enabled": False, "folderName": "JIFTv Gravações"},
    "cloudinary": {"enabled": True},
}
NOME_DE_PASTA = re.compile(r'^[^\\/:*?"<>|\x00-\x1f]{1,80}$')

_lock = threading.RLock()
_config = None
_movendo = {"ativo": False, "feitos": 0, "total": 0, "erro": None}


# ------------------------------------------------------------------ configuração
def _carregar():
    cfg = copy.deepcopy(PADRAO)
    try:
        salvo = json.loads(ARQUIVO.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return cfg
    for destino, campos in cfg.items():
        if isinstance(salvo.get(destino), dict):
            campos.update({k: v for k, v in salvo[destino].items() if k in campos})
    return cfg


def ler():
    global _config
    with _lock:
        if _config is None:
            _config = _carregar()
        return copy.deepcopy(_config)


def salvar(cfg):
    global _config
    with _lock:
        config.ESTADO.mkdir(parents=True, exist_ok=True)
        provisorio = ARQUIVO.with_suffix(".tmp")
        provisorio.write_text(json.dumps(cfg, indent=2, ensure_ascii=False), encoding="utf-8")
        os.replace(provisorio, ARQUIVO)
        _config = copy.deepcopy(cfg)


def local_ligado():
    return bool(ler()["local"]["enabled"])


def drive_ligado():
    return bool(ler()["drive"]["enabled"])


def cloudinary_ligado():
    return bool(ler()["cloudinary"]["enabled"])


# ------------------------------------------------------------------ pastas do computador
def resolver(rel):
    """Caminho (dentro do container) de uma pasta escolhida no painel. Nunca sai de PASTAS."""
    raiz = config.PASTAS.resolve()
    destino = (raiz / (rel or "")).resolve()
    if destino != raiz and raiz not in destino.parents:
        raise ValueError("Pasta fora da área liberada para o JIFTv.")
    return destino


def relativo(caminho):
    rel = caminho.resolve().relative_to(config.PASTAS.resolve()).as_posix()
    return "" if rel == "." else rel


def no_pc(path):
    """Como a pasta aparece no computador (só para mostrar no painel)."""
    if path is None:
        return config.RECORDINGS_NO_PC
    base = config.PASTAS_NO_PC.replace("\\", "/").rstrip("/")
    return f"{base}/{path}" if path else f"{base}/"


def base_de(path):
    return config.RECORDINGS if path is None else resolver(path)


def listar(rel):
    pasta = resolver(rel)
    if not pasta.is_dir():
        raise ValueError("Pasta não encontrada.")
    nomes = []
    try:
        for item in pasta.iterdir():
            if item.name.startswith((".", "$")):
                continue
            try:
                if item.is_dir():
                    nomes.append(item.name)
            except OSError:
                continue
    except OSError as exc:
        raise ValueError(f"Não foi possível abrir a pasta: {exc.strerror or exc}") from exc
    atual = relativo(pasta)
    return {
        "caminho": atual,
        "pai": None if not atual else relativo(pasta.parent),
        "pastas": sorted(nomes, key=str.lower)[:500],
        "noPc": no_pc(atual),
    }


def criar_pasta(rel, nome):
    nome = (nome or "").strip()
    if not NOME_DE_PASTA.match(nome) or nome in (".", "..") or nome.endswith((".", " ")):
        raise ValueError("Nome de pasta inválido.")
    nova = resolver(rel) / nome
    resolver(relativo(nova))
    try:
        nova.mkdir(exist_ok=True)
    except OSError as exc:
        raise ValueError(f"Não foi possível criar a pasta: {exc.strerror or exc}") from exc
    return relativo(nova)


def testar_escrita(pasta):
    teste = pasta / ".jiftv-teste"
    try:
        teste.write_bytes(b"ok")
        teste.unlink()
    except OSError as exc:
        raise ValueError(f"O JIFTv não consegue gravar nessa pasta: {exc.strerror or exc}") from exc


# ------------------------------------------------------------------ atalho "atual"
def _apontar(base):
    for sub in ("em_andamento", "videos"):
        (base / sub).mkdir(parents=True, exist_ok=True)
    provisorio = config.ESTADO / ".atual.novo"
    if provisorio.is_symlink() or provisorio.exists():
        provisorio.unlink()
    os.symlink(base, provisorio, target_is_directory=True)
    os.replace(provisorio, config.PASTA_ATUAL)  # troca atômica: o nginx nunca vê o atalho pela metade


def preparar():
    """Ao iniciar: garante que o atalho aponta para a pasta configurada."""
    config.ESTADO.mkdir(parents=True, exist_ok=True)
    path = ler()["local"]["path"]
    try:
        base = base_de(path)
        if path is not None and not base.is_dir():
            raise ValueError("pasta não encontrada")
    except ValueError as exc:
        print(f"[jiftv] pasta local '{no_pc(path)}' indisponível ({exc}); usando a pasta padrão", flush=True)
        base = config.RECORDINGS
    try:
        if not config.PASTA_ATUAL.is_symlink() or config.PASTA_ATUAL.resolve() != base.resolve():
            _apontar(base)
    except OSError as exc:
        print(f"[jiftv] não foi possível preparar a pasta local: {exc}", flush=True)
    print(f"[jiftv] pasta local das gravações: {no_pc(path)}", flush=True)


def gravando():
    """Há gravação em andamento na pasta atual? (o .flv só some quando vira MP4)"""
    try:
        return any(config.EM_ANDAMENTO.glob("*.flv"))
    except OSError:
        return False


def movendo():
    return _movendo["ativo"]


def estado_da_mudanca():
    return dict(_movendo)


def trocar_pasta(path, ao_terminar=None):
    """Passa a gravar na pasta nova e, em segundo plano, leva para lá os vídeos da antiga."""
    nova = base_de(path)
    antiga = config.PASTA_ATUAL.resolve()
    _apontar(nova)
    if antiga == nova.resolve():
        return
    _movendo.update(ativo=True, feitos=0, total=0, erro=None)
    threading.Thread(target=_mover, args=(antiga / "videos", nova / "videos", ao_terminar),
                     name="mudanca-de-pasta", daemon=True).start()


def _mover(origem, destino, ao_terminar):
    try:
        arquivos = [p for p in origem.rglob("*") if p.is_file()] if origem.is_dir() else []
        _movendo["total"] = len(arquivos)
        for p in arquivos:
            alvo = destino / p.relative_to(origem)
            # As duas pastas podem ser a mesma no computador (montada em dois lugares): nesse caso
            # o arquivo já "está" no destino e não pode ser apagado da origem.
            if not alvo.exists():
                alvo.parent.mkdir(parents=True, exist_ok=True)
                parcial = alvo.with_name(f".{alvo.name}.movendo")
                shutil.copy2(p, parcial)
                os.replace(parcial, alvo)
                p.unlink()
            _movendo["feitos"] += 1
        for pasta in sorted((d for d in origem.rglob("*") if d.is_dir()), reverse=True):
            try:
                pasta.rmdir()
            except OSError:
                pass
    except Exception as exc:  # noqa: BLE001 - o que não foi movido continua na pasta antiga
        traceback.print_exc()
        _movendo["erro"] = str(exc)[:300]
    finally:
        _movendo["ativo"] = False
        if ao_terminar:
            ao_terminar()
