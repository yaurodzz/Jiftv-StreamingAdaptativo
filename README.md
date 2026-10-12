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
docs/cloudinary-preset.md        preset do Cloudinary (fotos de atletas por upload)
docs/armazenamento.md            onde as gravações ficam: pasta local, Google Drive, Cloudinary (aba Armazenamento)
docs/integracao-site-institucional.md   fotos dos atletas pela matrícula, na API do site do professor
docs/dominio-cloudflare.md       domínio jiftv.org, túnel da Cloudflare, Firebase Hosting, CORS
docs/obs-pela-internet.md        OBS em outro computador, de qualquer rede (ponte tools/obs-ponte.bat)
docs/camera-celular.md           transmitir a câmera do celular pelo navegador, de qualquer rede (4G)
tools/mock_institucional.py      API de mentira do site institucional (só desenvolvimento)
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
3. **Vídeo e backend por HTTPS** (túnel da Cloudflare `jiftv`, já criado). Subdomínios do **jiftv.org**:
   `live.jiftv.org` (streaming) e `api.jiftv.org` (`/api/*` do worker), os dois apontando para `http://media:80`
   (detalhes em [docs/dominio-cloudflare.md](docs/dominio-cloudflare.md)):
   - Credencial do túnel em `secrets/cloudflared-tunel.json` (cópia de `%USERPROFILE%\.cloudflared\<id>.json`);
     rotas em `cloudflared/config.yml`.
   - O túnel é **gerenciado pelo painel** da Cloudflare: em Zero Trust → Networks → Tunnels → `jiftv` →
     *Public hostname*, os dois nomes precisam apontar para `http://media:80`.
   - `docker compose --profile tunel up -d`
4. **Site** (`web/.env`, a partir de `web/.env.example`):
   - Configuração Web do Firebase (`VITE_FIREBASE_*`). Os endereços de produção (`VITE_MEDIA_URL=https://live.jiftv.org`,
     `VITE_API_URL=https://api.jiftv.org`) já estão em `web/.env.production`; defina também
     `VITE_RTMP_URL=rtmp://<IP ou domínio da escola>:1935/live`.
   - O site é publicado em `jiftv.org` (domínio personalizado do Firebase Hosting; veja
     [docs/dominio-cloudflare.md](docs/dominio-cloudflare.md)). O worker só aceita chamadas desse site
     (`CORS_ORIGINS`).
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
3. o worker cria o documento em `vods` (aparece no catálogo) e coloca o vídeo na fila dos destinos ligados em
   **Painel > Armazenamento**: Google Drive e/ou Cloudinary. Nessa aba cada destino (pasta local, Google Drive,
   Cloudinary) tem uma chave liga/desliga, e a pasta local pode ser trocada. Com a pasta local desligada, o vídeo
   é apagado do computador depois de confirmado na nuvem. Veja [docs/armazenamento.md](docs/armazenamento.md).

**Com a pasta local ligada (padrão), a cópia local nunca é apagada pelo envio.** Com ela desligada, a cópia só sai
do computador depois que o vídeo está confirmado na nuvem. Se o upload falhar (limite do plano gratuito do
Cloudinary de ~100 MB por vídeo, Drive sem espaço, falta de internet), o motivo aparece no painel, há novas
tentativas automáticas e o vídeo continua no computador. O catálogo toca o vídeo do Cloudinary quando ele existe,
senão do servidor local e, por último, do Google Drive (repassado pelo worker). Gravações ocultas no painel só abrem com o
token do admin, tanto no Firestore (regras) quanto no servidor de mídia (`auth_request`).

## Atletas e scout

- **Cadastro público** (`/atletas/novo`): qualquer pessoa envia o perfil de um atleta. Os dados vão para o
  worker (`POST /api/atletas`), que valida os campos, limita os envios por IP e grava sempre com
  `status: "pending"`. Como passa pelo servidor da escola, o formulário só funciona com ele ligado.
  O formulário **não envia foto**: pede a **matrícula escolar** (obrigatória) e o worker busca a foto na
  **API do site institucional** (feito pelo professor). A matrícula fica num documento privado
  (`athletePrivate`), nunca no perfil público. Se a busca não trouxer foto (API fora do ar ou não configurada,
  matrícula desconhecida, aluno sem foto), o cadastro entra sem foto e o admin resolve no painel.
  Guia, contrato assumido e perguntas para o professor: [docs/integracao-site-institucional.md](docs/integracao-site-institucional.md).
- **Moderação** (Painel → Atletas): aprovar, rejeitar com motivo (fica registrado) ou remover spam. O selo da
  aba mostra quantos cadastros esperam aprovação. O painel mostra a matrícula, avisa quando o nome digitado não
  bate com o do cadastro institucional e marca "Sem foto" com o motivo. Em **Editar** o admin corrige os dados
  e a matrícula, **envia ou troca a foto** (JPEG, PNG ou WebP, até 5 MB) e pode buscar de novo a foto pela matrícula.
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
