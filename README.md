# JIFTv: Streaming Adaptativo nos Jogos Escolares

Plataforma de streaming adaptativo dos Jogos Interescolares do IFSC (artigo *JIFTv*, Computer on the Beach 2026).
Transmite ao vivo com qualidade ajustada à conexão de cada pessoa, grava cada partida inteira, publica um
catálogo por modalidade e mantém a vitrine de atletas com estatísticas de scout.

```
 OBS / DroidCam / Larix
        │ RTMP :1935 (só ingestão)
        ▼
┌──────────────── servidor da escola (Docker) ────────────────┐
│ media   nginx-rtmp + FFmpeg                                 │
│          ├─ 1080p/720p/480p/240p → HLS (.m3u8) + DASH (.mpd)│──HTTPS (túnel)──► espectadores
│          └─ record → MP4 inteiro em ./gravacoes/videos/     │
│ api     worker Python (Firebase Admin SDK)                  │
│          ├─ valida a chave do OBS, marca "ao vivo"          │
│          ├─ registra gravações no Firestore                 │──saída──► Firestore / Auth
│          ├─ envia ao Cloudinary (fila com novas tentativas) │──saída──► Cloudinary
│          ├─ recebe o cadastro público de atletas            │
│          └─ executa pedidos do painel (excluir, logs…)      │
└─────────────────────────────────────────────────────────────┘
┌──────────────── Firebase ───────────────────────────────────┐
│ Hosting   site React (web/): ao vivo, catálogo, atletas,    │
│           painel e scout                                    │
│ Auth      login do painel (e-mail/senha + claim admin)      │
│ Firestore modalities · streams · streamKeys · vods ·        │
│           athletes · classes · scoutEvents ·                │
│           system · events · commands                        │
└─────────────────────────────────────────────────────────────┘
```

O worker só faz conexões **de saída** (para o Firebase e o Cloudinary). O painel, hospedado na nuvem, conversa
com o servidor da escola pelo próprio Firestore. Só o vídeo (HLS/DASH/gravações) precisa ser publicado na
internet, e por HTTPS, porque o site no Firebase Hosting é HTTPS.

## Estrutura

```
firebase.json, .firebaserc       Hosting (web/dist), regras e índices do Firestore, emuladores
firestore.rules                  quem pode ler/escrever o quê (visitante, admin)
firestore.indexes.json           índices do catálogo, da vitrine de atletas e da linha do tempo do scout
docs/cloudinary-preset.md        preset do Cloudinary para as fotos dos atletas
docker-compose.yml               media, api, emulators (perfil dev), tunnel (perfil tunel)
server/                          container "media": nginx.conf + scripts de transcodificação e gravação
api/                             container "api": worker Python
emulators/                       Firebase Auth + Firestore locais para desenvolvimento
web/                             site React + Vite + Tailwind (design system "Tema IF")
```

Modelo de dados (campos principais):

| Coleção | Quem escreve | Conteúdo |
|---|---|---|
| `modalities` | painel | `name`, `code` (3 letras, usado no ID das gravações) |
| `streams` | painel + worker | `title`, `slug` (nome público no HLS/DASH), modalidade, local, equipes e placar, `scheduledFor`, `listed`, `keyActive`; o worker escreve `isLive`, `startedAt`, `viewers`, `input` (sinal do OBS) |
| `streamKeys` | painel | `streamKey` da transmissão (só admin lê) |
| `vods` | worker + painel | ID `AAAAMMDD-COD-HHMMSS`; `title`, `recordedAt`, `durationSec`, `localFile`, `visible`, `views`, `playbackUrl`/`thumbnailUrl` (Cloudinary), `cloudinary.status` |
| `athletes` | worker (cadastro) + painel (moderação) | perfil enviado pelo público; `status` `pending` → `approved`/`rejected`; o público só lê aprovados |
| `classes` | painel | turmas oferecidas no cadastro (`name`, `campus`) |
| `scoutEvents` | painel | evento de um atleta numa gravação: `matchId`, `athleteId`, `type`, `value`, `videoTime` |
| `modalities.scoutTypes` | painel | tipos de evento do scout de cada modalidade (`code`, `label`, `weight`) |
| `system/server` | worker | estado do servidor (disco, nginx, Cloudinary), a cada 20 s |
| `events` | worker | histórico exibido no painel |
| `commands` | painel → worker | pedidos que precisam do servidor local: `delete_vod`, `resync`, `logs` |

## Desenvolvimento (tudo local, com emuladores do Firebase)

Pré-requisitos: Docker Desktop e Node 20+.

```bash
cp .env.example .env                       # já vem apontando para os emuladores
docker compose --profile dev up -d --build # media + api + emuladores
docker compose exec api python -m app.cli admin admin@jiftv.local <uma-senha>
cd web && npm install && npm run dev       # http://localhost:5173
```

- Site: http://localhost:5173 · Painel: http://localhost:5173/admin
- Interface dos emuladores (dados, usuários): http://localhost:4000
- OBS: servidor `rtmp://localhost:1935/live`, chave = a chave mostrada na página da transmissão no painel

Os dados dos emuladores ficam no volume `jiftv-emuladores` (exportados ao parar o container).

## Produção (Firebase)

1. **Projeto Firebase** (o `.firebaserc` aponta para `jiftv-stream`; troque se for outro):
   - Authentication → Método de login → ative **E-mail/senha** e crie o usuário do painel.
   - Firestore Database → crie o banco (modo produção).
