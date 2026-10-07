# JIFTv: contexto técnico do projeto

Documento para retomar o desenvolvimento em um chat novo sem perder contexto.
Estado descrito: **2026-10-06**. Para o passo a passo de uso, veja também o [README.md](../README.md).

> Dica para o novo chat: anexe este arquivo e o README, e diga qual item da seção
> "Próximos passos" quer atacar.

---

## 1. Objetivo

**JIFTv** (Streaming Adaptativo nos Jogos Escolares) é a plataforma de transmissão dos Jogos
Interescolares do **IFSC Câmpus Garopaba**. Base: artigo *JIFTv*, Computer on the Beach 2026
(PDF em `C:\Users\Pichau\Downloads\Streaming_Adaptativo_nos_Jogos_Escolares__COTB2026_ (6).pdf`).

O que a plataforma entrega:

1. **Transmissão ao vivo** a partir do OBS Studio (ou DroidCam/Larix) por RTMP, convertida em várias
   qualidades (1080p/720p/480p/240p) e entregue em **HLS e DASH**, para o espectador receber
   automaticamente a melhor qualidade que a conexão dele aguenta (streaming adaptativo).
2. **Gravação automática** de cada transmissão inteira, feita pelo módulo de gravação do próprio
   nginx-rtmp: um único MP4 por transmissão (não os segmentos do FFmpeg), salvo numa pasta local
   **e** enviado ao Cloudinary. A pasta local é o backup, porque o plano gratuito do Cloudinary
   limita o tamanho do vídeo (~100 MB).
3. **Catálogo** de gravações por modalidade, **vitrine de atletas** com cadastro público moderado e
   **scout** (marcação de eventos dos atletas sobre as gravações).
4. **Painel administrativo** para gerenciar transmissões (chave do OBS, placar, encerrar), gravações,
   atletas, turmas, modalidades e acompanhar o servidor.

Restrições do contexto: projeto de ensino/pesquisa/extensão (código legível, estudantes vão manter),
rede escolar com banda limitada, servidor atrás do roteador da escola, interface em português do Brasil.

Escolhas do usuário: **Firebase para autenticação, banco de dados e hospedagem**; front-end baseado
no projeto de referência `StreamingAdaptativo.zip` (React + Vite + Tailwind, "Tema IF").

---

## 2. Arquitetura

```
 OBS / DroidCam / Larix
        │ RTMP :1935 (só ingestão)
        ▼
┌──────────────── servidor da escola (Docker Compose) ────────────────┐
│ media  = nginx + libnginx-mod-rtmp + FFmpeg                         │
│   app "live":  on_publish → worker valida a chave e troca por slug  │
│                record all → .flv → MP4 inteiro + .jpg + .info.json  │
│                exec_push  → transcode.sh (FFmpeg, 1 codificação,    │──HTTP/HTTPS──► espectadores
│                             saídas via tee: HLS, DASH e miniatura)  │   (HLS/DASH/gravações/thumbs)
│   HTTP :80  público: /hls /dash /thumbs /arquivos /api /time        │
│   HTTP :8081 interno: /stat /control /internal                      │
│ api    = worker Python (FastAPI + firebase-admin)                   │
│   valida chave, marca ao vivo, registra gravações no Firestore,     │──saída──► Firestore / Auth
│   fila de envio ao Cloudinary, cadastro público de atletas,         │──saída──► Cloudinary
│   executa pedidos do painel, publica estado do servidor             │
└─────────────────────────────────────────────────────────────────────┘
┌──────────────────────────── Firebase ───────────────────────────────┐
│ Hosting    site React (web/dist)                                    │
│ Auth       e-mail/senha; painel exige custom claim { admin: true }  │
│ Firestore  dados e regras de segurança                              │
└─────────────────────────────────────────────────────────────────────┘
```

Ideias centrais (decisões tomadas e o porquê):

- **O worker só faz conexões de saída** (Firebase, Cloudinary). O painel, hospedado na nuvem, não
  alcança o servidor da escola; ele escreve pedidos na coleção `commands` e o worker responde no
  mesmo documento. Assim nada precisa ser exposto, exceto o vídeo.
