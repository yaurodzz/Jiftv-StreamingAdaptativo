# JIFTv: contexto técnico do projeto

Documento para retomar o desenvolvimento em um chat novo sem perder contexto.
Estado descrito: **2026-10-11** (inclui a integração com o site institucional, os subdomínios live/api.jiftv.org no túnel
e o armazenamento configurável das gravações: pasta local, Google Drive e Cloudinary). Para o passo a passo de uso, veja também o [README.md](../README.md).

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
   limita o tamanho do vídeo (~100 MB). Desde 2026-10-11 o destino é escolhido no painel (aba
   **Armazenamento**): pasta local, Google Drive e Cloudinary, cada um com liga/desliga, e a pasta local
   pode ser trocada pelo painel. Detalhes em [armazenamento.md](armazenamento.md).
3. **Catálogo** de gravações por modalidade, **vitrine de atletas** com cadastro público moderado e
   **scout** (marcação de eventos dos atletas sobre as gravações).
4. **Painel administrativo** para gerenciar transmissões (chave do OBS, placar, encerrar), gravações,
   atletas, turmas, modalidades e acompanhar o servidor.

Restrições do contexto: projeto de ensino/pesquisa/extensão (código legível, estudantes vão manter),
rede escolar com banda limitada, servidor atrás do roteador da escola, interface em português do Brasil.

Escolhas do usuário: **Firebase para autenticação, banco de dados e hospedagem**; front-end baseado
no projeto de referência `StreamingAdaptativo.zip` (React + Vite + Tailwind, "Tema IF").

Decisões mais recentes do usuário:

- **Fotos dos atletas vêm de uma API do site institucional** feito pelo professor, que já tem as fotos de todos
  os alunos. O JIFTv consulta essa API pela **matrícula escolar** (o worker faz a chamada). O contrato real da
  API ainda **não foi confirmado**: o JIFTv assume um formato configurável. Detalhes e perguntas para o
  professor em [integracao-site-institucional.md](integracao-site-institucional.md).
- **Gravações no Google Drive, sem ocupar o computador** (2026-10-11): o usuário tem ~400 GB livres no Drive
  e não quer pagar o Cloudinary. O worker envia cada gravação ao Drive, confere e (com a pasta local desligada)
  apaga a cópia do computador; o site toca o vídeo do Drive por meio do worker. Tudo é comandado pela aba
  Armazenamento do painel. Detalhes em [armazenamento.md](armazenamento.md).
- **Servidores no domínio `jiftv.org`** (Cloudflare): site em `jiftv.org` (Firebase Hosting), streaming em
  **`live.jiftv.org`** e backend (`/api/*` do worker) em **`api.jiftv.org`**, os dois pelo túnel `jiftv` da
  Cloudflare, que já existia. Detalhes e pendências em [dominio-cloudflare.md](dominio-cloudflare.md).

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
│             (live.jiftv.org; em api.jiftv.org só /api e /healthz)   │
│   HTTP :8081 interno: /stat /control /internal                      │
│ api    = worker Python (FastAPI + firebase-admin)                   │
│   valida chave, marca ao vivo, registra gravações no Firestore,     │──saída──► Firestore / Auth
│   fila de envio ao Cloudinary, cadastro público de atletas,         │──saída──► Cloudinary
│   fila de envio ao Google Drive e repasse do vídeo ao player,       │──saída──► Google Drive
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
  (conteúdo misto é bloqueado). Por isso o túnel da Cloudflare (perfil `tunel` do compose) publica o container
  `media` em `live.jiftv.org` (vídeo) e `api.jiftv.org` (só `/api/*`). O backend entra pelo nginx do `media`, que
  nunca expõe `/internal/*`. RTMP não passa pelo túnel HTTP (veja [dominio-cloudflare.md](dominio-cloudflare.md)).
- **Foto do atleta pela matrícula**: o cadastro público manda a matrícula ao worker, que consulta a API do
  site institucional (`api/app/institucional.py`), guarda uma cópia da foto (Cloudinary ou `gravacoes/fotos/`)
  e grava a matrícula só em `athletePrivate/{id}` (admin). Sem `INSTITUCIONAL_API_URL`, volta ao upload.
- **A pasta de vídeos é a fonte da verdade das gravações.** O worker sincroniza
  `gravacoes/videos/` → coleção `vods` (varredura de 60 s + aviso do script ao terminar).
