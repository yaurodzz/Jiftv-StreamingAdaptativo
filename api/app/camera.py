"""Câmera do celular pelo navegador: /api/camera/<id da transmissão> (WebSocket).

O RTMP (porta 1935) não passa pelo túnel HTTPS da Cloudflare, então um celular no 4G não alcança o
servidor como o OBS alcança. Aqui o caminho é outro: a página "Transmitir pelo celular" do painel
grava a câmera com o MediaRecorder do navegador e manda os pedaços por WebSocket (que passa pelo
túnel). O worker entrega esses pedaços a um FFmpeg, que publica no nginx-rtmp como se fosse o OBS.
Dali em diante nada muda: qualidades, HLS/DASH, gravação e status ao vivo.

Conversa:
  1. navegador -> {"token": <ID token de um admin>, "mime": <tipo do MediaRecorder>, "recodificar": bool}
  2. worker    -> {"ok": true, "video": "copy" | "x264"}   (ou {"erro": "..."} e fecha)
  3. navegador -> pedaços binários do MediaRecorder, até fechar
"""

import asyncio
import json

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from . import config, estado, fb

router = APIRouter(prefix="/api")

_no_ar = {}  # id da transmissão -> (tarefa que está recebendo o vídeo, evento "terminou")


def _comando(mime, recodificar, chave):
    """FFmpeg: lê WebM/MP4 da entrada padrão e publica em live/<chave> (o nginx valida a chave)."""
    # H.264 do celular segue como veio (sem gastar CPU do servidor); VP8/VP9 precisam virar H.264
    copiar = not recodificar and any(c in mime.lower() for c in ("avc1", "h264"))
    video = ["-c:v", "copy"] if copiar else [
        "-c:v", "libx264", "-preset", "veryfast", "-tune", "zerolatency", "-pix_fmt", "yuv420p",
        "-b:v", "3000k", "-maxrate", "3500k", "-bufsize", "6000k", "-g", "60"]
    return [
        "ffmpeg", "-nostdin", "-hide_banner", "-loglevel", "warning",
        "-fflags", "+genpts+discardcorrupt", "-i", "pipe:0",
        "-map", "0:v:0", "-map", "0:a:0?", *video,
        "-c:a", "aac", "-b:a", "128k", "-ar", "48000", "-ac", "2", "-af", "aresample=async=1",
        "-f", "flv", f"{config.RTMP_INTERNO}/{chave}",
    ], ("copy" if copiar else "x264")


async def _recusar(ws, motivo):
    await ws.send_json({"erro": motivo})
    await ws.close(code=4403)


async def _erros(processo, linhas):
    """Guarda as últimas linhas de erro do FFmpeg (aparecem no log do worker se ele cair)."""
    while linha := await processo.stderr.readline():
        linhas.append(linha.decode(errors="replace").rstrip())
        del linhas[:-15]


@router.websocket("/camera/{sid}")
async def camera(ws: WebSocket, sid: str):
    await ws.accept()
    try:
        ola = json.loads(await asyncio.wait_for(ws.receive_text(), timeout=10))
        token, mime = str(ola.get("token") or ""), str(ola.get("mime") or "")
    except (asyncio.TimeoutError, WebSocketDisconnect, KeyError, ValueError, AttributeError):
        await ws.close(code=4400)
        return

    if not token or not await asyncio.to_thread(fb.verificar_admin, token):
        return await _recusar(ws, "Entre de novo no painel: o acesso expirou ou não é de administrador.")
    s = estado.copia_streams().get(sid)
    chave = estado.chave_de.get(sid)
    if not s or not chave:
        return await _recusar(ws, "Transmissão não encontrada.")
    if not s.get("keyActive", True):
        return await _recusar(ws, "A chave desta transmissão está bloqueada. Libere no painel.")
    anterior = _no_ar.get(sid)
    if anterior:
        # O celular perdeu a rede e voltou antes de o worker notar: a conexão nova assume
        anterior[0].cancel()
        try:
            await asyncio.wait_for(anterior[1].wait(), timeout=12)
        except asyncio.TimeoutError:
            return await _recusar(ws, "A transmissão anterior ainda está encerrando. Tente de novo em instantes.")
    elif s.get("isLive"):
        return await _recusar(ws, "Esta transmissão já está no ar pelo OBS ou por outro aparelho.")

    comando, video = _comando(mime, bool(ola.get("recodificar")), chave)
    processo = await asyncio.create_subprocess_exec(
        *comando, stdin=asyncio.subprocess.PIPE, stdout=asyncio.subprocess.DEVNULL, stderr=asyncio.subprocess.PIPE)
    linhas = []
    erros = asyncio.create_task(_erros(processo, linhas))
    fim = asyncio.Event()
    _no_ar[sid] = (asyncio.current_task(), fim)
    titulo = s.get("title")
    print(f"[jiftv] câmera do celular conectada: {titulo} ({mime or 'tipo não informado'}, vídeo {video})", flush=True)
    await ws.send_json({"ok": True, "video": video})

    motivo = "celular desconectou"
    try:
        while True:
            # Sem pedaços por 20 s = celular sem rede ou com a página em segundo plano
            pedaco = await asyncio.wait_for(ws.receive_bytes(), timeout=20)
            if processo.returncode is not None:
                motivo = "o FFmpeg parou"
                break
            processo.stdin.write(pedaco)
            await processo.stdin.drain()
    except asyncio.TimeoutError:
        motivo = "20 s sem receber vídeo"
    except asyncio.CancelledError:
        motivo = "o celular reconectou"
    except (WebSocketDisconnect, RuntimeError, KeyError):
        pass
    except (BrokenPipeError, ConnectionResetError):
        motivo = "o FFmpeg parou"
    finally:
        try:
            processo.stdin.close()  # fim da entrada: o FFmpeg fecha o RTMP e o nginx finaliza a gravação
        except OSError:
            pass
        try:
            await asyncio.wait_for(processo.wait(), timeout=8)
        except asyncio.TimeoutError:
            processo.kill()
            await processo.wait()
        await erros
        print(f"[jiftv] câmera do celular encerrada: {titulo} ({motivo})", flush=True)
        if motivo == "o FFmpeg parou":
            print("[jiftv] FFmpeg da câmera:\n  " + "\n  ".join(linhas), flush=True)
        if _no_ar.get(sid, (None, None))[1] is fim:
            del _no_ar[sid]
        fim.set()
        try:
            await ws.send_json({"erro": "O servidor parou de receber o vídeo (" + motivo + ")."})
            await ws.close()
        except Exception:  # noqa: BLE001 - o celular já tinha ido embora
            pass