2. **Servidor da escola** (`.env` na raiz):
   - `FIREBASE_PROJECT_ID=jiftv-stream` e **apague** `FIRESTORE_EMULATOR_HOST` e `FIREBASE_AUTH_EMULATOR_HOST`.
   - Configurações do projeto → Contas de serviço → **Gerar nova chave privada** → salve como
     `secrets/firebase-service-account.json` (a pasta está no `.gitignore`).
   - `CLOUDINARY_URL` (opcional) e `docker compose up -d --build`.
   - Dê acesso ao painel: `docker compose exec api python -m app.cli admin seu@email` (depois saia e entre de novo).
3. **Vídeo por HTTPS** (túnel da Cloudflare, gratuito):
   - Cloudflare Zero Trust → Networks → Tunnels → criar túnel → copie o token para `CLOUDFLARE_TUNNEL_TOKEN` no `.env`.
   - Em *Public hostname*, aponte `midia.seudominio.org` para o serviço `http://media:80`.
   - `docker compose --profile tunel up -d`
4. **Site** (`web/.env`, a partir de `web/.env.example`):
   - Configuração Web do Firebase (`VITE_FIREBASE_*`), `VITE_MEDIA_URL=https://midia.seudominio.org`
     e `VITE_RTMP_URL=rtmp://<IP ou domínio da escola>:1935/live`.
   - Para o cadastro de atletas: `VITE_CLOUDINARY_CLOUD_NAME` e o preset `athletes_profile`
     ([docs/cloudinary-preset.md](docs/cloudinary-preset.md)).
   - Publicar: `cd web && npm run build && cd .. && firebase deploy --only hosting,firestore`
     (na primeira vez, `npm install -g firebase-tools` e `firebase login`).

> **OBS fora da rede da escola:** RTMP não passa pelo túnel HTTP. Para transmitir de fora, libere a porta 1935
> no roteador da escola (encaminhamento para o servidor).

### Vindo do sistema anterior (Node + Firestore)

As coleções `modalities`, `streams` e `vods` continuam com os mesmos nomes e campos. Ao conectar no projeto, o
worker corrige automaticamente os documentos antigos:

- move a `streamKey` de `streams` (legível por qualquer visitante) para `streamKeys` (só admin);
- cria o `slug` público das transmissões;
- marca as gravações antigas como `visible: true`, porque sem esse campo as regras novas as escondem.

`athletes`, `classes` e `scoutEvents` mantêm os mesmos campos e a mesma leitura pública. O backend Node não é
mais necessário: as escritas do painel passam pelas regras do Firestore (claim `admin`) e o cadastro público de
atletas passa pelo worker.

## Gravações

O nginx grava o sinal original do OBS durante toda a transmissão num único arquivo. Ao terminar:

1. o `.flv` vira `.mp4` sem recodificar (sem perda de qualidade, leva segundos);
2. o vídeo **inteiro** é salvo em `gravacoes/videos/<nome>/<nome>_AAAA-MM-DD_HH-MM-SS.mp4`, junto com a
   miniatura (`.jpg`) e os metadados (`.info.json`);
3. o worker cria o documento em `vods` (aparece no catálogo) e coloca o vídeo na fila do Cloudinary.

**A cópia local nunca é apagada pelo envio.** Se o upload falhar (limite do plano gratuito de ~100 MB por vídeo,
falta de internet, créditos), o motivo aparece no painel e há novas tentativas automáticas. O catálogo toca o
vídeo do Cloudinary quando ele existe e, senão, do servidor local. Gravações ocultas no painel só abrem com o
token do admin, tanto no Firestore (regras) quanto no servidor de mídia (`auth_request`).

## Atletas e scout

- **Cadastro público** (`/atletas/novo`): qualquer pessoa envia o perfil de um atleta. A foto vai direto do
  navegador para o Cloudinary (preset *unsigned* `athletes_profile`, ver [docs/cloudinary-preset.md](docs/cloudinary-preset.md))
  e os dados vão para o worker (`POST /api/atletas`). O worker valida os campos, limita a 10 envios por minuto
  por IP e grava sempre com `status: "pending"`. Como passa pelo servidor da escola, o formulário só funciona com
  ele ligado.
- **Moderação** (Painel → Atletas): aprovar, corrigir dados, rejeitar com motivo (fica registrado) ou remover
  spam. O selo da aba mostra quantos cadastros esperam aprovação.
- **Turmas** (Painel → Turmas): as opções do formulário de cadastro.
- **Tipos de scout** (Painel → Modalidades → Scout): o vocabulário de cada esporte (ex.: `gol`, `assistencia`,
  `falta`), com peso para futuras médias.
- **Scout** (Painel → Gravações → ícone de prancheta, ou `/scout/<id-da-gravação>`): escolha o atleta, toque o
  vídeo e clique no evento; o tempo do vídeo é registrado. Clicar no tempo na linha do tempo volta o vídeo àquele
  momento.
- **Vitrine** (`/atletas`) e **perfil** (`/atletas/<id>`): só atletas aprovados, com as estatísticas somadas a
  partir do scout e as últimas partidas.

## Qualidades (streaming adaptativo)

`QUALIDADES` no `.env`, no formato `altura:kbps` (ex.: `1080:5000 720:2800 480:1200 240:400`; para 4K acrescente
`2160:14000`). O FFmpeg codifica cada qualidade uma única vez e o muxer `tee` entrega os mesmos quadros ao HLS e
ao DASH. Na página ao vivo o espectador escolhe HLS ou DASH, fixa uma qualidade ou deixa no automático e acompanha
resolução, bitrate, banda estimada e buffer.

## Comandos úteis

```bash
docker compose logs -f api                              # worker (Firebase, gravações, Cloudinary)
docker compose exec api python -m app.cli listar        # usuários e quem é admin
docker compose exec api python -m app.cli remover-admin <email>
cd web && npm run build                                 # build de produção (web/dist)
```
