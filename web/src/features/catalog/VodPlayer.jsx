import { useEffect, useRef } from "react";
import { createPlayer } from "../../player/createPlayer.js";

// Player de gravação (VOD). Usa o mesmo adapter unificado (hls.js/dash.js/nativo são
// carregados sob demanda), mas sem overlay ao vivo nem menu de qualidade: o MP4 inteiro
// tem uma qualidade só e o controle nativo do <video> é suficiente.
export default function VodPlayer({ src, poster, onPlay }) {
  const videoRef = useRef(null);

  useEffect(() => {
    if (!src || !videoRef.current) return undefined;
    const adapter = createPlayer({ video: videoRef.current, url: src, live: false });
    return () => adapter.destroy();
  }, [src]);

  return (
    <div className="overflow-hidden rounded-2xl border border-line bg-black">
      <video
        ref={videoRef}
        poster={poster || undefined}
        controls
        playsInline
        preload="metadata"
        onPlay={onPlay}
        className="aspect-video w-full bg-black"
      />
    </div>
  );
}