- **O navegador nunca fala com a porta 1935.** O OBS publica por RTMP; o player só consome HLS/DASH.
- **Chave do OBS ≠ nome público.** A chave secreta (`streamKeys/{id}`, só admin lê) é trocada pelo
  `slug` público da transmissão no `on_publish` (resposta 302 com `Location: <slug>`). Por isso HLS,
  DASH e a pasta da gravação usam o slug, nunca a chave. Também é aceito `<slug>?key=<chave>`.
- **Firebase Hosting é HTTPS** ⇒ o vídeo (HLS/DASH/gravações) também precisa chegar por HTTPS
  (conteúdo misto é bloqueado). Previsto: túnel da Cloudflare (perfil `tunel` do compose).
  RTMP não passa pelo túnel HTTP.
- **A pasta de vídeos é a fonte da verdade das gravações.** O worker sincroniza
  `gravacoes/videos/` → coleção `vods` (varredura de 60 s + aviso do script ao terminar).
- **Cloudinary**: fila baseada no próprio Firestore (`vods.cloudinary.status`). O botão "Reenviar" só
  muda o status para `pending`. A cópia local **nunca** é apagada pelo envio.
- **Desenvolvimento 100% local** com os emuladores do Firebase (projeto `demo-jiftv`), sem credenciais.

---

## 3. Tecnologias

| Camada | Tecnologia |
|---|---|
| Ingestão/entrega | nginx 1.22 + libnginx-mod-rtmp 1.1.4 (Debian bookworm), FFmpeg (libx264, AAC, muxer `tee`) |
| Worker | Python 3.12, FastAPI + uvicorn, `firebase-admin` 6, `cloudinary` 1.x |
| Banco/Auth/Hosting | Firebase: Firestore, Authentication, Hosting; emuladores via `firebase-tools@13` + OpenJDK 17 (container) |
| Site | React 18, Vite 5, Tailwind 3 (`darkMode: 'class'`), react-router 6, `hls.js` 1.5, `dashjs` **4.7** (carregados por import dinâmico), `lucide-react`, Inter variável |
| Infra | Docker Compose; serviços `media`, `api`, `emulators` (perfil `dev`), `tunnel` (perfil `tunel`) |
| Mídia na nuvem | Cloudinary (vídeo das gravações; fotos de atletas com preset *unsigned*) |

Ambiente de desenvolvimento do usuário: Windows 11, Docker Desktop 28.5.1, Node 20.19, Python 3.13 local,
`firebase-tools` 14 local, sem Java local (os emuladores rodam no container). Shells: Git Bash e PowerShell.
Pasta do projeto: `C:\Users\Pichau\OneDrive\Área de Trabalho\Jiftv-Streaming-Adaptativo`.

---

## 4. Estrutura de pastas

