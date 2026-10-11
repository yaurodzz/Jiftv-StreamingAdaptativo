# Experiência em celulares (telas abaixo de 768px)

Registro do trabalho de adaptação do front-end (`web/`) para celular em pé, entre 360 e 430px.
O desktop (`md` para cima) não deve mudar.

## Como foi verificado

- Dev server (porta 5173) em 375×812 e 360×640, temas claro e escuro, em duas rodadas:
  1. Configuração `web` (emuladores do Firebase, que estavam desligados): só estados vazios.
  2. Configuração `web-real` em `.claude/launch.json` (`vite --mode real`): carrega `web/.env`, ou seja,
     o Firebase real (`jiftv-stream`) com o servidor de mídia local. Usada **só para leitura**, com a
     transmissão de teste "Teste-obs" no ar: player ao vivo, catálogo e página de gravação com dados.
- Perfil de atleta e vitrine com cards (não há atletas aprovados), `/admin/*` e `/scout/:vodId` foram
  revisados **apenas pelo código**.
- O formulário de `/atletas/novo` não foi enviado e nenhuma gravação foi reproduzida: ambos gravam no
  Firebase de produção.

## Diagnóstico (antes de editar), por prioridade

### Vale para todas as telas

| # | Problema (medido na tela) | Correção |
|---|---|---|
| 1 | `.input` com 14px e 38px de altura: o Safari do iOS dá zoom ao focar | 16px e 44px de altura abaixo de `md`, em `index.css` |
| 2 | `.btn-primary`/`.btn-ghost` com 40px, `.icon-btn` 36px, `.btn-sm` ~28px | altura mínima de 44px abaixo de `md`, em `index.css` |
| 3 | Sem `viewport-fit=cover` nem `env(safe-area-inset-*)` | meta viewport + respiro de safe-area em header, footer, toasts e diálogos |
| 4 | `min-h-screen` / `100vh` contam a área atrás da barra de endereço | trocar por `dvh` (com `vh` de reserva) |

### `/live`

| # | Problema | Correção |
|---|---|---|
| 5 | Player com margem lateral e cantos arredondados: perde 32px de largura | sangrar até as bordas abaixo de `md` |
| 6 | Qualidade, cinema e tela cheia com 32px, colados aos controles nativos do vídeo | 44px no toque |
| 7 | Menu de qualidade só fecha com `mousedown` fora; itens com 36px | fechar também no toque; itens de 44px |
| 8 | Linha "Atalhos: C · F · M" não serve no celular e empurra o título | esconder abaixo de `md` |
| 9 | Modo cinema usa `100vh` e o botão diz "Sair do cinema (C)" | `dvh`, safe-area e rótulo sem a tecla no celular |
| 10 | O placar fica depois de título, descrição e botão: quem está na quadra precisa rolar | **feito** (pedido de aperfeiçoar a página Ao vivo): placar logo abaixo do player |
| 11 | "Copiar link" quebra para uma linha própria alinhada à esquerda, sem ocupar a largura | botão de largura inteira abaixo de `sm` |

### `/catalogo` e `/atletas`

| # | Problema | Correção |
|---|---|---|
| 12 | Chips de modalidade com 34px e alternador Trilhas/Grade com 32px | 44px no toque |
| 13 | Botão "limpar busca" com 24px | área de toque de 44px |
| 14 | Selo de play do `MediaCard` só aparece no `hover` | não esconde informação (o card inteiro é link); manter |
| 15 | Select de turma limitado a 220px ao lado da busca | largura inteira abaixo de `sm` |
| 16 | Trilhas: card com 75% da largura, sem indicar que há mais | manter 75% (o corte do próximo card já indica rolagem) |

### `/partidas/:id`

| # | Problema | Correção |
|---|---|---|
| 17 | `max-w-[calc((100vh-260px)*16/9)]` reduz o player a ~180px de largura no celular deitado (altura de 360px) | classe `.player-fit`: o limite só vale com 500px ou mais de altura; em pé, largura inteira sem margem |
| 18 | Botões "Copiar link" e "Baixar" em linha solta | dividir a largura em duas colunas abaixo de `sm` |

