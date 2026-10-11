# Domínio jiftv.org e Cloudflare

O domínio **jiftv.org** está na Cloudflare (servidores de nome `gabe` e `pola.ns.cloudflare.com`). Estado conferido
em **2026-10-07**.

## Quem fala com quem

| Parte | Onde roda | Endereço | Como chega |
|---|---|---|---|
| Site e painel (React) | Firebase Hosting | `https://jiftv.org` (e `www.jiftv.org`) | domínio personalizado do Firebase (já ligado, veja abaixo) |
| **Streaming**: HLS, DASH, miniaturas, fotos e gravações | servidor da escola, container `media` | `https://live.jiftv.org` | túnel `jiftv` → `http://media:80` |
| **Backend**: `/api/*` do worker (espectadores, cadastro de atletas) | servidor da escola, container `api` | `https://api.jiftv.org` | túnel `jiftv` → `http://media:80` → worker |
| Entrada do OBS (RTMP, porta 1935) | servidor da escola | `rtmp://<host>:1935/live` | **não passa pelo túnel HTTP** (veja abaixo) |

Por que o backend também entra pelo `media`: o nginx desse container já encaminha `/api/*` ao worker e é ele que
garante que os ganchos `/internal/*` (validação da chave do OBS, aviso de gravação) **nunca** fiquem expostos. No
nome `api.jiftv.org` o nginx só responde `/api/*` e `/healthz`; qualquer outro caminho dá 404. Em
`live.jiftv.org` o `/api/*` continua funcionando, por compatibilidade.

O site usa os dois nomes pelo `web/.env.production` (vale no `npm run build`):
`VITE_MEDIA_URL=https://live.jiftv.org` e `VITE_API_URL=https://api.jiftv.org`. Sem `VITE_API_URL`, o site chama
`/api/*` no próprio `VITE_MEDIA_URL`. O painel mostra os dois endereços em Painel → Sistema.

## Túnel da Cloudflare (`jiftv`)

Túnel já criado em 2026-05-26: nome `jiftv`, id `71a6d3dd-a49c-4bf9-a18d-93af41e7948b`. Os registros DNS
`live.jiftv.org` e `api.jiftv.org` são CNAME para ele (com proxy).

Como roda no projeto (container `tunnel`, perfil `tunel` do compose):

- Rotas: `cloudflared/config.yml` (no git, sem segredo).
- Credencial: `secrets/cloudflared-tunel.json` (fora do git). É a cópia de
  `%USERPROFILE%\.cloudflared\71a6d3dd-a49c-4bf9-a18d-93af41e7948b.json`, criada pelo `cloudflared tunnel create`.
  Em outro servidor, copie esse arquivo para `secrets/` com esse nome.
- Subir: `docker compose --profile tunel up -d` (o túnel só faz conexões de saída: nada a abrir no roteador).
- Conferir: `docker logs jiftv-tunnel` deve mostrar `Registered tunnel connection` (4 conexões).
- `CLOUDFLARE_TUNNEL_TOKEN` não é mais usado.

> **Importante: o painel da Cloudflare manda nas rotas.** Este túnel tem configuração remota (versão 3, feita no
> painel). Quando o túnel conecta, a Cloudflare envia essa configuração e ela **substitui** as rotas do
> `cloudflared/config.yml`. Para mudar uma rota: painel da Cloudflare → Tunnels → `jiftv` → aba
> **Published application routes** → editar (vale na hora, sem reiniciar o container). Mantenha o
> `cloudflared/config.yml` igual ao painel, como registro.
>
> Histórico: até 2026-10-07 o painel tinha as rotas de antes do Docker (`localhost:8080` e `localhost:3001`), que davam
> 502 dentro do container. Em 2026-10-07 o usuário trocou as duas para **HTTP `media:80`**.

Também existe um **serviço do Windows `cloudflared`** instalado nesta máquina (início automático). Ele roda sem
argumentos e não tem configuração na conta do sistema, então **não conecta** (o túnel aparecia sem conexões antes
do container). Se um dia ele conectar, vai disputar o túnel com o container; o ideal é desativá-lo
(`sc stop cloudflared` e `sc config cloudflared start= disabled`, como administrador) e usar só o container.

O worker usa o cabeçalho `CF-Connecting-IP` (IP real de quem acessa) para o limite de envios do cadastro
de atletas, então o acesso externo precisa passar pela Cloudflare. Quem alcançar o servidor direto pela rede da
escola pode falsificar esse cabeçalho; mantenha a porta 8080 fechada para fora da rede local.

## RTMP (OBS) e a Cloudflare