```
Jiftv-Streaming-Adaptativo/
├── README.md                    uso, produção, comandos
├── docker-compose.yml           media, api, emulators (dev), tunnel (tunel)
├── .env / .env.example          configuração do servidor (nomes na seção 8)
├── firebase.json                Hosting (web/dist), Firestore, emuladores (portas)
├── .firebaserc                  default = jiftv-stream ; dev = demo-jiftv
├── firestore.rules              regras de segurança
├── firestore.indexes.json       índices compostos (vods, athletes, scoutEvents)
├── docs/
│   ├── cloudinary-preset.md     preset unsigned das fotos de atletas
│   └── CONTEXTO-DO-PROJETO.md   (este arquivo)
├── secrets/                     .gitkeep ; aqui vai firebase-service-account.json (produção)
├── gravacoes/                   montada em /recordings nos containers
│   ├── em_andamento/            .flv em gravação
│   ├── videos/<slug>/           <slug>_AAAA-MM-DD_HH-MM-SS.mp4 + .jpg + .info.json (+ .cloudinary.json)
│   └── logs/                    jiftv.log, transcode.log, remux.log
├── server/                      container "media"
│   ├── Dockerfile
│   ├── nginx/nginx.conf         rtmp{live,hls} + http{:80 público, :8081 interno}
│   └── scripts/
│       ├── entrypoint.sh        gera hls_variants.conf e jiftv.env; recupera .flv órfãos; backfill
│       ├── transcode.sh         FFmpeg: N qualidades → HLS (via app hls) + DASH + miniatura (5 s)
│       ├── on_record_done.sh    .flv → .mp4 (sem recodificar) + metadata.sh + avisa o worker
│       ├── metadata.sh          ffprobe → .info.json ; miniatura → .jpg
│       ├── backfill.sh          gera miniatura/metadados de vídeos antigos
│       └── common.sh            PATH, log(), avisar_api()
├── api/                         container "api" (worker)
│   ├── Dockerfile, requirements.txt
│   └── app/
│       ├── main.py              FastAPI, CORS, inicia as threads, handler de validação
│       ├── config.py            variáveis de ambiente
│       ├── fb.py                Firebase Admin (emulador ou conta de serviço), eventos, verificar_admin
│       ├── estado.py            cópia em memória de streams/streamKeys/vods (onSnapshot) + migração do legado
│       ├── live.py              espectadores, iniciar/encerrar, reconciliação a cada 10 s
│       ├── media.py             lê /stat do nginx-rtmp; derruba publicador (/control)
│       ├── recordings.py        pasta de vídeos → coleção vods ; excluir arquivos
│       ├── cloud.py             fila de envio ao Cloudinary ; excluir no Cloudinary
│       ├── comandos.py          coleção commands: delete_vod, resync, logs
│       ├── sistema.py           publica system/server a cada 20 s ; limpa events
│       ├── routes.py            /internal/* (nginx) e /api/saude, /api/audiencia, /api/arquivo-auth
│       ├── atletas.py           POST /api/atletas (cadastro público)
│       └── cli.py               python -m app.cli admin|remover-admin|listar
├── emulators/Dockerfile         Auth + Firestore locais (export em /dados/export)
├── web/                         site React
│   ├── package.json, vite.config.js, tailwind.config.js, index.html
│   ├── .env.example / .env.development (emuladores)   ← não existe web/.env (produção)
│   └── src/
│       ├── App.jsx, main.jsx, index.css (tokens do Tema IF)
│       ├── lib/        firebase, env, media (URLs HLS/DASH/arquivos), format, cloudinary, streamKey, uploadPhoto
│       ├── providers/  Theme, Auth (claim admin), LiveStatus
│       ├── services/   streams, vods, modalities, classes, athletes, scoutEvents, commands, system, publicApi
│       ├── player/     createPlayer (adapter hls.js/dash.js/nativo), loadHls, loadDash
│       ├── components/ layout/, routing/, ui/
│       ├── features/   live/, catalog/, athletes/, admin/
│       └── pages/      Live, Catalog, MatchPage, AthleteShowcase/Page/Submit, ScoutPage, AdminLogin,
│                       NotFound, admin/{AdminLayout,Dashboard,Streams,StreamDetail,Recordings,
│                       Athletes,Modalities,Classes,System}
└── .claude/launch.json          config "web" (npm --prefix web run dev, porta 5173)
```

---

## 5. Modelo de dados (Firestore) e regras

| Coleção | Quem escreve | Campos principais |
|---|---|---|
| `modalities` | painel | `name`, `code` (3 letras, único), `scoutTypes[{code,label,weight}]` |
| `classes` | painel | `name`, `campus` |
| `streams` | painel + worker | painel: `title`, `slug`, modalidade (`modalityId/Code/Name`), `location`, `teamA/B`, `scoreA/B`, `scheduledFor`, `listed`, `keyActive`, `description`. Worker: `isLive`, `startedAt`, `endedAt`, `viewers`, `peakViewers`, `input{width,height,fps,bitrate,codecs}`, `qualitiesActive/Total`, `clientId`, `origin` |
| `streamKeys/{streamId}` | painel | `streamKey` (20 chars Crockford base32). **Só admin lê** |
| `vods` | worker + painel | ID `AAAAMMDD-COD-HHMMSS`. `title`, `modality*`, `recordedAt`, `durationSec`, `width/height`, `bytes`, `localFile`, `localThumb`, `localAvailable`, `visible`, `views`, `playbackUrl`/`thumbnailUrl` (Cloudinary), `cloudinary{status,error,attempts,nextAttemptAt,publicId,secureUrl}`, `sourceStreamId`, `streamSlug`, `teamA/B`, `scoreA/B` |
| `athletes` | worker (cadastro) + painel | `name`, `nickname`, `birthDate`, `photoUrl`, `jerseyNumber`, `position`, `bio`, `modalityCode/Name`, `classId/Name/Campus`, `status` (`pending`/`approved`/`rejected`), `submittedAt/Ip/ByName/ByEmail`, `approvedAt/By`, `rejectedAt/By/Reason` |
| `scoutEvents` | painel | `matchId` (id do vod), `matchType`, `athleteId/Name`, `modalityCode`, `type`, `value`, `videoTime`, `note`, `createdAt/By` |
| `system/server` | worker | estado do servidor a cada 20 s: `lastSeen`, `media{...}`, `disk`, `recordings`, `cloudinary`, `qualities`, `viewers` |
| `events` | worker | histórico exibido no painel (`type`, `message`, `at`) |
| `commands` | painel → worker | `type` (`delete_vod`/`resync`/`logs`), `payload`, `status` (`pending`/`running`/`done`/`error`), `result`/`error` |