### `/atletas/:id`

| # | Problema | Correção |
|---|---|---|
| 19 | Cartão com `p-6` e selo do número saindo 12px para fora da foto | respiro menor e selo dentro da foto abaixo de `md` |
| 20 | "Ver gravação" com `text-xs` e 40px | 44px |

### `/atletas/novo`

| # | Problema | Correção |
|---|---|---|
| 21 | Campos sem `autocomplete`, `inputmode`, `autocapitalize` e `enterkeyhint` | nome, apelido, número, e-mail e matrícula com os atributos certos |
| 22 | Matrícula aceita letras na validação, mas `inputMode="numeric"` abre teclado só de números | **não alterado** (depende de existir matrícula com letra); só desliguei a autocorreção |
| 23 | Input de foto sem `capture`; "Trocar" e "Remover" são links de 12px | manter galeria ou câmera (sem `capture`), botões de 44px |
| 24 | "Cancelar" e "Enviar" empilhados à direita, com o principal embaixo e estreito | largura inteira, principal em cima, abaixo de `sm` |
| 25 | Botão de envio fica desabilitado sem dizer o motivo | fora do escopo (lógica de validação); anotado em "Ficou de fora" |

### Casca (`Navbar`, `Footer`, `Layout`)

| # | Problema | Correção |
|---|---|---|
| 26 | Hambúrguer abre um diálogo para 3 destinos + login; exige dois toques no topo da tela | **feito** (aprovado): barra inferior fixa com Ao vivo, Catálogo, Atletas |
| 27 | Botão do menu com 40px, fechar com 36px, alternador de tema com 32px | 44px |
| 28 | Links do rodapé com 20px de altura; rodapé ocupa ~190px | área de toque de 44px e respiro menor |
| 29 | `mt-24` do rodapé e `py-16`/`py-10` das páginas gastam a primeira dobra | reduzir abaixo de `md` |

### `/admin/*` e `/scout/:vodId` (revisados pelo código)

| # | Problema | Correção |
|---|---|---|
| 30 | Abas do painel rolam na horizontal sem indicar que há mais | esmaecer a borda direita enquanto houver conteúdo e rolar a aba ativa para a vista |
| 31 | `FormDialog` usa `100vh`; `ConfirmDialog` não limita a largura na tela pequena | `dvh` e largura `calc(100% - 2rem)` |
| 32 | Ações das gravações são `.icon-btn` só com `title` (tooltip não existe no toque) | 44px pela regra global e `aria-label` |
| 33 | Placar do operador (`+`/`−`) com 36px | 44px pela regra global |

## O que foi implementado

Tudo abaixo vale só abaixo de `md` (768px), usando as variantes `max-md:`/`max-sm:` do Tailwind, ou
restaura o valor antigo em `md:`. Em 1280px os tamanhos medidos continuam os de antes (campo 38px/14px,
botões 40–42px, chip 34px, respiros e rodapé iguais).

### Classes compostas (`web/src/index.css`) e `web/index.html`

- `.input`: 16px e altura mínima de 44px (acaba o zoom do iOS ao focar).
- `.btn-primary`, `.btn-ghost`, `.btn-danger`: altura mínima de 44px (vale também com `.btn-sm`).
- `.icon-btn`: 44×44px.
- Novas: `.crumbs` (trilha de navegação com links de 44px de toque), `.player-fit` (largura do player de
  gravação), `.pt-safe`/`.pb-safe`/`.px-safe` (área segura) e `.no-scrollbar`.
- Meta viewport com `viewport-fit=cover`.

### Casca

- `Layout`: `100dvh` no lugar de `100vh` (com `vh` de reserva) e respiro lateral de área segura.
- **Barra de navegação inferior** (`BottomNav.jsx`, só abaixo de `md`): Ao vivo, Catálogo e Atletas fixos no
  pé da tela, com abas de 56px, respiro de área segura e ponto vermelho em "Ao vivo" quando há transmissão.
  Quem é admin ganha a aba "Painel". A página de gravação acende "Catálogo"; `/scout` acende "Painel".
  Os destinos vêm de `navLinks.js`, compartilhado com o cabeçalho do desktop.
