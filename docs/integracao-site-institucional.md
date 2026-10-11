# Integração com o site institucional (fotos dos atletas pela matrícula)

O site institucional do IFSC (feito pelo professor) já tem a foto de todos os alunos. O JIFTv busca a foto
lá pela **matrícula escolar**, em vez de a pessoa enviar uma foto no cadastro de atleta.

> **Estado: implementado e testado contra um servidor de mentira** (`tools/mock_institucional.py`).
> O contrato da API **real** ainda não foi confirmado com o professor: o JIFTv assume o formato descrito
> abaixo e tudo é configurável por variáveis de ambiente. Antes de usar de verdade, confirme os itens da
> seção "O que perguntar ao professor".

Interpretação do pedido: o JIFTv **consulta** a API do site do professor (o worker faz a chamada) e recebe a
foto pela matrícula. Se a ideia era também o site do professor chamar o JIFTv, isso ainda não existe.

## Como funciona

```
Pessoa (site jiftv.org)            Worker (servidor da escola)             Site institucional (professor)
   │  matrícula + dados do atleta        │                                         │
   ├────── POST /api/atletas ───────────►│  GET {API_URL}{PATH com a matrícula}    │
   │                                     ├────────────────────────────────────────►│
   │                                     │◄─── imagem, ou JSON com a foto ─────────┤
   │                                     │  guarda a foto (Cloudinary ou pasta local)
   │                                     │  athletes/{id}        (público após aprovar, SEM matrícula)
   │                                     │  athletePrivate/{id}  (só admin: matrícula e nome do cadastro)
   │◄──── 201 { id, status: pending } ───┤
   Admin aprova no painel → o atleta aparece na vitrine com a foto
```

- A foto **nunca passa pelo navegador** de quem cadastra e **não é mostrada a ele** (evita que alguém use o
  formulário para ver a foto de qualquer matrícula).
- O servidor da escola é quem conversa com a API. O token fica só no `.env` do servidor (nunca no site).
- Se `INSTITUCIONAL_API_URL` estiver vazio, o cadastro volta ao modo antigo (upload de foto ao Cloudinary,
  [cloudinary-preset.md](cloudinary-preset.md)). O formulário descobre o modo em `GET /api/atletas/config`.

## Contrato assumido (ajustável)

Requisição: `GET {INSTITUCIONAL_API_URL}{INSTITUCIONAL_API_PATH}` com `{matricula}` substituída
(padrão do caminho: `/alunos/{matricula}/foto`), cabeçalho `Authorization: Bearer <INSTITUCIONAL_API_TOKEN>`
(o nome do cabeçalho muda em `INSTITUCIONAL_API_HEADER`).

Respostas aceitas:

| Formato | Como é reconhecido | Exemplo |
|---|---|---|
| 1. A própria imagem | `Content-Type: image/*` (ou bytes de JPEG/PNG/WebP) | `200 image/jpeg` |
| 2. JSON com a foto | qualquer outro tipo; o JSON pode vir embrulhado em `data`, `aluno`, `student` ou `resultado` | `{"data":{"nome":"Ana Souza","foto":"https://…/ana.jpg"}}` |

No formato 2, o campo da foto é procurado em `INSTITUCIONAL_API_PHOTO_FIELDS` (padrão
`foto,photo,fotoUrl,photoUrl,imagem,url`) e pode conter: URL `http(s)://`, caminho relativo (`/fotos/…`),
data URI (`data:image/…;base64,…`) ou base64 puro. O nome do aluno, se vier (`INSTITUCIONAL_API_NAME_FIELDS`,
padrão `nome,name,nomeCompleto`), é guardado em `athletePrivate` para o admin conferir com o nome digitado.

Códigos HTTP: `404` = matrícula não encontrada; `401`/`403` = credenciais recusadas (vira alerta no painel);
qualquer outra falha = "site da instituição indisponível" para quem cadastra (o motivo real vai para o histórico
de atividades do painel).

Se o contrato real for diferente (outro caminho, outro campo, autenticação por chave em outro cabeçalho), o mais
provável é bastar mudar o `.env`. Se for algo mais diferente (POST, OAuth, consulta por CPF…), o ponto único
de adaptação é [`api/app/institucional.py`](../api/app/institucional.py).

## Configuração

No `.env` do servidor (valores em [.env.example](../.env.example)):

```
INSTITUCIONAL_API_URL=https://<site-do-professor>/api
INSTITUCIONAL_API_TOKEN=<token>
INSTITUCIONAL_API_PATH=/alunos/{matricula}/foto
INSTITUCIONAL_PHOTO_HOSTS=            # CDN extra, se as fotos ficarem em outro domínio
```

Depois `docker compose up -d api`. Em **Painel → Sistema → Site institucional** aparecem o modo, o servidor
da API e o resultado da última consulta.

## Onde a foto fica guardada

1. **Cloudinary**, se `CLOUDINARY_URL` estiver configurado: pasta `<CLOUDINARY_FOLDER>/athletes/pending/<id>`
   (se o envio falhar, cai para o item 2 e registra o aviso).
2. **Pasta local** `gravacoes/fotos/<id>.jpg|png|webp`, servida pelo servidor de mídia em `/fotos/<id>.<ext>`
   (campo `photoPath` no perfil). Funciona sem Cloudinary, mas some do site se o servidor da escola estiver fora.

Guardar uma cópia (em vez de apontar para o site do professor) evita depender do site dele para exibir a foto,
de autenticação nas imagens e de bloqueio de hotlink. A foto de um atleta **excluído** no painel não é apagada
automaticamente do Cloudinary nem da pasta local.