- **Armazenamento configurável** ([armazenamento.md](armazenamento.md)): a configuração (chaves liga/desliga e pasta
  local) fica no volume `jiftv-estado`, não no Firestore; o painel a lê e grava pelo worker (`/api/armazenamento`,
  com ID token de admin). A pasta local escolhida é um atalho (`/var/jiftv/atual`) que o nginx segue, então trocar
  de pasta não reinicia nada. A "fonte da verdade" continua sendo a pasta atual, mas um vídeo pode existir só no
  Drive (`localAvailable: false` + `localRemovedAt`) quando a pasta local está desligada.
- **Google Drive**: fila igual à do Cloudinary (`vods.drive.status`), envio retomável conferido por MD5. O Drive não
  serve vídeo a player, então `GET /api/video/<id>` no worker busca e repassa (com `Range`).
- **Cloudinary**: fila baseada no próprio Firestore (`vods.cloudinary.status`). O botão "Reenviar" só
  muda o status para `pending`. A cópia local **nunca** é apagada pelo envio.
- **Túnel com configuração remota**: o túnel `jiftv` foi configurado pelo painel da Cloudflare, então as rotas do
  painel substituem as de `cloudflared/config.yml` quando ele conecta. Mude rotas no painel (ou migre de volta).
- **Desenvolvimento 100% local** com os emuladores do Firebase (projeto `demo-jiftv`), sem credenciais.

---

## 3. Tecnologias

| Camada | Tecnologia |
|---|---|
| Ingestão/entrega | nginx 1.22 + libnginx-mod-rtmp 1.1.4 (Debian bookworm), FFmpeg (libx264, AAC, muxer `tee`) |
| Worker | Python 3.12, FastAPI + uvicorn, `firebase-admin` 6, `cloudinary` 1.x, `requests` (API do Drive) |
| Banco/Auth/Hosting | Firebase: Firestore, Authentication, Hosting; emuladores via `firebase-tools@13` + OpenJDK 17 (container) |
| Site | React 18, Vite 5, Tailwind 3 (`darkMode: 'class'`), react-router 6, `hls.js` 1.5, `dashjs` **4.7** (carregados por import dinâmico), `lucide-react`, Inter variável |
| Infra | Docker Compose; serviços `media`, `api`, `emulators` (perfil `dev`), `tunnel` (perfil `tunel`) |
| Mídia na nuvem | Google Drive (gravações, OAuth da conta do usuário, escopo `drive.file`); Cloudinary (vídeo das gravações; fotos de atletas: cópia vinda do site institucional, ou upload com preset *unsigned*) |
| Integrações | API do site institucional (fotos pela matrícula); domínio `jiftv.org` na Cloudflare (túnel `jiftv`: `live.` e `api.jiftv.org`) |

Ambiente de desenvolvimento do usuário: Windows 11, Docker Desktop 28.5.1, Node 20.19, Python 3.13 local,
`firebase-tools` 14 local, sem Java local (os emuladores rodam no container). Shells: Git Bash e PowerShell.
Pasta do projeto: `C:\Users\Pichau\OneDrive\Área de Trabalho\Jiftv-Streaming-Adaptativo`.

---

## 4. Estrutura de pastas