- `Navbar`: o hambúrguer e o diálogo do menu saíram. No celular o topo fica com a marca, o alternador de
  tema e um ícone de entrar no painel (escondido para quem já é admin). De `md` para cima nada mudou.
- `Layout` reserva o espaço da barra no fim da página; os toasts do painel sobem para cima dela; a folha
  de qualidade do player passa por cima dela.
- `ThemeToggle`: área de toque de 44px sem mudar o desenho.
- `Footer`: no celular some a lista de links (já estão na barra inferior) e sobra menos espaço acima e dentro.

### `/live`

- Player encosta nas bordas da tela, sem cantos arredondados, logo abaixo do cabeçalho.
- **Barra de controles própria no celular** (`LivePlayer.jsx`, ligada pelo hook `lib/useIsMobile.js`): os
  controles nativos do `<video>` (linha do tempo sem sentido ao vivo, menu de três pontos, botões pequenos)
  saem e entram quatro botões de 44px no pé do vídeo: pausar, som, qualidade e tela cheia. O modo cinema
  não aparece no celular. O desktop continua com os controles nativos e os botões flutuantes de antes.
  - Um toque no vídeo mostra ou esconde a barra; ela some sozinha após 2,5s, menos quando está pausado ou
    com o menu aberto. Escondida, não recebe toques (antes os botões invisíveis continuavam clicáveis).
  - Retomar depois de pausar volta ao ponto ao vivo, em vez de seguir atrasado.
  - Tela cheia: no Android o player inteiro entra em tela cheia e a tela deita (`screen.orientation.lock`);
    no iPhone, que não aceita tela cheia em `<div>`, entra o próprio vídeo (`webkitEnterFullscreen`).
  - `useIsMobile` também vale para aparelho de toque deitado, para a barra não sumir ao girar o celular.
- Menu de qualidade: no celular abre como folha no pé da tela, com título e itens de 48px (dentro do player
  a lista ficava cortada), fecha ao tocar fora (`pointerdown` no lugar de `mousedown`).
- **Placar logo abaixo do player** no celular; título e dados da transmissão vêm depois, e o seletor
  HLS/DASH desce para junto do painel "Streaming adaptativo". De `md` para cima a ordem é a de antes.
- "Copiar link" vira "Compartilhar" no celular quando o navegador tem a folha de compartilhamento do
  sistema (`navigator.share`); sem suporte, continua copiando o link.
- Linha de atalhos de teclado escondida; seletor HLS/DASH com 44px.
- Modo cinema: `dvh`, sem margem lateral, botão de sair com 44px, sem "(C)" e fora do notch.
- Estado fora do ar: menos espaço vazio acima do aviso.
- Placar grande quebra nomes longos de equipe em vez de estourar.

### `/catalogo` e `/atletas`

- Chips de modalidade viram uma faixa de rolagem horizontal até a borda, com 44px de altura.
- Trilhas do catálogo (`Row.jsx`) também rolam até a borda da tela.
- Alternador Trilhas/Grade e botão de limpar busca com 44px; busca com `enterkeyhint="search"`.
- Vitrine de atletas em duas colunas (antes era uma figurinha por tela); select de turma em largura inteira.

### `/partidas/:id`

- Player em largura inteira, sem margem; "Copiar link" e "Baixar" dividem a largura; trilha com toque de 44px.

### `/atletas/:id`

- Cartão com respiro menor, selo do número dentro da foto, estatísticas em duas colunas.

### `/atletas/novo`

- Atributos de teclado e preenchimento: `autocomplete` (`name`, `bday`, `email`), `autocapitalize`,
  `inputmode` (número e e-mail), `enterkeyhint`, autocorreção desligada em e-mail e matrícula.
- "Enviar para aprovação" em largura inteira e acima de "Cancelar"; "Trocar"/"Remover" foto com 44px.
- Campo de data sem a largura mínima nativa do iOS.

### `/admin/*` e `/scout/:vodId`