## Segurança e privacidade (LGPD)

São dados de **menores de idade**: matrícula e foto.

- A **matrícula nunca vai para o perfil público**. Fica em `athletePrivate/{id}` (regras: só admin lê/apaga).
- O worker só baixa foto do host da API (ou de `INSTITUCIONAL_PHOTO_HOSTS`), não segue redirecionamento para outro
  servidor, limita a resposta a 5 MB e confere o tipo da imagem pelos bytes. Isso impede que uma resposta
  maliciosa faça o servidor da escola acessar endereços internos (SSRF). Testado com os casos do mock.
- Matrícula: só letras e números, 4 a 20 caracteres.
- **Varredura de matrículas**: o cadastro aceita no máximo 10 envios por minuto e 5 matrículas inexistentes
  a cada 10 minutos por IP (`CF-Connecting-IP` atrás da Cloudflare). A mensagem "matrícula não encontrada"
  ainda revela, devagar, quais matrículas existem. Se isso for um problema, restrinja o cadastro a quem está
  logado ou mova o cadastro para o painel.
- A mesma matrícula não pode ter dois cadastros ativos na mesma modalidade (409).
- Todo cadastro entra como `pending`; o admin compara o nome digitado com o nome do cadastro institucional
  (o painel avisa quando não bate) antes de aprovar.
- Antes de exibir fotos de alunos no site público, a instituição precisa ter **autorização** (do aluno ou
  responsável, se menor) e uma base legal; combine isso com a coordenação.
- O perfil público ainda expõe `birthDate`, `submittedByEmail` e `submittedIp` (herdado do projeto de
  referência). Veja "Riscos" em [CONTEXTO-DO-PROJETO.md](CONTEXTO-DO-PROJETO.md).

## Testar sem a API real

```bash
docker compose --profile dev up -d --build        # sobe também o institucional-mock (porta 8090)
```

No `.env` local: `INSTITUCIONAL_API_URL=http://institucional-mock:8090` e `INSTITUCIONAL_API_TOKEN=mock-token`.
Matrículas de teste (em [tools/mock_institucional.py](../tools/mock_institucional.py)): `20230001` Ana Souza,
`20230002` Bruno Lima, `20230003` sem foto, `20230004` arquivo que não é imagem, `20230005` foto em outro
servidor, `20230006` redirecionamento para outro servidor. Com `INSTITUCIONAL_API_PATH=/alunos/{matricula}` o mock
responde no formato JSON.

## Kit para o professor (2026-10-10)

Para o professor implementar (ou adaptar) a API com a ajuda do Claude dele, foi montado o zip
**`JIFTv-API-Fotos-Professor.zip`** (entregue no projeto do Claude, em arquivos do projeto `Docs/kit-professor/`).
Ele não contém token nem nada do `.env` real. Conteúdo:

- `LEIA-ME.md` (visão geral e passos), `PROMPT-PARA-O-CLAUDE.md` (texto pronto para colar junto com o zip),
  `RESPOSTAS-PARA-O-ALUNO.md` (questionário a devolver; o token vai por canal privado, separado).
- `1-especificacao/`: `CONTRATO-DA-API.md` (requisição, formatos A e B, códigos HTTP, limites da imagem, rede),
  `openapi.yaml` e `exemplos/` (JSON e `curl`).
- `2-testar/testar_api.py`: verificador só com biblioteca padrão que aplica as mesmas regras de
  `api/app/institucional.py` (imagem pelos bytes, 5 MB, host da foto, redirecionamento, 404, 401 sem token e com
  token errado, tempo). Testado contra o mock: "PRONTA" nos formatos A e B; recusa 20230004 a 20230006; o
  resultado bate com o cliente real rodado contra o mesmo mock.
- `3-referencia/`: cópias de `tools/mock_institucional.py` (como `servidor_de_exemplo.py`) e de
  `api/app/institucional.py`, mais as opções do `.env` que o JIFTv ajusta.
- `4-privacidade/LGPD-E-SEGURANCA.md`.

Formato recomendado ao professor: **A** (`GET /alunos/{matricula}` devolvendo JSON com `nome` e `foto`), porque
traz o nome para o admin conferir e separa "sem foto" de "matrícula inexistente". Atenção: o padrão do `.env`
hoje é `INSTITUCIONAL_API_PATH=/alunos/{matricula}/foto` (formato B); ajuste conforme a resposta do professor.
Se o contrato, o cliente (`institucional.py`) ou o mock mudarem, atualize o kit e gere o zip de novo.

## O que perguntar ao professor

1. URL base da API (produção e, se houver, homologação) e se ela é acessível de fora da rede da escola.
2. Como autenticar (token fixo, chave de API, OAuth?) e em qual cabeçalho.
3. O endpoint de consulta por matrícula e o formato da resposta (imagem direta ou JSON; nomes dos campos).
4. Formato da matrícula (só números? tamanho?).
5. As fotos podem ser copiadas/armazenadas pelo JIFTv? Há limite de requisições?
6. Quem autorizou o uso das fotos no site público (LGPD)?
7. A API informa o nome e a turma do aluno? (Dá para pré-preencher o formulário e conferir a identidade.)

## Ideias para depois

- Pré-preencher nome/turma/nascimento a partir da API (hoje só o nome é guardado, para conferência).
- Cadastro em lote: o admin cola uma lista de matrículas e o JIFTv cria os perfis.
- Botão "Atualizar foto" no painel quando o site institucional trocar a foto.
- Mover a foto aprovada para `athletes/approved` no Cloudinary.