```
Jiftv-Streaming-Adaptativo/
├── README.md                    uso, produção, comandos
├── docker-compose.yml           media, api, emulators + institucional-mock (dev), tunnel (tunel)
├── cloudflared/config.yml       rotas do túnel jiftv (live/api.jiftv.org → media:80); o painel da Cloudflare prevalece
├── .env / .env.example          configuração do servidor (nomes na seção 8)
├── firebase.json                Hosting (web/dist), Firestore, emuladores (portas)
├── .firebaserc                  default = jiftv-stream ; dev = demo-jiftv
├── firestore.rules              regras de segurança
├── firestore.indexes.json       índices compostos (vods, athletes, scoutEvents)
├── docs/
│   ├── cloudinary-preset.md     preset unsigned das fotos de atletas (modo upload)
│   ├── integracao-site-institucional.md   fotos pela matrícula: contrato assumido, segurança, perguntas,
│   │                                      kit zip para o professor (JIFTv-API-Fotos-Professor.zip)
│   ├── dominio-cloudflare.md    jiftv.org, túnel, RTMP, Firebase Hosting, CORS
│   ├── mobile.md                adaptação do site para celular (abaixo de 768px): diagnóstico e mudanças
│   ├── armazenamento.md         pasta local, Google Drive e Cloudinary: chaves do painel, pasta escolhida,
│   │                            como o vídeo do Drive toca, passo a passo do OAuth do Google
│   └── CONTEXTO-DO-PROJETO.md   (este arquivo)
├── tools/mock_institucional.py  API de mentira do site institucional (matrículas de teste)
├── secrets/                     .gitkeep ; firebase-service-account.json (produção), cloudflared-tunel.json (túnel),
│                                backups/ (cópia do Firestore antes da migração) e env-emuladores.bak (.env de dev)
├── gravacoes/                   montada em /recordings nos containers (pasta padrão; a pasta das gravações pode
│                                ser outra, escolhida no painel dentro de PASTAS_DO_PC, montada em /pc)
│   ├── fotos/                   fotos de atletas vindas do site institucional (sem Cloudinary); nginx /fotos/
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
│       ├── armazenamento.py     configuração dos destinos, pastas do computador, atalho da pasta local
│       ├── drive.py             Google Drive: OAuth, fila de envio, lixeira, leitura para o player
│       ├── rotas_armazenamento.py  /api/armazenamento, /api/drive/*, /api/video/<id>
│       ├── comandos.py          coleção commands: delete_vod (local, Cloudinary, lixeira do Drive), resync, logs
│       ├── sistema.py           publica system/server a cada 20 s ; limpa events
│       ├── routes.py            /internal/* (nginx) e /api/saude, /api/audiencia, /api/arquivo-auth
│       ├── atletas.py           GET /api/atletas/config e POST /api/atletas (cadastro público: matrícula ou upload)
│       ├── institucional.py     cliente da API do site institucional (foto pela matrícula; anti-SSRF)
│       └── cli.py               python -m app.cli admin|remover-admin|listar
├── emulators/Dockerfile         Auth + Firestore locais (export em /dados/export)
├── web/                         site React
│   ├── package.json, vite.config.js, tailwind.config.js, index.html
│   ├── .env.example / .env.development (emuladores) / .env.production (live/api.jiftv.org, no git)
│   │                            ← web/.env (fora do git): config Web do jiftv-stream (app "JIFTv Web")
│   └── src/
│       ├── App.jsx, main.jsx, index.css (tokens do Tema IF)
│       ├── lib/        firebase, env, media (URLs HLS/DASH/arquivos), format, cloudinary, streamKey, uploadPhoto
│       ├── providers/  Theme, Auth (claim admin), LiveStatus
│       ├── services/   streams, vods, modalities, classes, athletes, scoutEvents, commands, system, publicApi,
│       │               storage (aba Armazenamento: fala direto com o worker)
│       ├── player/     createPlayer (adapter hls.js/dash.js/nativo), loadHls, loadDash
│       ├── components/ layout/, routing/, ui/
│       ├── features/   live/, catalog/, athletes/, admin/
│       └── pages/      Live, Catalog, MatchPage, AthleteShowcase/Page/Submit, ScoutPage, AdminLogin,
│                       NotFound, admin/{AdminLayout,Dashboard,Streams,StreamDetail,Recordings,
│                       Storage,Athletes,Modalities,Classes,System}
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
| `vods` | worker + painel | ID `AAAAMMDD-COD-HHMMSS`. `title`, `modality*`, `recordedAt`, `durationSec`, `width/height`, `bytes`, `localFile`, `localThumb`, `localAvailable`, `visible`, `views`, `playbackUrl`/`thumbnailUrl` (Cloudinary), `cloudinary{status,error,attempts,nextAttemptAt,publicId,secureUrl}`, `drive{status,fileId,thumbId,infoId,webViewLink,bytes,md5,progress,error,attempts,nextAttemptAt}`, `localRemovedAt`, `sourceStreamId`, `streamSlug`, `teamA/B`, `scoreA/B` |
| `athletePrivate/{athleteId}` | worker | `matricula`, `modalityCode`, `institutionalName` (nome devolvido pela API), `photoSource`, `verifiedAt`. **Só admin lê/apaga** |
| `athletes` | worker (cadastro) + painel | `name`, `nickname`, `birthDate`, `photoUrl` (Cloudinary) **ou** `photoPath` (`fotos/<id>.<ext>`, servido pelo media), `photoSource` (`institucional`/`upload`), `jerseyNumber`, `position`, `bio`, `modalityCode/Name`, `classId/Name/Campus`, `status` (`pending`/`approved`/`rejected`), `submittedAt/Ip/ByName/ByEmail`, `approvedAt/By`, `rejectedAt/By/Reason` |
| `scoutEvents` | painel | `matchId` (id do vod), `matchType`, `athleteId/Name`, `modalityCode`, `type`, `value`, `videoTime`, `note`, `createdAt/By` |
| `system/server` | worker | estado do servidor a cada 20 s: `lastSeen`, `media{...}`, `disk`, `recordings`, `cloudinary`, `storage{local,drive,cloudinary}`, `institutional{configured,host,mode,lastAt,lastOk,lastError}`, `qualities`, `viewers` |
| `events` | worker | histórico exibido no painel (`type`, `message`, `at`) |
| `commands` | painel → worker | `type` (`delete_vod`/`resync`/`logs`), `payload`, `status` (`pending`/`running`/`done`/`error`), `result`/`error` |

Resumo das regras (`firestore.rules`, função `isAdmin()` = claim `admin == true`):

- `modalities`, `classes`, `streams`: leitura pública; escrita só admin.
- `streamKeys`, `system`, `events`: só admin lê; `system`/`events` ninguém escreve (o worker usa o Admin SDK).
- `vods`: público lê só `visible == true` (a consulta precisa filtrar por `visible`); visitante pode somar
  exatamente +1 em `views`; criar/apagar só admin.
- `athletes`: público lê só `approved`; escrita só admin (cadastro público passa pelo worker).
- `athletePrivate`: só admin lê e apaga; ninguém cria/atualiza pelo cliente (só o worker, via Admin SDK).
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
conforme `GRAVACOES_PUBLICAS`) → filas dos destinos ligados em Painel > Armazenamento (Google Drive, Cloudinary).
Com a pasta local desligada, o MP4 é apagado do computador depois de confirmado na nuvem. O site toca do Cloudinary
se existir, senão de `/arquivos/...`, senão do Drive por `/api/video/<id>` (worker). O `.flv` e o MP4 ficam na pasta
local escolhida no painel (`/var/jiftv/atual`, por padrão `gravacoes/`).
Gravações ocultas só abrem com `?token=<ID token de admin>` (nginx `auth_request` → `/api/arquivo-auth`).

**Excluir gravação / ler logs / reverificar pasta**: painel cria documento em `commands`; worker executa.

**Cadastro de atleta**: o formulário pergunta ao worker como obter a foto (`GET /api/atletas/config`).
Modo **institucional** (padrão com `INSTITUCIONAL_API_URL`): a pessoa informa a matrícula → `POST /api/atletas`
→ o worker valida, consulta a API do site institucional, guarda a foto (Cloudinary, ou `gravacoes/fotos/`) e
grava `athletes/{id}` (público após aprovar) + `athletePrivate/{id}` (matrícula) sempre como `pending`
(limites: 10 envios/min e 5 matrículas inexistentes/10 min por IP; 409 se a matrícula já tem cadastro ativo
na modalidade). Modo **upload**: foto direto ao Cloudinary (preset unsigned `athletes_profile`) e a URL vai no
`POST`. Em ambos o admin aprova em Painel → Atletas → aparece na vitrine.

**Scout**: Painel → Gravações → ícone de prancheta (`/scout/<vodId>`) → escolher atleta, tocar o vídeo e
clicar no evento (grava `videoTime`). Tipos de evento por modalidade em Painel → Modalidades → Scout.

Rotas do site: `/live`, `/live/:slug`, `/catalogo`, `/partidas/:id`, `/atletas`, `/atletas/novo`,
`/atletas/:id`, `/admin/login`, `/admin` (visão geral), `/admin/{transmissoes,transmissoes/:id,gravacoes,armazenamento,
atletas,modalidades,turmas,sistema}`, `/scout/:vodId`. Rotas do worker: `/internal/{publish,publish_done,gravacao}`
(só rede interna), `/api/{saude,audiencia,arquivo-auth,atletas}`, e as do armazenamento:
`/api/armazenamento`, `/api/armazenamento/pastas`, `/api/drive/{conectar,callback,desconectar}`, `/api/video/<id>`.

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
- Persistência dos dados dos emuladores entre reinícios (corrigido o erro `EBUSY` exportando em `/dados/export`;
  `stop_grace_period: 60s` no compose, porque com 10 s o Docker matava o emulador antes de exportar).
- **Foto pela matrícula (contra o mock)**: formato 1 (imagem direta) e formato 2 (JSON com URL); duplicada (409);
  matrícula inválida/inexistente; cadastro sem foto (422); arquivo que não é imagem; foto em outro servidor e
  redirecionamento para outro servidor (ambos barrados, nenhuma requisição saiu); token errado (aviso no painel);
  limite de 5 matrículas inexistentes por IP; foto servida em `/fotos/<id>.png`; `athletePrivate` negado a
  visitantes; formulário no modo matrícula pela interface; painel mostra a matrícula e "confere com o cadastro";
  aprovar e ver na vitrine; card "Site institucional" em Painel → Sistema.

- **Streaming adaptativo e travamentos (2026-10-11)**: conferido no container `media` que o HLS sai com as 4
  qualidades (playlist mestre com 1080p/720p/480p/240p, segmentos de 2 s alinhados entre elas, cada um começando
  em quadro-chave) e o DASH com 4 vídeos + áudio. A causa dos travamentos era o `-tune zerolatency` no
  `transcode.sh`: com 4 qualidades o FFmpeg codificava a 0,8x do tempo real (24 de 30 fps num sinal 1080p30,
  mesmo com 16 núcleos), o vídeo atrasava e o player ficava sem buffer. Sem ele (e com `-bf 0`) passa a 1,0x em
  tempo real, com folga de 2,5x. `-af aresample=async=1` acabou com o aviso `Packet duration: -8 ... out of range`
  do DASH (relógio do áudio vindo do RTMP). Os avisos `[flv] Failed to update header` aparecem no fim de toda
  transmissão e são inofensivos. Medido com uma gravação real reenviada em FLV para a aplicação `hls`
  (sem passar pelo worker); **falta confirmar com OBS/DroidCam ao vivo**. O script novo foi copiado para o
  container em execução (`docker cp`), então vale já na próxima transmissão, e entra na imagem no próximo build.

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
`AUDIO_BITRATE`, `X264_PRESET`, `GRAVACOES_PUBLICAS`, `RTMP_PORT`, `HTTP_PORT`, `RECORDINGS_DIR`, `PASTAS_DO_PC`, `TZ`,
`GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET`, `API_PUBLIC_URL` (Google Drive),
`DEV_ADMIN_EMAIL`, `DEV_ADMIN_PASSWORD`, e (fotos pela matrícula / CORS)
`INSTITUCIONAL_API_URL`, `INSTITUCIONAL_API_TOKEN`, `INSTITUCIONAL_API_HEADER`, `INSTITUCIONAL_API_PATH`,
`INSTITUCIONAL_API_PHOTO_FIELDS`, `INSTITUCIONAL_API_NAME_FIELDS`, `INSTITUCIONAL_PHOTO_HOSTS`,
`INSTITUCIONAL_API_TIMEOUT`, `ATLETAS_PHOTO_SOURCE`, `CORS_ORIGINS`. No `.env` de desenvolvimento, a API
institucional aponta para o mock (`http://institucional-mock:8090`, token `mock-token`).
Variáveis do site (`web/.env.example`): `VITE_FIREBASE_*`, `VITE_MEDIA_URL`, `VITE_API_URL` (vazio = `VITE_MEDIA_URL`), `VITE_RTMP_URL`,
`VITE_CLOUDINARY_CLOUD_NAME`, `VITE_CLOUDINARY_UPLOAD_PRESET`; em dev vale `web/.env.development`
(`VITE_FIREBASE_USE_EMULATORS=true`); no build vale `web/.env.production` (`VITE_MEDIA_URL=https://live.jiftv.org`,
`VITE_API_URL=https://api.jiftv.org`), que tem prioridade sobre o `web/.env`. O túnel não usa variável
(`CLOUDFLARE_TUNNEL_TOKEN` saiu): rotas em `cloudflared/config.yml`, credencial em `secrets/cloudflared-tunel.json`.

