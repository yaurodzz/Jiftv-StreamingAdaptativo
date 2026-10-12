# OBS de qualquer rede (4G, Wi-Fi de fora), pelo túnel

Criado em **2026-10-11**. Estado: código pronto e testado em containers de teste; **o servidor em uso ainda
precisa ser recriado** e o site republicado (veja "Para colocar no ar").

Para que serve: transmitir com o **OBS** (cenas, vários microfones, placar, vinhetas) a partir de um computador
que **não** é o servidor e pode estar em qualquer rede. A câmera do celular pelo navegador
([camera-celular.md](camera-celular.md)) continua existindo para o caso simples, de uma câmera só.

## Onde o OBS está decide o endereço

| Onde o OBS roda | Servidor no OBS | Precisa de ponte? |
|---|---|---|
| No próprio servidor (o PC com o Docker) | `rtmp://localhost:1935/live` | não |
| Outro computador, **mesma rede** do servidor | `rtmp://<IP do servidor na rede>:1935/live` | não (se a rede deixar um computador falar com o outro) |
| Outro computador, **qualquer rede** (4G, casa, Wi-Fi que isola os aparelhos) | `rtmp://localhost:1935/live` **com a ponte aberta** | sim |

A chave de transmissão é sempre a do painel (Transmissões → a transmissão → "Configurar o OBS").

## A ponte: RTMP por dentro do HTTPS

O túnel da Cloudflare não carrega a porta 1935, mas carrega WebSocket. A ponte usa isso:

```
 Computador do OBS                                        Servidor da escola (Docker)
 OBS ── RTMP ──▶ localhost:1935                            túnel → nginx (media) → worker (api)
                 cloudflared access tcp ── WebSocket ──▶   /api/rtmp ── bytes ──▶ media:1935 (nginx-rtmp)
                 (wss://api.jiftv.org/api/rtmp)
```

- No computador do OBS, o `cloudflared` (programa oficial da Cloudflare, o mesmo do túnel) abre a porta 1935
  local e manda cada conexão como WebSocket binário para `https://api.jiftv.org/api/rtmp`.
- No servidor, `api/app/ponte.py` copia os bytes, sem alterar, para a entrada RTMP do nginx
  (`RTMP_INTERNAL_URL`, padrão `rtmp://media:1935/live`) e devolve as respostas.
- Para o OBS e para o nginx é uma conexão RTMP comum: chave validada pelo `on_publish`, qualidades, HLS/DASH,
  gravação e status ao vivo, tudo igual.

Nada a mudar no painel da Cloudflare nem na rede do IFSC: é a mesma rota `api.jiftv.org` → `media:80`.

### Peças

| Onde | Arquivo | O que faz |
|---|---|---|
| Worker | `api/app/ponte.py` | WebSocket `/api/rtmp`: ponte de bytes para `media:1935` (até 20 conexões ao mesmo tempo) |
| Mídia | `server/nginx/nginx.conf` | `location = /api/rtmp` com os cabeçalhos de WebSocket (em `live.` e `api.`) |
| Computador do OBS | `tools/obs-ponte.bat` | Abre a ponte com o `cloudflared` e mostra o endereço para o OBS |
| Site | `web/src/features/admin/StreamConfigCard.jsx` | Passo a passo "OBS em outro computador (qualquer rede)" no cartão do OBS |

### Segurança

A rota `/api/rtmp` não pede login, do mesmo jeito que uma porta 1935 aberta não pediria. O que protege:

- **Publicar** exige a chave da transmissão (gancho `on_publish`); chave errada ou bloqueada é recusada e fica
  registrada em Painel → Sistema.
- **Assistir pelo RTMP** é negado pelo nginx a qualquer origem que não seja o próprio container
  (`allow play 127.0.0.1; deny play all`), e a aplicação `hls` só aceita publicação de `127.0.0.1`.
- A ponte só fala com `media:1935`; não serve para alcançar outros endereços da rede.

## Passo a passo no computador do OBS

1. Instalar o cloudflared, uma vez só (PowerShell): `winget install --id Cloudflare.cloudflared`
   (ou baixar o `.msi` em <https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/>).
