import { useEffect, useState } from "react";
import { timeUrl } from "./media.js";

// Diferença entre o relógio deste computador e o do servidor de mídia (/time), em ms.
// O cronômetro do placar é disparado no painel e desenhado no OBS, que podem estar em
// computadores com relógios diferentes; os dois se acertam pelo servidor.
// Diferenças de até 2 s são ignoradas (o /time só tem precisão de segundos). Se o servidor
// não responder, vale o relógio local.

let pending = null;

function fetchOffset() {
  const sent = Date.now();
  return fetch(timeUrl(), { cache: "no-store" })
    .then((res) => (res.ok ? res.text() : Promise.reject(new Error("sem resposta"))))
    .then((text) => {
      const server = Date.parse(text.trim());
      if (!Number.isFinite(server)) return 0;
      const offset = server + 500 - (sent + Date.now()) / 2;
      return Math.abs(offset) > 2000 ? Math.round(offset) : 0;
    });
}

export function useServerOffset() {
  const [offset, setOffset] = useState(0);
  useEffect(() => {
    let alive = true;
    if (!pending) pending = fetchOffset().catch(() => { pending = null; return 0; });
    pending.then((value) => { if (alive) setOffset(value); });
    return () => { alive = false; };
  }, []);
  return offset;
}

// Hora atual (ms, já corrigida), atualizada a cada `everyMs` enquanto `active`.
export function useNow(offset, active = true, everyMs = 250) {
  const [now, setNow] = useState(() => Date.now() + offset);
  useEffect(() => {
    setNow(Date.now() + offset);
    if (!active) return undefined;
    const timer = setInterval(() => setNow(Date.now() + offset), everyMs);
    return () => clearInterval(timer);
  }, [offset, active, everyMs]);
  return now;
}
