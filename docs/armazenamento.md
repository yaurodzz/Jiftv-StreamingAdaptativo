# Armazenamento das gravações: pasta local, Google Drive e Cloudinary

Implementado em **2026-10-11**. Antes, toda gravação ficava em `gravacoes/videos/` e, se houvesse
`CLOUDINARY_URL`, era copiada para o Cloudinary. Agora o painel tem a aba **Armazenamento**
(`/admin/armazenamento`), com uma chave liga/desliga para cada destino e a escolha da pasta local.

Motivo: guardar os vídeos na nuvem sem ocupar o disco do computador e sem depender do plano pago do
Cloudinary (o gratuito limita cada vídeo a ~100 MB). O usuário tem ~400 GB livres no Google Drive.

> Estado: testado em ambiente isolado (emuladores do Firebase + um Google Drive de mentira). **Ainda não
> está rodando no servidor**: falta reconstruir os containers e autorizar a conta do Google (seção 5).

---

## 1. O que cada chave faz

| Destino | Ligado | Desligado |
|---|---|---|
| **Pasta local** | O MP4 fica guardado no computador, mesmo depois de enviado à nuvem. | O MP4 é **apagado do computador** assim que estiver confirmado na nuvem. Miniatura (`.jpg`), metadados (`.info.json`) e o registro `.drive.json` (poucos KB) continuam na pasta. |
| **Google Drive** | Cada gravação é enviada para `JIFTv Gravações/<transmissão>/` no Drive da conta conectada. | Nada é enviado. O que já está no Drive continua lá e continua tocando. |
| **Cloudinary** | Como antes: fila de envio, se houver `CLOUDINARY_URL`. | Nada é enviado, mesmo com `CLOUDINARY_URL` preenchido. |

Regras de segurança (validadas pelo worker, não só pela tela):

- Não dá para desligar a pasta local sem um destino de nuvem **utilizável** (Drive ligado e conectado, ou
  Cloudinary ligado e com credenciais). As gravações precisam ficar em algum lugar.
- A cópia local só é apagada quando existe cópia **confirmada** na nuvem e não há envio pendente para nenhum
  destino ligado. No Drive, "confirmada" = tamanho e MD5 iguais aos do arquivo local.
- Se o envio falhar, o vídeo continua no computador e a falha aparece em Painel > Gravações.
- Desligar a pasta local vale também para as gravações que já estão na pasta (a tela avisa quantas são).
- Ligar o Drive coloca na fila as gravações que estão no computador e ainda não foram enviadas.

Padrão (sem mexer em nada): pasta local ligada, Drive desligado, Cloudinary ligado. Ou seja, o
comportamento é o mesmo de antes até alguém mudar as chaves.

## 2. Pasta local escolhida pelo painel

- O painel navega e cria pastas **dentro de `PASTAS_DO_PC`** (variável do `.env`, montada em `/pc` nos
  containers). Vazia, vale a própria `RECORDINGS_DIR`: dá para escolher subpastas de `gravacoes/`.
  Para escolher qualquer pasta de outro disco: `PASTAS_DO_PC=D:/` e `docker compose up -d`.
  Esse limite existe porque o container só enxerga as pastas que o Docker monta; o painel não consegue
  alcançar um caminho que não foi montado.
- Trocar de pasta **não reinicia nada**: o nginx grava em `/var/jiftv/atual/em_andamento` e entrega
  `/var/jiftv/atual/videos`, e `atual` é um atalho (symlink) que o worker troca de forma atômica.
  O atalho fica no volume `jiftv-estado`, compartilhado pelos containers `media` e `api`.
- Ao trocar, os vídeos da pasta antiga são levados para a nova em segundo plano (a tela mostra o
  progresso). Gravações novas já caem na pasta nova.
- A troca é recusada enquanto há transmissão sendo gravada (o `.flv` em andamento ficaria para trás).
- `logs/` e `fotos/` (atletas) **não** mudam de lugar: continuam em `RECORDINGS_DIR`.
- Se a pasta escolhida sumir (disco desconectado, `PASTAS_DO_PC` alterado), o `entrypoint.sh` do `media`
  avisa no log e volta a gravar na pasta padrão.

## 3. Como o vídeo do Drive toca no site

O Drive não entrega vídeo para player (sem link direto estável, tela de aviso em arquivos grandes, cota de
download). Por isso o player pede `GET https://api.jiftv.org/api/video/<id da gravação>` e o worker busca o
arquivo no Drive com a autorização dele e repassa, aceitando `Range` (avançar e voltar funcionam).