- Abas do painel: a borda direita esmaece enquanto há abas escondidas e a aba ativa rola para a vista.
- `FormDialog` com `dvh`, respiro menor e botões dividindo a largura; `ConfirmDialog` idem; toasts acima da
  barra de gestos.
- Gravações: ações com `aria-label` (antes só `title`) e quebra de linha quando não cabem.
- Filtro de status dos atletas rolável; botões dos cards de moderação, do scout e do editor de tipos com 44px.
- Formulários de modalidade e turma: o botão "Adicionar" desce para a linha de baixo em telas estreitas.
- Login: teclado de e-mail, sem maiúscula automática nem autocorreção.
- Depois de ver o painel logado (11/10/2026): filtros de status das transmissões, links "Todas as
  transmissões", "Gerenciar", "Gerar nova chave", voltar para "Transmissões" e os botões "Scout" e "Remover"
  de modalidades e turmas passaram a ter 44px de toque (classe `.tap` em `index.css`). Os cartões de números
  da visão geral ficam em duas colunas, e a linha de cada modalidade quebra em vez de espremer o texto.

## Ficou de fora, e por quê

- **Folha de qualidade por cima da barra inferior**: a transmissão de teste terminou antes de eu conferir
  na tela; a ordem das camadas foi revista só pelo código.
- **Diálogos do painel** (editar, excluir, nova transmissão) e as ações que gravam não foram abertos: a
  sessão estava nos dados reais e só naveguei.
- **Botão de envio do cadastro desabilitado sem explicar o motivo**: a mensagem só aparece ao enviar, mas o
  botão desabilitado impede o envio. É lógica de validação, fora do escopo de layout.
- **Teclado da matrícula**: ver item 22.
- **Player de gravação (`VodPlayer`)** segue com os controles nativos: em gravação a linha do tempo é útil.
- **Selo "Ao vivo" do player** continua aparecendo com o vídeo pausado (o estado vem do adaptador).
- **`/live` sem slug não mostrou a transmissão de teste**, só `/live/teste-obs-9c6e`; parece ser a
  transmissão marcada como não listada. Não investigado (dados, não layout).
- **Selo de play do `MediaCard` no hover**: não esconde informação (o card inteiro é link).
- **`theme-color`** segue o tema do sistema, não o tema escolhido no site.
- **Campos somente leitura do painel** (URL RTMP, chave, link público) continuam com 12px: não abrem teclado.
- **Selo do número em `/atletas/:id` no desktop** fica cortado pela borda da foto (já era assim); só o
  celular foi ajustado.

## O que foi visto rodando e o que foi só lido

| Tela ou estado | Rodando (375 e 360, claro e escuro) | Só pelo código |
|---|---|---|
| Casca, barra inferior (3 abas, mais "Painel" com admin logado; aba ativa por rota), rodapé | sim | |
| `/live` fora do ar | sim | |
| `/live` com transmissão: barra de toque, pausar e retomar, som, folha de qualidade, placar | sim | tela cheia, giro de tela, compartilhar, modo cinema |
| `/catalogo` e `/atletas` vazios, busca e filtros | sim | |
| `/catalogo` com gravações (trilhas e chips) | sim | `/atletas` com cards |
| `/partidas/:id` e `/atletas/:id` não encontrados | sim | |
| `/partidas/:id` com dados (sem dar play) | sim | `/atletas/:id` com dados |
| `/atletas/novo` (modo upload, sem enviar) | sim | modo matrícula e tela de sucesso |
| `/admin/login` | sim | |
| `/admin/*` (as sete seções e o detalhe de uma transmissão) e `/scout/:vodId`, logado, com dados reais | sim, sem rolagem horizontal e sem toque abaixo de 44px | diálogos, ações que gravam, lista de atletas com cadastros |
| Desktop 1280px: `/catalogo`, `/atletas/novo` e `/live` com transmissão | sim (medidas e controles iguais aos de antes) | demais telas |
| Notch e barra de gestos, zoom do iOS, teclados | | sim (o navegador de teste não simula) |

`npx vite build` passou. Atenção: esse build regravou `web/dist` (pasta ignorada pelo git) já com estas
mudanças.