Resumo das regras (`firestore.rules`, função `isAdmin()` = claim `admin == true`):

- `modalities`, `classes`, `streams`: leitura pública; escrita só admin.
- `streamKeys`, `system`, `events`: só admin lê; `system`/`events` ninguém escreve (o worker usa o Admin SDK).
- `vods`: público lê só `visible == true` (a consulta precisa filtrar por `visible`); visitante pode somar
  exatamente +1 em `views`; criar/apagar só admin.
- `athletes`: público lê só `approved`; escrita só admin (cadastro público passa pelo worker).
- `scoutEvents`: leitura pública; escrita só admin.
- `commands`: admin cria (`status == 'pending'`, tipos permitidos); ninguém atualiza/apaga.
- Todo o resto: fechado.

Migração do sistema antigo (feita automaticamente pelo worker ao conectar): move `streamKey` de
`streams` (que era público) para `streamKeys`, cria `slug`, `keyActive`, `listed`, `createdAt`, e marca
`vods` antigos com `visible: true`.

---

## 6. Fluxos principais

**Transmitir**: painel → *Nova transmissão* (gera chave no navegador e grava em `streamKeys`) → no OBS:
servidor `rtmp://<host>:1935/live`, chave = a chave mostrada → nginx chama `/internal/publish` no worker →
worker valida (chave existe e `keyActive`), responde 302 com o slug e marca `isLive` → `transcode.sh`
inicia → HLS em `/hls/<slug>.m3u8`, DASH em `/dash/<slug>/manifest.mpd`, miniatura em `/thumbs/<slug>.jpg`.
A cada 10 s o worker reconcilia com `/stat` do nginx e publica resolução/bitrate/qualidades/espectadores.

**Encerrar**: no painel o botão só põe `keyActive: false`; o worker percebe na hora e derruba o OBS via
`/control/drop/publisher` (a chave fica bloqueada, senão o OBS reconecta sozinho). Parar no OBS também funciona.

**Gravar**: `record all` do nginx → `.flv` único → `on_record_done.sh` converte para MP4 (`-c copy`,
`+faststart`), gera `.jpg`/`.info.json`, avisa `/internal/gravacao` → worker cria `vods/<id>` (visível
conforme `GRAVACOES_PUBLICAS`) → fila do Cloudinary. O site toca do Cloudinary se existir, senão de `/arquivos/...`.
Gravações ocultas só abrem com `?token=<ID token de admin>` (nginx `auth_request` → `/api/arquivo-auth`).

**Excluir gravação / ler logs / reverificar pasta**: painel cria documento em `commands`; worker executa.

**Cadastro de atleta**: foto vai direto ao Cloudinary (preset unsigned `athletes_profile`) → dados vão para
`POST /api/atletas` do worker (validação, 10 envios/min por IP, grava sempre `pending`) → admin aprova em
Painel → Atletas → aparece na vitrine.

**Scout**: Painel → Gravações → ícone de prancheta (`/scout/<vodId>`) → escolher atleta, tocar o vídeo e
clicar no evento (grava `videoTime`). Tipos de evento por modalidade em Painel → Modalidades → Scout.