---

## 9. O que NÃO foi testado / está pendente

Nada disto roda ainda em produção:

1. **Projeto Firebase real** (`jiftv-stream`, conta jiftv24@gmail.com no `firebase-tools`): em 2026-10-07 o usuário
   fez o primeiro deploy do site novo; ele quebrou com `auth/invalid-api-key` (build sem `web/.env`). `web/.env` foi
   criado com a config do app Web "JIFTv Web" e o build refeito; **falta redeploy** e conferir Authentication
   (e-mail/senha), Firestore, *Authorized domains* (`jiftv.org`).
   **2026-10-10: o worker roda no Firebase real.** Chave da conta de serviço em
   `secrets/firebase-service-account.json` (`firebase-adminsdk-fbsvc@jiftv-stream`); `.env` com
   `FIREBASE_PROJECT_ID=jiftv-stream` e os `*_EMULATOR_HOST` comentados (o `.env` dos emuladores ficou em
   `secrets/env-emuladores.bak`); containers `emulators` e `institucional-mock` parados.
   - Antes de ligar: backup do Firestore em `secrets/backups/firestore-jiftv-stream-2026-10-10-antes-da-migracao.json`
     (havia 4 `modalities`, 3 `streams` com `streamKey` pública, 4 `vods` no Cloudinary; Auth com 1 usuário,
     rdztrinta@gmail.com, já com claim `admin`).
   - A migração automática rodou: `streamKey` saiu de `streams` e foi para `streamKeys` (3), `slug`/`keyActive`/
     `listed` criados, 4 `vods` com `visible: true`. Conferido sem login: `streamKeys` responde 403 e a consulta
     `vods where visible == true` devolve as 4 gravações, ou seja, as regras novas já estão publicadas.
     A migração dispara uma vez por snapshot até o documento assentar (10 eventos para 3 transmissões, slug
     regravado algumas vezes); inofensivo, mas `estado._migrar_stream` merece uma trava.
   - Para nada de teste ir a público: `gravacoes/videos` e `gravacoes/fotos` de desenvolvimento foram **movidas**
     para `gravacoes/_teste-emuladores/` (o nginx só serve `videos/` e `fotos/`), e `INSTITUCIONAL_API_*` (mock)
     foi comentado no `.env`. Sem a API real nem Cloudinary, o cadastro público de atletas cai no modo upload e
     **não funciona** até um dos dois ser configurado.
   - `/api/saude` responde por `http://localhost:8080` e por `https://api.jiftv.org`.
   - **Falta o redeploy do site**: `jiftv.org` ainda serve o build quebrado de 07/10 (`index-CENO5X3X.js`, sem a
     config do Firebase). O `firebase-tools` desta máquina voltou a estar logado em **yaurodzz@gmail.com**, sem
     acesso ao `jiftv-stream`: `firebase login --reauth` com jiftv24@gmail.com e depois
     `firebase deploy --only hosting,firestore`. Conferir também *Authorized domains* (`jiftv.org`).