O túnel e o proxy da Cloudflare (planos gratuitos) carregam HTTP/HTTPS, **não** a porta RTMP 1935 que o OBS usa.
Opções:

- **OBS dentro da rede da escola**: use o IP do servidor na rede local (`rtmp://192.168.x.x:1935/live`).
- **OBS de fora**: libere a porta 1935 no roteador (encaminhamento para o servidor) e crie um registro DNS
  **sem proxy** ("nuvem cinza"), por exemplo `rtmp.jiftv.org`, apontando para o IP público da escola, com
  `VITE_RTMP_URL=rtmp://rtmp.jiftv.org:1935/live`. Esse nome só serve para o OBS; o espectador nunca o usa.

Ainda não decidido; por isso `web/.env.production` não define `VITE_RTMP_URL`.

## Firebase Hosting no jiftv.org

Em 2026-10-07, `https://jiftv.org` **já é servido pelo Firebase Hosting** (por trás do proxy da Cloudflare) e mostra
uma versão **antiga** do site (a do projeto de referência, publicada em 2026-05-26). `www.jiftv.org` não tem
registro DNS. O projeto Firebase dono desse site **não aparece** na conta logada no `firebase-tools` desta máquina
(yaurodzz@gmail.com), então o deploy precisa ser feito com a conta dona do projeto `jiftv-stream`
(`firebase logout` + `firebase login`), ou o domínio precisa ser movido para outro projeto.

Atualização 2026-10-07: o `firebase-tools` desta máquina agora está logado em **jiftv24@gmail.com**, dona do
`jiftv-stream` (app Web "JIFTv Web"). O primeiro deploy do site novo deu `auth/invalid-api-key` porque o build
foi feito sem `web/.env`. Corrigido: `web/.env` gerado com `firebase apps:sdkconfig WEB <appId> --project jiftv-stream`
e novo build. Todo build de produção precisa desse `web/.env`.

Atualização 2026-10-10: o worker passou a usar o Firebase real (`jiftv-stream`); `https://api.jiftv.org/api/saude`
responde. O site ainda **não** foi republicado (`jiftv.org` serve o build de 07/10) e o `firebase-tools` voltou a
estar logado em yaurodzz@gmail.com, que não tem acesso ao projeto: rode `firebase login --reauth` com
jiftv24@gmail.com antes do deploy.

Para publicar a versão nova:

1. `firebase login` com a conta dona do projeto; conferir com `firebase projects:list` que `jiftv-stream` aparece.
2. Habilitar Authentication (e-mail/senha) e criar o Firestore, e preencher `web/.env` com a config Web
   (`VITE_FIREBASE_*`).
3. Authentication → Settings → *Authorized domains*: `jiftv.org` (e `www.jiftv.org`, se for usar).
4. `cd web && npm run build && cd .. && firebase deploy --only hosting,firestore`. **Isso substitui o site antigo.**
5. (Opcional) `www.jiftv.org`: adicionar como domínio personalizado no Firebase e criar o registro pedido na
   Cloudflare, **sem proxy** durante a emissão do certificado.

## CORS

O worker só aceita chamadas do navegador vindas de `https://jiftv.org`, `https://www.jiftv.org`,
`https://<projeto>.web.app`, `https://<projeto>.firebaseapp.com` e `http://localhost:5173`
(variável `CORS_ORIGINS` para mudar). Nos emuladores qualquer origem é aceita. O nginx do `media` ainda
libera `Access-Control-Allow-Origin: *` para HLS/DASH/miniaturas/gravações (vídeo público).

## Testado (2026-10-07, pela internet)

- `https://live.jiftv.org/` → texto do servidor de mídia; `/healthz` → `ok`; `/api/saude` → `{"ok":true}`.
- `https://api.jiftv.org/api/saude` → `{"ok":true}`; `/hls/...` → 404 (vídeo só em `live.`).
- `/internal/publish` → 404 nos dois nomes (ganchos internos não expostos).
- O worker ainda estava nos **emuladores**, então o CORS respondeu `*`; com o Firebase real ele passa a aceitar só as
  origens de `CORS_ORIGINS`. Uma transmissão ao vivo pelo domínio ainda não foi testada.

## Pendente

- Testar uma transmissão (HLS/DASH) e uma gravação tocando por `https://live.jiftv.org`.
- Desativar o serviço do Windows `cloudflared` (opcional, evita conflito futuro).
- Deploy do site novo no Firebase Hosting com a conta dona do projeto (substitui o site antigo).
- Decidir como o OBS chega ao servidor fora da escola (IP público + `rtmp.jiftv.org` sem proxy, ou só rede local).