Ordem usada pelo site (`web/src/lib/media.js`, `vodSource`): Cloudinary (`playbackUrl`) → pasta local
(`/arquivos/...`) → Google Drive (`/api/video/<id>`).

Consequências:

- Vídeos que só existem no Drive **só tocam com o servidor da escola ligado** (como já acontecia com os
  vídeos só locais).
- Assistir consome a internet da escola nos dois sentidos (baixa do Drive, envia ao espectador).
- Gravações ocultas seguem a mesma regra de `/arquivos/`: só com `?token=<ID token de admin>`.

## 4. Arquivos e modelo de dados

| Onde | O quê |
|---|---|
| `api/app/armazenamento.py` | Configuração (`<estado>/armazenamento.json`), pastas do computador, atalho `atual`, mudança de pasta. |
| `api/app/drive.py` | OAuth, fila de envio (retomável, em pedaços de 16 MB), conferência por MD5, lixeira, leitura para o player. |
| `api/app/rotas_armazenamento.py` | `GET/PUT /api/armazenamento`, `GET/POST /api/armazenamento/pastas`, `POST /api/drive/conectar`, `GET /api/drive/callback`, `POST /api/drive/desconectar`, `GET /api/video/<id>`. Tudo exige `Authorization: Bearer <ID token de admin>`, menos o callback (protegido pelo `state`) e o vídeo. |
| `api/app/recordings.py` | `_pode_liberar`/`_liberar`: apaga a cópia local quando a pasta local está desligada. |
| `api/app/cloud.py` | `ativo()` = credenciais + chave do painel. |
| `api/app/comandos.py` | `delete_vod` aceita `drive: true` (manda a cópia para a **lixeira** do Drive, recuperável por 30 dias). |
| `server/nginx/nginx.conf` | `record_path` e `/arquivos/` pelo atalho; `location /api/video/` sem buffer. |
| `server/scripts/entrypoint.sh`, `common.sh` | Criam/seguem o atalho `/var/jiftv/atual`. |
| `docker-compose.yml` | Volume `jiftv-estado` (`/var/jiftv`) e montagem `PASTAS_DO_PC` → `/pc` em `media` e `api`. |
| `web/src/pages/admin/Storage.jsx`, `services/storage.js` | Aba Armazenamento. |
| `web/src/pages/admin/Recordings.jsx`, `features/admin/badges.jsx` | Selo e ações do Drive por gravação. |

Volume `jiftv-estado` (`/var/jiftv`): `atual` (atalho), `armazenamento.json`, `drive.json` (autorização do
Google, permissão 600). **Não fica no repositório nem no OneDrive.** Apagar o volume desconecta o Drive e
volta a configuração ao padrão; os vídeos não são afetados.

Campos novos em `vods`: `drive { status (pending/uploading/uploaded/failed/disabled), fileId, thumbId, infoId,
folderId, webViewLink, bytes, md5, progress, attempts, error, nextAttemptAt, uploadedAt }` e `localRemovedAt`
(cópia local apagada de propósito). `system/server` ganhou `storage { local, drive, cloudinary }` e
`cloudinary.enabled`. **Nenhuma regra do Firestore mudou**: a configuração passa pelo worker, não pelo Firestore.

Variáveis novas no `.env` da raiz: `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET`, `API_PUBLIC_URL`
(padrão `https://api.jiftv.org`), `PASTAS_DO_PC`.

## 5. Como colocar para funcionar

### 5.1 Atualizar o servidor

```bash
docker compose --profile tunel up -d --build
```

Recria `media` e `api` (alguns segundos fora do ar; não faça durante uma transmissão). Depois publique o site
(`cd web && npm run build && firebase deploy --only hosting`), que ganha a aba Armazenamento.

### 5.2 Criar o cliente OAuth do Google (uma vez)

1. Entre em <https://console.cloud.google.com> com a conta que administra o projeto (pode ser o próprio
   projeto do Firebase, `jiftv-stream`).