2. Antes de transmitir, abrir a ponte e **deixar a janela aberta**: dois cliques em `tools/obs-ponte.bat`
   (copie o arquivo para o computador do OBS), ou o comando:
   `cloudflared access tcp --hostname https://api.jiftv.org/api/rtmp --url 127.0.0.1:1935`
3. No OBS: Configurações → Transmissão → Serviço **Personalizado**, Servidor `rtmp://localhost:1935/live`,
   Chave = a do painel.
4. Configurações → Saída: CBR, intervalo de quadro-chave **2 s**, áudio AAC. Bitrate de vídeo conforme a rede:

   | Rede do computador do OBS | Sugestão |
   |---|---|
   | 4G | 720p30, 2500 a 3500 kbps |
   | Wi-Fi ou cabo bons | 1080p30, 4500 a 6000 kbps |

5. Iniciar transmissão. O painel mostra "No ar" em alguns segundos.

Se a porta 1935 do computador do OBS já estiver em uso: `set JIFTV_PORTA=1936` antes do `.bat` e, no OBS,
`rtmp://localhost:1936/live`. No **próprio servidor** a ponte não é necessária (e a porta 1935 já é do Docker).

Queda de rede: a conexão cai e o OBS reconecta sozinho (Configurações → Avançado → Reconectar automaticamente);
a ponte continua aberta e aceita a conexão nova. Cada reconexão começa um arquivo de gravação novo.

## Celular como câmera do OBS

O celular vira uma fonte dentro do OBS, e o OBS é quem transmite:

| Situação | Como ligar o celular ao OBS |
|---|---|
| Celular perto do computador | Aplicativo de webcam por **USB ou Wi-Fi**: DroidCam (tem plugin para o OBS), Iriun ou Camo. Aparece como "Dispositivo de captura de vídeo" |
| Celular longe, em outra rede (4G) | **VDO.Ninja** (<https://vdo.ninja>): o celular abre um link no navegador e o OBS recebe por uma fonte "Navegador". Gratuito, sem instalar nada no celular |

Microfones entram no OBS como fontes de "Captura de entrada de áudio" (USB, mesa de som, lapela sem fio).

## Para colocar no ar

1. **Servidor** (derruba por alguns segundos a transmissão que estiver no ar):
   `docker compose --profile tunel up -d --build`
   Recria `media` (rota nova no nginx) e `api` (com a ponte).
2. **Site** (só para o passo a passo aparecer no painel; a ponte funciona sem isso):
   `cd web && npm run build && cd .. && firebase deploy --only hosting --project jiftv-stream`

## O que foi testado, e o que falta

Testado em 2026-10-11:

| Caso | Onde | Resultado |
|---|---|---|
| OBS simulado (FFmpeg, 1080p30, 5 Mbps CBR, 32 s) → porta local → WebSocket `/api/rtmp` pelo nginx → nginx-rtmp | containers de teste, emuladores | HLS mestre e 480p, DASH, miniatura; `isLive` verdadeiro com entrada 1920×1080 a 4,7 Mbps; gravação registrada; `isLive` falso ao parar |
| Chave errada pela ponte | containers de teste | publicação recusada e evento de segurança registrado |
| `cloudflared access tcp` com endereço de caminho (`https://api.jiftv.org/api/...`) | servidor real, pelo túnel | o cloudflared 2025.8.1 abre o WebSocket no caminho pedido e envia os bytes em quadros binários (conferido contra `/api/camera/...`, que recusou os bytes como esperado) |

**Não testado**: a ponte no servidor real (falta recriar os containers), o OBS de verdade e uma rede 4G. O
primeiro teste de campo deve conferir imagem e som no site e a reconexão ao cortar a internet por alguns segundos.

## Limites e alternativas

- O RTMP viaja dentro de um WebSocket sobre TCP: numa rede ruim o atraso cresce em vez de perder quadros. Se o
  OBS mostrar quadros perdidos por rede, baixe o bitrate.
- A Cloudflare pode encerrar um WebSocket longo de vez em quando (manutenção da borda); o OBS reconecta sozinho.
- Sem ponte, as outras formas de o OBS chegar de fora são as de [camera-celular.md](camera-celular.md)
  ("Alternativas"): Tailscale, porta 1935 aberta pela TI ou Cloudflare Spectrum (pago).
