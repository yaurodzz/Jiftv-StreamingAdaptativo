import { useEffect, useState } from "react";
import { audienceUrl } from "../../lib/media.js";

// Avisa o servidor de mídia que este navegador está assistindo (a cada 20 s).
// O worker conta os espectadores e publica o total no documento da transmissão.
function viewerId() {
  try {
    let id = sessionStorage.getItem("jiftv-viewer");
    if (!id) {
      id = crypto.randomUUID();
      sessionStorage.setItem("jiftv-viewer", id);
    }
    return id;
  } catch {
    return crypto.randomUUID();
  }
}

export function useViewerPing(slug, active) {
  const [viewers, setViewers] = useState(null);

  useEffect(() => {
    if (!slug || !active) return undefined;
    const id = viewerId();
    let cancelled = false;

    const ping = async () => {
      if (document.hidden) return;
      try {
        const res = await fetch(audienceUrl(), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ slug, id }),
        });
        const data = await res.json();
        if (!cancelled && typeof data.viewers === "number") setViewers(data.viewers);
      } catch {
        // servidor de mídia inacessível: a contagem do Firestore continua valendo
      }
    };

    ping();
    const timer = setInterval(ping, 20000);
    return () => { cancelled = true; clearInterval(timer); };
  }, [slug, active]);

  return viewers;
}