2. **APIs e serviços > Biblioteca**: ative a **Google Drive API**.
3. **Google Auth Platform** (menu > APIs e serviços > Tela de consentimento OAuth; o console novo abre com esse
   nome). Se pedir, preencha nome "JIFTv" e seu e-mail e escolha o tipo **Externo**. Depois, no menu da esquerda:
   - **Acesso a dados > Adicionar ou remover escopos**: marque `.../auth/drive.file` e salve. (É aqui que ficam
     os escopos; a opção só lista o `drive.file` se a Google Drive API do passo 2 estiver ativada.)
   - **Público-alvo > Publicar aplicativo** (status "Em produção"). Isso é importante: em modo "Teste" a
     autorização expira a cada 7 dias e os envios param, e só as contas listadas em "Usuários de teste" conseguem
     autorizar. O escopo `drive.file` não é sensível, então o Google não exige verificação.
4. **Clientes > Criar cliente** (ou "Criar um cliente OAuth" na Visão geral): tipo **Aplicativo da Web**.
   Em "URIs de redirecionamento autorizados" coloque exatamente `https://api.jiftv.org/api/drive/callback`
   (a aba Armazenamento mostra esse endereço).
5. Copie o ID e a chave secreta para o `.env` da raiz (`GOOGLE_OAUTH_CLIENT_ID`,
   `GOOGLE_OAUTH_CLIENT_SECRET`) e rode `docker compose up -d`.

A conta dona do cliente OAuth **não precisa** ser a conta que guarda os vídeos: o cliente pode ficar no projeto
`jiftv-stream` e a conta com espaço no Drive é escolhida só na hora de conectar (5.3).

### 5.3 Conectar a conta e ligar

1. Painel > **Armazenamento** > Google Drive > **Conectar Google Drive**. Entre com a conta que tem o espaço
   e autorize. O JIFTv só enxerga os arquivos que ele mesmo criar (escopo `drive.file`).
2. Ligue a chave do **Google Drive**. As gravações que estão no computador entram na fila.
3. Quando quiser liberar o disco, desligue a chave da **Pasta local**.

## 6. O que foi testado e o que não foi

Testado em 2026-10-11, em container descartável da imagem do worker, contra os emuladores do Firebase (projeto
separado) e um servidor que imita a API do Drive (63 verificações, todas ok): autorização e retorno ao painel;
envio retomável com queda no meio; conferência de conteúdo; pastas `JIFTv Gravações/<transmissão>`; miniatura e
metadados; reprodução inteira e por `Range`; gravação oculta (403 sem token, 206 com token de admin); pasta
local desligada apagando só depois da confirmação; falha de envio sem apagar nada; "Reenviar"; navegação e
criação de pastas (sem sair da área liberada); troca de pasta com os vídeos sendo levados; recusa com gravação
em andamento; exclusão com lixeira do Drive; desconectar. O servidor de mídia foi testado numa imagem
descartável: `nginx -t`, conversão de `.flv` para MP4 caindo na pasta do atalho antes e depois da troca.
A tela foi conferida no navegador (desktop e 375 px) com os emuladores.

**Não testado**: Google Drive de verdade (OAuth real, cotas, velocidade de envio de arquivos de vários GB);
uma transmissão RTMP real gravando pelo atalho (só a conversão foi exercitada); reprodução pelo túnel da
Cloudflare; os containers de produção com o volume novo.

## 7. Limites e cuidados

- 400 GB ≈ 150 horas de jogo em 1080p a 6 Mbps (≈ 2,7 GB por hora). Limite de envio do Drive: 750 GB por dia.
- Com `drive.file`, arquivos colocados à mão na pasta do Drive não são vistos pelo JIFTv.
- Renomear a pasta do Drive no painel faz os **próximos** vídeos irem para a pasta nova; os antigos ficam onde estão.
- Excluir uma gravação sem marcar "mandar para a lixeira" deixa o arquivo no Drive (a tela avisa).
- Se a autorização for revogada na conta do Google, os envios falham com aviso e os vídeos do Drive param de
  tocar até reconectar. Nada é apagado.
- Durante a mudança de pasta, a varredura do acervo e as filas de envio ficam em pausa.
- A fila do Drive envia um vídeo por vez, em ordem de data.
- **401 na aba Armazenamento logo depois de entrar**: é o relógio do computador do servidor atrasado. O worker
  tolera até 60 s de diferença; acima disso, sincronize o relógio do Windows. (Corrigido em 2026-10-11, quando o
  relógio estava 43 s atrasado e a tolerância era zero.)
- Enquanto o site publicado não tiver a aba, ela pode ser usada rodando o site no próprio servidor:
  `npm --prefix web run dev -- --mode real` e abrir `http://localhost:5173/admin/armazenamento`.