2. **Cloudinary com credenciais reais**: `cloud.py` (fila via Firestore) **nunca foi executado**, pois
   `CLOUDINARY_URL` está vazio. (O caminho de falha do script antigo foi validado com credenciais falsas, mas
   foi substituído.) O envio da foto de atleta ao Cloudinary (`atletas.py`, modo matrícula) também nunca rodou:
   sem Cloudinary a foto vai para `gravacoes/fotos/`. O preset `athletes_profile` (modo upload) nunca foi criado.
   2b. **API real do site institucional**: o contrato não foi confirmado com o professor; tudo foi testado só
   contra `tools/mock_institucional.py`. É preciso URL, autenticação, endpoint, formato da resposta e autorização
   LGPD (perguntas em [integracao-site-institucional.md](integracao-site-institucional.md)). Em 2026-10-10 foi
   montado o kit `JIFTv-API-Fotos-Professor.zip` (contrato, OpenAPI, verificador `testar_api.py`, prompt para o
   Claude do professor e questionário); falta enviá-lo e receber as respostas.
   2c. **Subdomínios do jiftv.org**: `live.jiftv.org` (streaming) e `api.jiftv.org` (backend) são do túnel `jiftv`.
   **Funcionando pela internet desde 2026-10-07**: rotas no painel da Cloudflare trocadas para `http://media:80`
   (o painel prevalece sobre `cloudflared/config.yml`); `/healthz`, `/api/saude` e o bloqueio de `/internal` testados.
   Falta testar uma transmissão e uma gravação pelo domínio. `jiftv.org` já está no
   Firebase Hosting com o site **antigo**, num projeto fora da conta logada no `firebase-tools` desta máquina.
   2d. **Armazenamento configurável / Google Drive** (2026-10-11): código pronto e testado em ambiente isolado
   (emuladores + Drive de mentira, 63 verificações; tela conferida no navegador), mas **não está no ar**: os
   containers de produção ainda rodam a versão anterior. Falta `docker compose --profile tunel up -d --build`,
   criar o cliente OAuth no Google Cloud, preencher `GOOGLE_OAUTH_CLIENT_ID/SECRET`, conectar a conta pelo painel
   e publicar o site. Nunca rodou contra o Google Drive real nem com uma transmissão RTMP real gravando pelo
   atalho da pasta. Passo a passo e lista do que foi/não foi testado em [armazenamento.md](armazenamento.md).