Rotas do site: `/live`, `/live/:slug`, `/catalogo`, `/partidas/:id`, `/atletas`, `/atletas/novo`,
`/atletas/:id`, `/admin/login`, `/admin` (visão geral), `/admin/{transmissoes,transmissoes/:id,gravacoes,
atletas,modalidades,turmas,sistema}`, `/scout/:vodId`. Rotas do worker: `/internal/{publish,publish_done,gravacao}`
(só rede interna), `/api/{saude,audiencia,arquivo-auth,atletas}`.

---

## 7. O que está implementado e VERIFICADO

Tudo abaixo foi executado nos **emuladores locais** com um FFmpeg simulando o OBS (1080p30 + áudio):

- Servidor de mídia: HLS e DASH com 4 qualidades tocando no navegador; MP4 inteiro por transmissão
  (40 s, 1080p, com áudio), miniatura e metadados; recuperação do `tr` quebrado em `on_record_done.sh`.
- Chaves: chave errada é recusada; chave bloqueada é recusada; troca chave → slug funcionando.
- Painel: login com claim `admin`; criar/editar transmissão; placar ao vivo; **Encerrar** (derrubou o OBS em
  segundos e a reconexão foi recusada; gravação completa foi para o catálogo); excluir gravação via worker
  (arquivo, pasta e documento removidos); ocultar gravação (403 sem token, 200 com token de admin);
  "Verificar pasta"; criar transmissão pelo formulário.
- Regras do Firestore: 12 + 11 testes como visitante anônimo, todos conforme o esperado.
- Migração do legado (chave movida para `streamKeys`, slug criado).
- Atletas/scout: validações do cadastro (idade, foto fora do Cloudinary, turma/modalidade inexistentes,
  `status` forçado ignorado, limite de 10/min → 429); moderação (aprovar, editar, rejeitar com motivo,
  remover); tipos de scout; 5 eventos marcados com tempo de vídeo; vitrine e perfil (visitante) somando
  Gol 2 / Assistência 1.
- Build de produção do site (`npm run build`) sem erros; layout mobile do painel antigo foi checado, o do
  site React ainda **não** foi revisado em 360 px.
- Persistência dos dados dos emuladores entre reinícios (corrigido o erro `EBUSY` exportando em `/dados/export`).

Dados de teste que existem hoje nos emuladores (volume `jiftv-emuladores`): modalidade Futsal (FUT), turma
3B-INFO, transmissões "Final do Futsal", "Legado Vôlei" e "Semifinal de Vôlei Feminino", atletas Ana Souza e
Bruno Lima (aprovados), 5 eventos de scout, 6 gravações (251 MB em `gravacoes/videos`). Login de teste:
`admin@jiftv.local`; **a senha está em `DEV_ADMIN_PASSWORD` no `.env`** (só vale nos emuladores).

---

## 8. Como rodar (desenvolvimento)

```bash
# 1) Subir tudo (Docker Desktop precisa estar aberto)
docker compose --profile dev up -d --build        # media + api + emuladores

# 2) Criar/atualizar o admin de teste nos emuladores
docker compose exec api python -m app.cli admin admin@jiftv.local <senha>

# 3) Site
cd web && npm install && npm run dev               # http://localhost:5173

# Simular o OBS (Git Bash: use MSYS_NO_PATHCONV=1 nos docker exec)
docker exec -d -u www-data jiftv-media bash -c "ffmpeg -nostdin -loglevel error -re \
  -f lavfi -i testsrc2=size=1920x1080:rate=30 -f lavfi -i sine=frequency=440:sample_rate=48000 -t 300 \
  -c:v libx264 -preset ultrafast -g 60 -b:v 4000k -c:a aac -b:a 128k -f flv rtmp://127.0.0.1:1935/live/<CHAVE>"
```

Portas: 1935 RTMP · 8080 mídia (HLS/DASH/arquivos/api) · 5173 site (dev) · 4000 UI dos emuladores ·
8085 Firestore · 9099 Auth · 4400 hub · 9150 websocket.

