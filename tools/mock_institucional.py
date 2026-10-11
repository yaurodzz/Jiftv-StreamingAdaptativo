"""Imita a API do site institucional, só para desenvolvimento e testes (docker compose --profile dev).

Não é a API real: o contrato verdadeiro é o do site do professor (docs/integracao-site-institucional.md).
Este servidor existe para exercitar o JIFTv sem depender dela. Usa só a biblioteca padrão.

Rotas (exigem o cabeçalho  Authorization: Bearer mock-token):
  GET /alunos/<matrícula>/foto    -> a própria imagem (PNG)         [formato 1]
  GET /alunos/<matrícula>         -> JSON {"nome", "foto": <URL>}   [formato 2]
  GET /fotos/<matrícula>.png      -> a imagem (alvo da URL do JSON)

Matrículas de teste:
  20230001  Ana Souza         (com foto)
  20230002  Bruno Lima        (com foto)
  20230003  Carla Dias        (cadastro SEM foto)
  20230004  Diego Rocha       (a foto é um arquivo que NÃO é imagem)
  20230005  Eva Martins       (o JSON aponta a foto para OUTRO servidor: deve ser recusado)
  20230006  Fábio Nunes       (a foto redireciona para OUTRO servidor: deve ser recusado)
  qualquer outra -> 404
"""

import json
import re
import struct
import zlib
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

PORTA = 8090
TOKEN = "mock-token"
ALUNOS = {
    "20230001": ("Ana Souza", (47, 158, 65)),
    "20230002": ("Bruno Lima", (75, 141, 248)),
    "20230003": ("Carla Dias", None),
    "20230004": ("Diego Rocha", "invalida"),
    "20230005": ("Eva Martins", "outro-servidor"),
    "20230006": ("Fábio Nunes", "redireciona"),
}


def png(cor, largura=240, altura=300):
    """PNG liso com uma faixa mais clara, gerado sem bibliotecas externas."""
    r, g, b = cor
    linhas = []
    for y in range(altura):
        claro = 40 if y < altura // 5 else 0
        pixel = bytes((min(255, r + claro), min(255, g + claro), min(255, b + claro)))
        linhas.append(b"\x00" + pixel * largura)

    def pedaco(tipo, dados):
        corpo = tipo + dados
        return struct.pack(">I", len(dados)) + corpo + struct.pack(">I", zlib.crc32(corpo))

    return (b"\x89PNG\r\n\x1a\n"
            + pedaco(b"IHDR", struct.pack(">IIBBBBB", largura, altura, 8, 2, 0, 0, 0))
            + pedaco(b"IDAT", zlib.compress(b"".join(linhas)))
            + pedaco(b"IEND", b""))


class Manipulador(BaseHTTPRequestHandler):
    def _enviar(self, codigo, tipo, corpo):
        self.send_response(codigo)
        self.send_header("Content-Type", tipo)
        self.send_header("Content-Length", str(len(corpo)))
        self.end_headers()
        self.wfile.write(corpo)

    def _json(self, codigo, dados):
        self._enviar(codigo, "application/json", json.dumps(dados, ensure_ascii=False).encode())

    def do_GET(self):  # noqa: N802 - nome exigido pelo http.server
        caminho = self.path.split("?")[0]
        if self.headers.get("Authorization") != f"Bearer {TOKEN}":
            return self._json(401, {"erro": "token inválido"})

        if m := re.fullmatch(r"/alunos/([^/]+)/foto", caminho):
            aluno = ALUNOS.get(m.group(1))
            if not aluno or not isinstance(aluno[1], tuple):
                return self._json(404, {"erro": "aluno ou foto não encontrados"})
            return self._enviar(200, "image/png", png(aluno[1]))

        if m := re.fullmatch(r"/alunos/([^/]+)", caminho):
            aluno = ALUNOS.get(m.group(1))
            if not aluno:
                return self._json(404, {"erro": "aluno não encontrado"})
            nome, cor = aluno
            host = self.headers.get("Host", f"localhost:{PORTA}")
            foto = None if cor is None else f"http://{host}/fotos/{m.group(1)}.png"
            if cor == "outro-servidor":
                foto = "http://example.org/foto.png"
            return self._json(200, {"data": {"matricula": m.group(1), "nome": nome, "foto": foto}})

        if m := re.fullmatch(r"/fotos/([^/]+)\.png", caminho):
            aluno = ALUNOS.get(m.group(1))
            if not aluno or aluno[1] is None:
                return self._json(404, {"erro": "sem foto"})
            if aluno[1] == "redireciona":
                self.send_response(302)
                self.send_header("Location", "http://example.org/foto.png")
                self.end_headers()
                return
            if aluno[1] == "invalida":
                return self._enviar(200, "image/png", b"<html>isto nao e uma imagem</html>")
            return self._enviar(200, "image/png", png(aluno[1]))

        self._json(404, {"erro": "rota desconhecida"})

    def log_message(self, formato, *args):  # log curto
        print(f"[mock-institucional] {self.command} {self.path} -> {args[1] if len(args) > 1 else ''}", flush=True)


if __name__ == "__main__":
    print(f"[mock-institucional] ouvindo na porta {PORTA}", flush=True)
    ThreadingHTTPServer(("0.0.0.0", PORTA), Manipulador).serve_forever()