3. **OBS real, DroidCam, Larix** e rede escolar real: só houve simulação com FFmpeg.
4. **HTTPS do vídeo / túnel da Cloudflare**: funcionando (item 2c), sem transmissão real testada. Encaminhamento
   da porta 1935 (OBS de fora da escola): não configurado.
5. **Autoplay do player** quando a aba está em segundo plano: o navegador pausa vídeo mudo em aba escondida;
   foi adicionado retomar em `visibilitychange`, mas não foi observado funcionando (o painel de teste estava
   oculto). Testar em aba visível.
6. **Responsivo do site React** (360–1920 px, TV), acessibilidade e lint: não revisados; não há ESLint nem
   testes automatizados no `web/` (o `claude.md` do zip citava `npm run lint`, que o `package.json` de
   referência também não tinha).
7. O Docker Desktop precisa estar aberto para rodar os containers (nesta sessão foi iniciado para os testes).

---

## 10. Riscos e problemas conhecidos (revisar antes de produção)

- **Dados pessoais públicos (LGPD, menores de idade)**: a regra `athletes` libera o documento inteiro de quem
  está `approved`, incluindo `submittedIp`, `submittedByEmail`, `submittedByName` e `birthDate` completa
  (herdado do projeto de referência). **A matrícula já foi tirada daí** (vai para `athletePrivate`); falta
  fazer o mesmo com esses campos e mostrar só a idade; incluir aviso/consentimento no formulário. A foto de
  aluno no site público exige autorização da instituição.
