import { useEffect, useState } from "react";
import { serverOnline, subscribeServer } from "../../services/system.js";

// Estado do servidor de mídia (documento system/server, atualizado pelo worker a cada 20 s).
// `online` é reavaliado a cada 15 s, porque depende do horário do último sinal.
export function useServer() {
  const [server, setServer] = useState(undefined); // undefined = carregando
  const [, force] = useState(0);

  useEffect(() => subscribeServer(setServer, () => setServer(null)), []);
  useEffect(() => {
    const t = setInterval(() => force((n) => n + 1), 15000);
    return () => clearInterval(t);
  }, []);

  return {
    server,
    loading: server === undefined,
    online: serverOnline(server),
    mediaOnline: serverOnline(server) && Boolean(server?.media?.online),
  };
}
