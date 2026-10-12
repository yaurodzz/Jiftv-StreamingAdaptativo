# Câmera do celular pela internet (4G), sem depender de localhost

Criado em **2026-10-11**. Estado: **servidor no ar** (containers recriados em 2026-10-11, rota conferida pelo
túnel); site republicado pelo usuário, que transmitiu pelo celular em 2026-10-11 e relatou que "ficou boa".

## O problema

O OBS e o Larix enviam o vídeo por **RTMP, porta 1935**. O servidor (PC com Docker) fica dentro da rede do IFSC:

- `rtmp://localhost:1935/live` só vale para um programa rodando **no próprio servidor**.
- O túnel da Cloudflare (`live.jiftv.org`, `api.jiftv.org`) só carrega **HTTP/HTTPS e WebSocket**. RTMP não passa.
- Abrir a porta 1935 no roteador depende da TI do campus.

Então um celular no 4G não tem como alcançar a porta 1935.

## A solução adotada: transmitir pelo navegador do celular

O celular abre o painel em `https://jiftv.org`, entra em **Transmissões → (a transmissão) → Transmitir pelo
celular** e toca em **Começar a transmitir**. Não precisa de aplicativo, IP, porta nem chave.

```
 Celular (Chrome/Safari)                      Servidor da escola (Docker)
 câmera → MediaRecorder ── WebSocket (wss) ──▶ túnel Cloudflare → nginx (media) → worker (api)
          pedaços de 250 ms    api.jiftv.org                                        │ FFmpeg
                                                                                   ▼
                                              rtmp://media:1935/live/<chave>  (igual ao OBS)
                                              → qualidades, HLS/DASH, gravação, status ao vivo
```

O WebSocket sai do celular para a Cloudflare e chega ao servidor pelo túnel que já existe (conexão de saída):
**nada a liberar na rede do IFSC**.

### Peças

| Onde | Arquivo | O que faz |
|---|---|---|
| Site | `web/src/pages/admin/StreamCamera.jsx` | Tela `/admin/transmissoes/:id/camera` (prévia, qualidade, trocar câmera, começar/parar) |
| Site | `web/src/features/admin/useCameraBroadcast.js` | Abre a câmera, grava com `MediaRecorder` e envia por WebSocket; reconecta sozinho; mantém a tela acesa |
| Site | `web/src/features/admin/StreamConfigCard.jsx` | Botão "Transmitir pelo celular" no cartão "Configurar o OBS" |
| Worker | `api/app/camera.py` | WebSocket `/api/camera/<id da transmissão>`: confere o admin e entrega o vídeo a um FFmpeg |
| Worker | `api/Dockerfile`, `api/requirements.txt` | A imagem do worker passou a ter `ffmpeg` e a biblioteca `websockets` |
| Mídia | `server/nginx/nginx.conf` | `location ^~ /api/camera/` com os cabeçalhos de WebSocket (nos dois nomes: `live.` e `api.`) |

### Conversa do WebSocket

1. Navegador envia `{"token": <ID token do Firebase>, "mime": <tipo do MediaRecorder>, "recodificar": false}`.
   O token vai dentro da mensagem, não na URL.
2. Worker confere que o token é de um admin, que a transmissão existe, que a chave não está bloqueada e que ela
   não está no ar pelo OBS. Responde `{"ok": true, "video": "copy" | "x264"}` ou `{"erro": "..."}`.
3. Navegador envia os pedaços binários. O worker escreve cada um na entrada do FFmpeg, que publica em
   `rtmp://media:1935/live/<chave>` (variável `RTMP_INTERNAL_URL` para mudar). O gancho `on_publish` valida a
   chave e segue o fluxo normal.
4. Fechou o WebSocket (ou 20 s sem pedaços): o FFmpeg encerra, o nginx finaliza a gravação e o status volta a
   "fora do ar".

Vídeo: se o celular grava em **H.264** (`video/mp4;codecs=avc1…`, Chrome e Safari atuais), o worker só repassa
(`-c:v copy`), sem gastar processador. Se o navegador só oferece VP8/VP9 (WebM), ou se o operador marcar
**Modo compatível**, o worker recodifica para H.264 (libx264 `veryfast`, 3 Mbps). O áudio sempre vira AAC 128 kbps.

Queda de rede: o site tenta reconectar a cada 3 s, até 5 vezes seguidas. A conexão nova assume o lugar da
antiga. Cada reconexão começa um arquivo de gravação novo.

### Qualidades oferecidas na tela

| Opção | Resolução pedida | Bitrate | Consumo aproximado |
|---|---|---|---|
| 720p (padrão) | 1280×720, 30 fps | 2,5 Mbps | 1,2 GB por hora |
| 1080p | 1920×1080, 30 fps | 4,5 Mbps | 2,1 GB por hora |
| 480p | 854×480, 30 fps | 1,2 Mbps | 0,6 GB por hora |

## Como usar (operador)