- **Enumeração de matrículas**: "matrícula não encontrada" revela, devagar (5 erros/10 min por IP), quais
  matrículas existem. Alternativa: restringir o cadastro a quem está logado ou mover para o painel.
- Fotos de atletas excluídos no painel **não** são apagadas do Cloudinary nem de `gravacoes/fotos/`; a foto
  de atleta pendente/rejeitado fica acessível a quem souber a URL (nome = id aleatório do atleta).
- **IP do OBS público**: o worker grava `origin` (endereço do OBS) e `clientId` em `streams`, que é de leitura
  pública. Mover para um documento só admin (ex.: `streamKeys/{id}` ou `system`).
- Contagem de espectadores (`POST /api/audiencia`) e `views` (+1 por visitante) não têm proteção contra
  abuso. O CORS do worker agora é restrito (`CORS_ORIGINS`: jiftv.org, www, domínios do Firebase, localhost;
  `*` só nos emuladores), mas o limite do cadastro confia em `CF-Connecting-IP`/`X-Real-IP`, falsificáveis se
  alguém alcançar o servidor sem passar pelo túnel (mantenha a porta 8080 fechada para fora da rede local).
- `commands` e `events` crescem; `events` é podado (~hora em hora), `commands` não.
- Foto aprovada do atleta continua na pasta `pending` do Cloudinary (mover para `approved` não foi implementado,
  também não estava no projeto de referência).
- Scout só para gravações (não ao vivo). Se o container `media` cair no meio da transmissão, o `.flv` parcial é
  recuperado na inicialização; se o OBS reconectar, o jogo vira dois vídeos.
- Disco da máquina de desenvolvimento **quase cheio** (2026-10-07: chegou a 0 bytes livres e o build falhou com
  `ENOSPC`; apagar o cache do npm liberou ≈5,7 GB) (2,1 GB livres de 476 GB em 2026-10-07; eram ≈6 GB no
  dia anterior). Cada hora em 1080p a 6 Mbps ≈ 2,7 GB.
- O projeto está dentro do **OneDrive**: `gravacoes/` sincroniza arquivos grandes (considere `RECORDINGS_DIR`
  em outro disco). O projeto **é um repositório git** (branch `master`, 1º commit `56fa730`, sem remoto; o push
  para `github.com/yaurodzz/...` falhou porque o repositório ainda não foi criado). As mudanças desta
  atualização (integração institucional, domínio, CORS) **ainda não foram commitadas**.
- **Vídeos só no Drive dependem do servidor ligado**: com a pasta local desligada, o player recebe o vídeo pelo
  worker (`/api/video/<id>`), usando a internet da escola nos dois sentidos. A autorização do Drive (`drive.json`)
  e a configuração ficam no volume `jiftv-estado`: `docker compose down -v` apaga os dois (os vídeos continuam no
  Drive, mas é preciso reconectar a conta). `PASTAS_DO_PC` define o que o painel pode navegar no computador; um
  valor amplo (disco inteiro) deixa um admin do painel listar nomes de pastas e criar pastas nesse disco.
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

1. **Terminar a ida para o Firebase real** (worker já ligado em 2026-10-10, item 9.1): falta só
   `firebase login --reauth` (jiftv24@gmail.com) + `firebase deploy --only hosting,firestore` e testar o login do
   painel em `jiftv.org` (admin: rdztrinta@gmail.com).
