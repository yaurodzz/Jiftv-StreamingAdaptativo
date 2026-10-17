# Gráficos no vídeo (placar e escalação) e controle do OBS

Criado em **2026-10-12**. Estado: código pronto, build do site sem erros e a página de gráficos conferida na
tela e pelo painel nos emuladores; **falta publicar o site** e testar com o OBS de verdade (veja "O que foi testado").
Não mexe em servidor, containers, nginx nem regras do Firestore: é tudo no site.

Para que serve: deixar a transmissão com cara de jogo profissional. São três peças:

1. **Página de gráficos** (`/overlay/<nome-da-transmissão>`): aberta dentro do OBS como fonte "Navegador",
   desenha por cima do jogo o **placar** (equipes, pontos, cronômetro, período) e a **tela de escalação**
   (foto, número e nome de cada atleta, como no futebol profissional).
2. **Cartão "Gráficos no vídeo (OBS)"** no painel da transmissão: liga e desliga o placar, controla o
   cronômetro e o período, e põe a escalação no ar.
3. **Cartão "Controlar o OBS"** no painel da transmissão: conecta ao OBS e troca de cena, inicia e para a
   transmissão, e coloca a fonte dos gráficos na cena com um clique.

O elenco da partida (quem joga e em que equipe) é montado no cartão **Elenco** da mesma tela, feito na reforma
dos atletas; a tela de escalação só lê esse elenco.

## Como funciona

```
 Painel (qualquer rede)                 Firestore                    OBS (fonte "Navegador")
 botões do cartão "Gráficos"  ──grava──▶ streams/{id}.overlay ──escuta──▶ /overlay/<slug> redesenha
 cartão "Placar" (pontos)     ──grava──▶ streams/{id}.scoreA/B           em menos de 1 segundo
 cartão "Elenco"              ──grava──▶ streams/{id}.roster
```

- A página de gráficos não tem login: lê só o que já é público (`streams` e atletas **aprovados**).
- Quem controla é o painel, **de qualquer computador ou celular e de qualquer rede**: os botões gravam no
  Firestore e a página dentro do OBS reage sozinha. Isso não depende do cartão "Controlar o OBS".
- Os gráficos entram no vídeo que o OBS envia, então aparecem iguais no ao vivo e na gravação.

### Estado dos gráficos (`streams/{id}.overlay`)

| Campo | Valores | Efeito |
|---|---|---|
| `scoreboard` | `true` / `false` (sem o campo = ligado) | Mostra o placar no canto. Só aparece se a transmissão tiver equipes |
| `lineup` | `null`, `"A"`, `"B"`, `"all"` | Tela de escalação no ar: uma equipe ou as duas. Enquanto está no ar, o placar some |
| `period` | texto de até 24 letras | Aparece ao lado do cronômetro ("1º tempo", "Intervalo") |
| `clock` | `{ running, baseMs, startedAt }` | Cronômetro: tempo = `baseMs` + (agora − `startedAt`, se rodando). Zerado e parado, não aparece |

O cronômetro é disparado no painel e desenhado no OBS, que podem ter relógios diferentes. Os dois se acertam
pela hora do servidor de mídia (`/time`); diferenças de até 2 s são ignoradas. Sem o servidor, vale o relógio
de cada computador (`web/src/lib/serverClock.js`).

### Peças

| Arquivo | O que faz |
|---|---|
| `web/src/pages/Overlay.jsx` | Rota `/overlay/:slug`, fora da casca do site, fundo transparente. Palco fixo de 1920×1080, encolhido para caber em fontes menores |
| `web/src/features/overlay/ScoreBug.jsx` | Placar do canto |
| `web/src/features/overlay/LineupScreen.jsx` | Tela de escalação; escolhe sozinha o tamanho dos cartões conforme o número de atletas |
| `web/src/features/overlay/demo.js` | Dados de teste (`?demo=`) |
| `web/src/services/overlay.js` | Lê e grava `streams/{id}.overlay` |
| `web/src/features/admin/BroadcastGraphicsCard.jsx` | Cartão "Gráficos no vídeo (OBS)" |
| `web/src/features/admin/ObsControlCard.jsx` | Cartão "Controlar o OBS" |
| `web/src/lib/obsWebsocket.js` | Cliente do obs-websocket 5 (sem biblioteca externa) |

## Passo a passo

### 1. Colocar os gráficos no OBS

Jeito manual (funciona sempre):

1. No painel, abra a transmissão e copie o endereço do cartão **Gráficos no vídeo (OBS)**
   (`https://jiftv.org/overlay/<nome-da-transmissão>`).
2. No OBS: **Fontes → + → Navegador**. Cole o endereço, largura **1920**, altura **1080** (ou o tamanho da sua
   tela base). Deixe o CSS personalizado como está.
3. Deixe a fonte **acima** da câmera na lista de fontes.

Cada transmissão tem o seu endereço. Para não refazer a cada jogo, use o botão do passo 3 abaixo, que atualiza
a fonte existente.

Para conferir a posição antes do jogo, sem mexer em nenhuma transmissão, troque o final do endereço:

| Endereço | Mostra |
|---|---|
| `/overlay/teste?demo=placar` | Placar com cronômetro rodando |
| `/overlay/teste?demo=equipe` | Escalação de uma equipe |
| `/overlay/teste?demo=elenco` | Escalação das duas equipes |

No navegador comum, acrescente `&fundo=1` para ver com um fundo quadriculado (o botão "Ver como está" do cartão
já faz isso com os dados reais).

### 2. Durante o jogo

- **Pontos**: cartão "Placar" (botões + e −), como antes. O número pula no vídeo a cada ponto.
- **Cronômetro**: Iniciar, Pausar, Continuar, ±1 min e Zerar.
- **Período**: os botões prontos ou um texto livre.
- **Escalação**: clique na equipe (ou "As duas equipes") para pôr no ar e em "Tirar do ar" para voltar ao jogo.
  O uso comum é mostrar antes do início e no intervalo.

### 3. Controlar o OBS pelo painel (opcional)

1. No OBS (versão 28 ou mais nova): **Ferramentas → Configurações do servidor WebSocket**, marque "Ativar
   servidor WebSocket". A senha está em "Mostrar informações de conexão".
2. **No computador do OBS**, abra o painel da transmissão e, no cartão **Controlar o OBS**, deixe o endereço
   `localhost:4455`, cole a senha e clique em "Conectar ao OBS". Se o navegador perguntar se o site pode acessar
   dispositivos da rede local, permita.
3. Depois de conectado:
   - **Cenas**: um botão por cena; a que está no ar fica destacada.
   - **Colocar os gráficos nesta cena**: cria a fonte "JIFTv Gráficos" já com o endereço desta transmissão e o
     tamanho da tela do OBS. Se a fonte já existe, só troca o endereço.
   - **Iniciar / Parar transmissão**: o mesmo que os botões do OBS.
   - **Destino configurado**: confere se a chave que está no OBS é a desta transmissão. Se não for, o botão
     "Usar este OBS nesta transmissão" grava o servidor e a chave certos no OBS (só com o OBS parado).

## Limites

- **O cartão "Controlar o OBS" só funciona com o painel aberto no computador do OBS.** O site é HTTPS e o
  navegador só deixa uma página HTTPS abrir conexão sem criptografia (`ws://`) para o próprio computador
  (`localhost`). Para um OBS em outra máquina o navegador bloqueia, e o cartão avisa. Saídas, se um dia for
  preciso: abrir o painel por acesso remoto no computador do OBS, ou criar uma ponte pelo servidor (como a de
  [obs-pela-internet.md](obs-pela-internet.md)).
- **Placar, cronômetro e escalação não têm esse limite**: funcionam de qualquer rede, porque passam pelo
  Firestore. Só o computador do OBS precisa de internet para a página de gráficos.
- A senha do WebSocket fica guardada só até fechar a aba (`sessionStorage`); o endereço fica salvo no navegador.
- A escalação mostra só atletas **aprovados** (os outros não são legíveis sem login). Elencos muito grandes
  cabem, mas os cartões encolhem; até uns 16 por equipe fica confortável.
- Quem assiste vê os gráficos com o mesmo atraso do vídeo (o HLS tem alguns segundos); o placar da página do
  site, fora do vídeo, atualiza antes.
- A página de gráficos é pública para quem souber o endereço, como a página da transmissão. Não mostra nada
  que o site já não mostre.
- Dica: o painel da transmissão também pode ficar dentro do OBS, em **Docas → Docas de navegador
  personalizadas**, com o endereço da transmissão no painel.

## Para colocar no ar

Só o site muda (nada de containers). **Atenção (2026-10-12):** o build publica tudo o que está na pasta, inclusive a
reforma dos atletas e o elenco por jogo. Antes de publicar, reconstrua o container `media` (`docker compose up -d --build media`, fora de uma transmissão ao
vivo): o envio de foto de atleta pelo painel depende do nginx novo. O `api` já está com o código novo.

`cd web && npm run build && cd .. && firebase deploy --only hosting --project jiftv-stream`

## O que foi testado, e o que falta

Testado em 2026-10-12:

| Caso | Onde | Resultado |
|---|---|---|
| `npm run build` | máquina de desenvolvimento | sem erros |
| Página de gráficos com `?demo=placar`, `?demo=equipe`, `?demo=elenco` | `localhost:5173`, janela 1280×720 | placar, cronômetro rodando e as duas telas de escalação desenhados e encolhidos na proporção certa; console sem erros |
| Cartão "Gráficos no vídeo (OBS)" com login de admin, e a página `/overlay/<slug>` aberta em outra aba | emuladores do Firebase, transmissão e 10 atletas de teste | ponto no placar, cronômetro (+1 min, Iniciar), período e escalação (duas equipes, depois uma) apareceram na página em até 3 s; console sem erros. Dados de teste apagados depois |

**Não testado**: o cliente do obs-websocket contra um OBS de verdade (conexão, senha, cenas, criar a fonte, iniciar
e parar); o cartão "Controlar o OBS" só foi visto desconectado. Também faltam a página dentro do navegador embutido do
OBS e fotos reais na escalação. O primeiro teste deve ser: adicionar a fonte com `?demo=elenco`, depois trocar para o
endereço real e clicar em cada botão dos cartões com o OBS aberto.