Variáveis do `.env` da raiz (só os nomes): `FIREBASE_PROJECT_ID`, `FIRESTORE_EMULATOR_HOST`,
`FIREBASE_AUTH_EMULATOR_HOST`, `CLOUDINARY_URL`, `CLOUDINARY_FOLDER`, `RETRY_INTERVAL_MIN`, `QUALIDADES`,
`AUDIO_BITRATE`, `X264_PRESET`, `GRAVACOES_PUBLICAS`, `RTMP_PORT`, `HTTP_PORT`, `RECORDINGS_DIR`, `TZ`,
`CLOUDFLARE_TUNNEL_TOKEN`, `DEV_ADMIN_EMAIL`, `DEV_ADMIN_PASSWORD`.
Variáveis do site (`web/.env.example`): `VITE_FIREBASE_*`, `VITE_MEDIA_URL`, `VITE_RTMP_URL`,
`VITE_CLOUDINARY_CLOUD_NAME`, `VITE_CLOUDINARY_UPLOAD_PRESET`; em dev vale `web/.env.development`
(`VITE_FIREBASE_USE_EMULATORS=true`).

---

## 9. O que NÃO foi testado / está pendente

Nada disto roda ainda em produção:

1. **Projeto Firebase real**: nunca houve `firebase login`, `firebase deploy`, chave de conta de serviço
   (`secrets/` está vazia) nem `web/.env` de produção. O `.firebaserc` aponta para `jiftv-stream` (mesmo
   projeto do zip de referência); é preciso habilitar Authentication (e-mail/senha) e criar o Firestore.
2. **Cloudinary com credenciais reais**: `cloud.py` (fila via Firestore) **nunca foi executado**, pois
   `CLOUDINARY_URL` está vazio. (O caminho de falha do script antigo foi validado com credenciais falsas, mas
   foi substituído.) O preset `athletes_profile` também nunca foi criado/testado; a tela de cadastro para no
   envio da foto com "Cloudinary não configurado".
3. **OBS real, DroidCam, Larix** e rede escolar real: só houve simulação com FFmpeg.
4. **HTTPS do vídeo / túnel da Cloudflare** e encaminhamento da porta 1935: não configurados.
5. **Autoplay do player** quando a aba está em segundo plano: o navegador pausa vídeo mudo em aba escondida;
   foi adicionado retomar em `visibilitychange`, mas não foi observado funcionando (o painel de teste estava
   oculto). Testar em aba visível.
6. **Responsivo do site React** (360–1920 px, TV), acessibilidade e lint: não revisados; não há ESLint nem
   testes automatizados no `web/` (o `claude.md` do zip citava `npm run lint`, que o `package.json` de
   referência também não tinha).
7. Docker Desktop estava **parado** na última verificação; os containers não estão rodando agora.

---

## 10. Riscos e problemas conhecidos (revisar antes de produção)

- **Dados pessoais públicos (LGPD, menores de idade)**: a regra `athletes` libera o documento inteiro de quem
  está `approved`, incluindo `submittedIp`, `submittedByEmail`, `submittedByName` e `birthDate` completa
  (herdado do projeto de referência). Sugestão: mover os campos privados para outro documento/coleção só admin
  e mostrar só a idade; incluir aviso/consentimento no formulário.
- **IP do OBS público**: o worker grava `origin` (endereço do OBS) e `clientId` em `streams`, que é de leitura
  pública. Mover para um documento só admin (ex.: `streamKeys/{id}` ou `system`).
- Contagem de espectadores (`POST /api/audiencia`) e `views` (+1 por visitante) não têm proteção contra
  abuso; CORS do worker é `*`; o limite do cadastro confia em `X-Real-IP`/`CF-Connecting-IP`, falsificáveis se
  alguém alcançar o servidor sem passar pelo túnel.
- `commands` e `events` crescem; `events` é podado (~hora em hora), `commands` não.
- Foto aprovada do atleta continua na pasta `pending` do Cloudinary (mover para `approved` não foi implementado,
  também não estava no projeto de referência).
- Scout só para gravações (não ao vivo). Se o container `media` cair no meio da transmissão, o `.flv` parcial é
  recuperado na inicialização; se o OBS reconectar, o jogo vira dois vídeos.
- Disco da máquina de desenvolvimento em **~99%** (≈6 GB livres de 476 GB). Cada hora em 1080p a 6 Mbps ≈ 2,7 GB.
- O projeto está dentro do **OneDrive**: `gravacoes/` sincroniza arquivos grandes (considere `RECORDINGS_DIR`
  em outro disco). **Não é repositório git** (sem versionamento): `git init` é recomendável.