2. **Terminar o domínio** ([dominio-cloudflare.md](dominio-cloudflare.md)): testar uma transmissão e uma gravação
   por `https://live.jiftv.org`; desativar o serviço do Windows `cloudflared`; deploy com a conta dona do projeto
   Firebase (substitui o site antigo em `jiftv.org`); decidir como o OBS chega de fora (`rtmp.jiftv.org` sem proxy +
   porta 1935, ou só rede da escola).
2b. **Confirmar a API do site institucional com o professor** (URL, autenticação, endpoint, formato, LGPD:
   lista em [integracao-site-institucional.md](integracao-site-institucional.md)), ajustar o `.env` (e, se o
   contrato for diferente, `api/app/institucional.py`) e testar com matrículas reais.
3. **Corrigir os vazamentos de privacidade** da seção 10 (campos privados de `athletes`, `origin` de `streams`).
3b. **Colocar o armazenamento novo no ar** ([armazenamento.md](armazenamento.md), seção 5): reconstruir os
   containers, criar o cliente OAuth, conectar o Drive, ligar a chave, gravar um jogo de teste e só então desligar
   a pasta local. Para usar outro disco, definir `PASTAS_DO_PC`.
4. **Testar Cloudinary de verdade**: `CLOUDINARY_URL`, um MP4 pequeno e um grande (limite de plano), falha e
   nova tentativa, "Reenviar"; foto de atleta indo para `athletes/pending` (modo matrícula). O preset
   `athletes_profile` só é necessário se o cadastro ficar no modo upload.
5. **Teste de campo**: OBS/DroidCam reais, variar a banda (throttling) para ver a troca de qualidade, medir
   latência e CPU do FFmpeg com 4 qualidades (e avaliar 2160p, citado no artigo).
6. Revisar **responsivo/TV/acessibilidade**, adicionar ESLint e alguns testes (regras do Firestore com o
   emulador; helpers de `lib/`; endpoints do worker).
7. Commitar as mudanças pendentes; criar o repositório no GitHub e dar `push`; definir `RECORDINGS_DIR` fora
   do OneDrive, **liberar espaço em disco**, limpar volumes antigos do Docker, política de retenção/limpeza das
   gravações locais e monitoramento de disco (alerta).
8. Ideias de evolução (do artigo e da conversa): scout ao vivo, mover foto aprovada para a pasta `approved`,
   estatísticas por partida/atleta, métricas de desempenho do streaming para o artigo; da integração
   institucional: pré-preencher nome/turma pela API, cadastro em lote por lista de matrículas, "Atualizar foto".

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
- O nginx do `media` **sobrescreve** `X-Real-IP` com o IP da conexão; em testes, simule IPs com o cabeçalho
  `CF-Connecting-IP` (é o que o Cloudflare envia, e o worker o prefere).
- Ao recriar o container dos emuladores (`up --build`), o Docker espera só 10 s por padrão e pode matar o emulador
  antes de exportar os dados; por isso `stop_grace_period: 60s`. Dados de teste podem sumir se isso falhar.
- `docker compose` lê o `.env` da raiz: mudar uma variável exige `docker compose up -d <serviço>` (recria o container).
- Matrículas de teste e o mock: `tools/mock_institucional.py` (docstring lista os casos).
- **Relógio do PC atrasado derruba o login no worker** (2026-10-11): o relógio desta máquina estava 43 s atrás do
  horário real, e o `verify_id_token` recusava todo ID token recém-emitido ("usado cedo demais"), dando 401 em
  `/api/armazenamento` (e em `/arquivos/...?token=`) por ~45 s depois de cada login ou renovação de token.
  `fb.verificar_admin` agora tolera até 60 s (`clock_skew_seconds=60`, o máximo do SDK). Com atraso maior que isso
  o 401 volta: sincronize o relógio do Windows (Configurações > Hora e idioma > Sincronizar agora).
- O emulador do Firestore roda em "single project mode": um worker de teste com outro `FIREBASE_PROJECT_ID` enxerga
  uma cópia dos dados exportados, separada do `demo-jiftv`. No emulador de Auth, o login por REST com outro projeto
  precisa de `targetProjectId` no corpo e `Authorization: Bearer owner`.
- Para testar o worker sem tocar na produção: container descartável da imagem `jiftv-api` com `api/app` montado,
  `JIFTV_ESTADO`/`JIFTV_RECORDINGS`/`JIFTV_PASTAS` apontando para pastas temporárias e os emuladores em
  `host.docker.internal:8085/9099` (fora da rede do compose, para não alcançar o `media` real).