1. No celular, abra `https://jiftv.org/admin/login` e entre.
2. Transmissões → abra (ou crie) a transmissão → **Transmitir pelo celular**.
3. Permita câmera e microfone. Deite o celular (o vídeo sai no formato da câmera; em pé fica uma faixa estreita).
4. Escolha a qualidade e toque em **Começar a transmitir**. "No site: No ar" aparece em alguns segundos.
5. Para encerrar: **Parar de transmitir**.

Cuidados: não trocar de aplicativo nem bloquear a tela (o navegador para a câmera); deixar o celular na tomada
ou com bateria; se aparecer o aviso de internet lenta, parar e escolher uma qualidade menor.

## Para colocar no ar

1. **Servidor**: **feito em 2026-10-11** com `docker compose --profile tunel up -d --build` (recria `media`,
   com a rota nova no nginx, e `api`, com FFmpeg; a imagem do worker passou de ~430 MB para ~1 GB). Conferido
   pela internet: `wss://api.jiftv.org/api/camera/<id>` e `wss://live.jiftv.org/api/camera/<id>` aceitam o
   WebSocket e recusam um token inválido com a mensagem do worker. Em outro servidor, repita o comando
   (ele derruba por alguns segundos a transmissão que estiver no ar).
2. **Site** (**feito pelo usuário em 2026-10-11**): `cd web && npm run build && cd .. && firebase deploy --only hosting` com a conta dona do projeto
   `jiftv-stream` (veja [dominio-cloudflare.md](dominio-cloudflare.md)). Sem isso a tela nova não existe em `jiftv.org`.
3. **Painel da Cloudflare**: nenhuma mudança. As rotas `live.` e `api.` já apontam para `media:80`, e WebSocket
   vem ligado por padrão (Network → WebSockets, na zona `jiftv.org`).

## O que foi testado, e o que falta

Testado em 2026-10-11 com containers de teste separados (imagens novas, emuladores do Firebase), enviando pelo
WebSocket **através do nginx** um vídeo gerado pelo FFmpeg em pedaços, como o navegador faz:

| Caso | Resultado |
|---|---|
| MP4 fragmentado H.264 + AAC (caminho `copy`) | playlist HLS mestre, playlist 480p com segmentos, manifesto DASH, miniatura; `isLive` verdadeiro; gravação registrada no acervo |
| WebM VP8 + Opus (caminho `x264`) | idem |
| Token inválido | recusado com mensagem, sem iniciar FFmpeg |
| Fechar o WebSocket | transmissão encerrada e `isLive` falso em menos de 8 s |

A passagem do WebSocket pelo túnel da Cloudflare foi conferida em 2026-10-11 (só a recusa de token, sem vídeo).

Em 2026-10-11 o usuário transmitiu de um celular real e relatou que a transmissão ficou boa (aparelho, navegador
e rede não foram informados).

**Não testado por mim**: Chrome no Android e Safari no iPhone separadamente, vídeo passando pelo túnel
e a rede 4G. A tela nova passou no `vite build`, mas não foi aberta em navegador com câmera. O primeiro teste de
campo deve conferir: imagem e som no site, o `Vídeo no servidor: Direto`, e a reconexão ao desligar e ligar os
dados móveis. Se a imagem chegar travada, marcar **Modo compatível**.

## Limites conhecidos

- O navegador controla o encoder: sem zoom óptico, foco manual ou estabilização como num aplicativo dedicado.
- A página precisa ficar aberta e em primeiro plano o tempo todo.
- iPhone: o Safari grava em MP4/H.264; não foi testado.
- No modo compatível o servidor codifica mais um vídeo 720p além da escada de qualidades.
- Só um aparelho por transmissão. Para duas câmeras, crie duas transmissões.

## Alternativas, se um dia precisar de aplicativo (Larix) ou OBS de fora

O túnel HTTP não leva RTMP, SRT nem o tráfego de mídia do WebRTC/WHIP (UDP). As opções reais são:

| Opção | Como | Contras |
|---|---|---|
| **Ponte do OBS** (desde 2026-10-11) | No computador do OBS, `cloudflared access tcp` leva o RTMP por WebSocket até `/api/rtmp`. Veja [obs-pela-internet.md](obs-pela-internet.md) | Só para computador (o celular não roda o cloudflared) |
| **Tailscale** (VPN gratuita) | Instalar no servidor e no celular com a mesma conta; no Larix usar `rtmp://<IP 100.x do servidor>:1935/live/<chave>` | Aplicativo a mais no celular, sempre ligado; a rede do IFSC pode forçar o tráfego por retransmissor (mais lento) |
| Porta 1935 aberta pela TI | Encaminhar 1935 para o servidor e criar `rtmp.jiftv.org` **sem proxy** apontando para o IP público | Depende da TI; expõe a porta à internet (a chave protege a publicação) |
| Cloudflare Spectrum | Proxy TCP da Cloudflare para a 1935 | Pago |
| OBS na rede da escola | `rtmp://<IP do servidor na rede>:1935/live` | Só dentro do campus |
