// Cliente mínimo do obs-websocket 5 (embutido no OBS 28 ou mais novo: Ferramentas →
// Configurações do servidor WebSocket). O navegador do painel fala direto com o OBS, sem
// passar pelo servidor do JIFTv.
//
// Limite do navegador: uma página HTTPS (jiftv.org) só pode abrir "ws://" para o próprio
// computador (localhost). Por isso o painel precisa estar aberto no computador do OBS.

const OP = { hello: 0, identify: 1, identified: 2, event: 5, request: 6, response: 7 };
// Eventos pedidos ao OBS: cenas (1 << 2) e saídas, como iniciar/parar transmissão (1 << 6).
const EVENTS = (1 << 2) | (1 << 6);

const text = new TextEncoder();

async function sha256Base64(value) {
  const hash = await crypto.subtle.digest("SHA-256", text.encode(value));
  return btoa(String.fromCharCode(...new Uint8Array(hash)));
}

export function isLocalHost(address) {
  const host = String(address || "").replace(/^wss?:\/\//, "").replace(/[:/].*$/, "").toLowerCase();
  return host === "localhost" || host === "127.0.0.1";
}

export function obsUrl(address) {
  const value = String(address || "").trim() || "localhost:4455";
  if (/^wss?:\/\//i.test(value)) return value;
  return `ws://${/:\d+$/.test(value) ? value : `${value}:4455`}`;
}

function closeReason(code) {
  if (code === 4009) return "Senha do WebSocket do OBS incorreta.";
  if (code === 4008) return "O OBS pede senha. Preencha a senha do servidor WebSocket.";
  if (code === 4010) return "Esta versão do OBS é antiga demais. Atualize para o OBS 28 ou mais novo.";
  return "Não foi possível conectar ao OBS. Confira se ele está aberto neste computador, se “Ativar servidor WebSocket” está marcado "
    + "(Ferramentas → Configurações do servidor WebSocket, porta 4455) e se o navegador não bloqueou o acesso à rede local.";
}

// Conecta e devolve { version, call(tipo, dados), close() }. `onEvent(tipo, dados)` recebe os
// eventos do OBS e `onClose()` avisa quando a conexão cai depois de estabelecida.
export function connectObs({ address, password = "", onEvent, onClose }) {
  return new Promise((resolve, reject) => {
    let socket;
    try {
      socket = new WebSocket(obsUrl(address));
    } catch {
      reject(new Error("Endereço do OBS inválido ou bloqueado pelo navegador."));
      return;
    }

    const waiting = new Map();
    let ready = false;
    let nextId = 1;
    let version = "";

    const call = (requestType, requestData) => new Promise((ok, fail) => {
      if (socket.readyState !== WebSocket.OPEN) { fail(new Error("O OBS não está conectado.")); return; }
      const requestId = String(nextId++);
      waiting.set(requestId, { ok, fail });
      socket.send(JSON.stringify({ op: OP.request, d: { requestType, requestId, ...(requestData ? { requestData } : {}) } }));
    });

    socket.onmessage = async (message) => {
      let packet;
      try { packet = JSON.parse(message.data); } catch { return; }
      const data = packet.d || {};

      if (packet.op === OP.hello) {
        version = data.obsWebSocketVersion || "";
        const identify = { rpcVersion: 1, eventSubscriptions: EVENTS };
        if (data.authentication) {
          if (!password) { socket.close(4008); return; }
          const secret = await sha256Base64(password + data.authentication.salt);
          identify.authentication = await sha256Base64(secret + data.authentication.challenge);
        }
        socket.send(JSON.stringify({ op: OP.identify, d: identify }));
      } else if (packet.op === OP.identified) {
        ready = true;
        resolve({ version, call, close: () => socket.close(1000) });
      } else if (packet.op === OP.event) {
        onEvent?.(data.eventType, data.eventData || {});
      } else if (packet.op === OP.response) {
        const entry = waiting.get(data.requestId);
        if (!entry) return;
        waiting.delete(data.requestId);
        if (data.requestStatus?.result) {
          entry.ok(data.responseData || {});
        } else {
          const error = new Error(data.requestStatus?.comment || `O OBS recusou o pedido ${data.requestType}.`);
          error.code = data.requestStatus?.code;
          entry.fail(error);
        }
      }
    };

    socket.onclose = (event) => {
      for (const entry of waiting.values()) entry.fail(new Error("A conexão com o OBS caiu."));
      waiting.clear();
      if (ready) onClose?.();
      else reject(new Error(closeReason(event.code)));
    };
  });
}