- O `.env` foi sobrescrito uma vez sem leitura prévia (os containers ainda estavam com os valores padrão, então
  não se perdeu configuração conhecida).
- Resquícios no Docker: volume `jiftv-streaming-adaptativo_jiftv-dados` (SQLite da versão antiga, sem uso) e
  containers/volumes de projetos antigos (`adaptative-streaming-*`, `ifsc-streaming-advanced_*`, `jiftv-claude-1_*`).
- O `claude.md` do zip (regras de projeto: não reescrever init do Firebase, não mexer em nginx/Dockerfile/
  compose/regras sem justificar, edições cirúrgicas, Tema IF, textos em PT-BR, `dash.js`/`hls.js` sob demanda)
  **não foi copiado** para este projeto. O design system e o carregamento sob demanda foram seguidos, mas as
  regras de segurança, o nginx e o compose foram alterados de propósito na migração pedida pelo usuário.

---

## 11. Próximos passos sugeridos (ordem de prioridade)

1. **Ir para o Firebase real**: habilitar Auth e Firestore em `jiftv-stream`; baixar a chave de conta de serviço
   para `secrets/firebase-service-account.json`; ajustar `.env` (remover `*_EMULATOR_HOST`, `FIREBASE_PROJECT_ID`);
   `web/.env` com a config Web; `docker compose up -d`; criar o admin real
   (`python -m app.cli admin <email>`); `firebase deploy --only hosting,firestore`.
2. **Publicar o vídeo por HTTPS** (túnel Cloudflare ou domínio) e apontar `VITE_MEDIA_URL`; liberar a porta 1935
   no roteador para o OBS externo.
3. **Corrigir os vazamentos de privacidade** da seção 10 (campos privados de `athletes`, `origin` de `streams`).
4. **Testar Cloudinary de verdade**: `CLOUDINARY_URL`, um MP4 pequeno e um grande (limite de plano), falha e
   nova tentativa, "Reenviar"; criar o preset `athletes_profile` e testar o cadastro com foto real.
5. **Teste de campo**: OBS/DroidCam reais, variar a banda (throttling) para ver a troca de qualidade, medir
   latência e CPU do FFmpeg com 4 qualidades (e avaliar 2160p, citado no artigo).
6. Revisar **responsivo/TV/acessibilidade**, adicionar ESLint e alguns testes (regras do Firestore com o
   emulador; helpers de `lib/`; endpoints do worker).
7. `git init`, definir `RECORDINGS_DIR` fora do OneDrive, limpar volumes antigos do Docker, política de
   retenção/limpeza das gravações locais e monitoramento de disco (alerta).
8. Ideias de evolução (do artigo e da conversa): scout ao vivo, mover foto aprovada para a pasta `approved`,
   estatísticas por partida/atleta, métricas de desempenho do streaming para o artigo.

---

## 12. Armadilhas aprendidas (ambiente Windows + Docker)

- No **Git Bash**, caminhos como `/recordings/...` viram `C:/Program Files/Git/...`: use `MSYS_NO_PATHCONV=1`
  em `docker exec`/`docker cp`. Textos com acento em corpo JSON via `curl -d` chegam corrompidos: envie de arquivo
  (`--data-binary @arquivo`).
- Heredocs com aspas misturadas quebram o Bash: prefira salvar scripts Python/Node em arquivo e rodá-los.
- Scripts `.sh` precisam de fim de linha **LF** (`.gitattributes` e `sed -i 's/\r$//'` no Dockerfile cuidam disso).
- `tr -c 'A-Za-z0-9_.-\n'` falha ("range-endpoints reversed"): o `-` deve ficar no fim do conjunto.
- O emulador do Firebase apaga e recria a pasta de export: exportar no ponto de montagem do volume dá `EBUSY`.
- Rodar script Python em `/tmp` do container esconde o pacote `app`: use `PYTHONPATH=/opt/jiftv-api`.
- O cache em memória do worker (`estado.py`) pode estar defasado logo após uma escrita; por isso `recordings.py` e
  `cloud.py` guardam o que acabaram de processar (`_recentes`, `_processadas`) para não duplicar trabalho.
- Painel de pré-visualização oculto pausa vídeo e atrasa screenshots; teste de player só vale em aba visível.
