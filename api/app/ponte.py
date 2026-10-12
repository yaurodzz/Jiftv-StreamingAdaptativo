"""OBS de qualquer rede: /api/rtmp (WebSocket) leva o RTMP por dentro do túnel HTTPS.

O túnel da Cloudflare não carrega a porta 1935, mas carrega WebSocket. No computador do OBS roda
`cloudflared access tcp --hostname https://api.jiftv.org/api/rtmp --url 127.0.0.1:1935`
(tools/obs-ponte.bat), que abre uma porta 1935 local e manda cada conexão para cá como WebSocket
binário. Aqui os bytes seguem, sem alteração, para a entrada RTMP do nginx na rede do Docker, e as
respostas voltam pelo mesmo caminho. Para o OBS é um servidor RTMP em rtmp://localhost:1935/live.

Não há login nesta rota, igual a uma porta 1935 aberta: quem protege a publicação é a chave da
transmissão (gancho on_publish), e o nginx não deixa ninguém de fora assistir pelo RTMP.
Detalhes: docs/obs-pela-internet.md
"""

import asyncio
from urllib.parse import urlsplit

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from . import config

router = APIRouter(prefix="/api")

MAX_CONEXOES = 20
_abertas = 0


@router.websocket("/rtmp")
async def rtmp(ws: WebSocket):
    global _abertas
    await ws.accept()
    if _abertas >= MAX_CONEXOES:
        await ws.close(code=1013)
        return
    destino = urlsplit(config.RTMP_INTERNO)
    try:
        leitor, escritor = await asyncio.wait_for(
            asyncio.open_connection(destino.hostname, destino.port or 1935), timeout=5)
    except (OSError, asyncio.TimeoutError):
        await ws.close(code=1011)  # servidor de mídia fora do ar
        return

    async def subir():  # OBS -> nginx
        while True:
            escritor.write(await ws.receive_bytes())
            await escritor.drain()

    async def descer():  # nginx -> OBS
        while dados := await leitor.read(65536):
            await ws.send_bytes(dados)

    _abertas += 1
    tarefas = [asyncio.create_task(subir()), asyncio.create_task(descer())]
    try:
        # Qualquer lado que feche (OBS parou, chave recusada, queda de rede) encerra o outro
        await asyncio.wait(tarefas, return_when=asyncio.FIRST_COMPLETED)
    finally:
        _abertas -= 1
        for tarefa in tarefas:
            tarefa.cancel()
        await asyncio.gather(*tarefas, return_exceptions=True)
        escritor.close()
        try:
            await ws.close()
        except (RuntimeError, WebSocketDisconnect, OSError):  # o OBS já tinha ido embora
            pass
