import { useCallback, useEffect, useRef, useState } from "react";
import { Expand, Maximize2, Minimize2, VolumeX } from "lucide-react";
import { createPlayer } from "../../player/createPlayer.js";
import { timeUrl } from "../../lib/media.js";
import StatusOverlay from "./StatusOverlay.jsx";
import QualityMenu from "./QualityMenu.jsx";

// Player herói da página /live.
//   props.src             URL do manifesto (.m3u8 ou .mpd)
//   props.cinema          bool controlado externamente (modo cinema)
//   props.onToggleCinema  callback
//   props.onStats         recebe { protocol, height, width, auto, bandwidth, bitrate, buffer, latency }
//   props.compact         prévia do painel: sempre mudo, sem atalhos nem modo cinema
//
// Comportamento coberto:
//   - Autoplay mudo com CTA "Ativar som"
//   - Overlay glass com auto-hide após ~2.5s de inatividade
//   - Atalhos: c cinema · f fullscreen · m mudo
//   - Cleanup completo do adapter no unmount / troca de src.

const HIDE_MS = 2500;

export default function LivePlayer({ src, cinema = false, onToggleCinema, onStats, compact = false }) {
  const videoRef = useRef(null);
  const containerRef = useRef(null);
  const hideTimer = useRef(null);
  const statsRef = useRef(onStats);
  statsRef.current = onStats;

  const [state, setState]         = useState("connecting");
  const [levels, setLevels]       = useState([]);
  const [currentId, setCurrentId] = useState(-1);
  const [auto, setAuto]           = useState(true);
  const [latency, setLatency]     = useState(null);
  const [muted, setMuted]         = useState(true);
  const [overlayVisible, setOverlayVisible] = useState(true);
  const [isFullscreen, setIsFullscreen]     = useState(false);
  const adapterRef = useRef(null);
  const infoRef = useRef({ auto: true, latency: null });

  // Ciclo de vida do adapter.
  useEffect(() => {
    if (!src || !videoRef.current) return;
    const adapter = createPlayer({ video: videoRef.current, url: src, timeUrl: timeUrl() });
    adapterRef.current = adapter;
    setLevels([]);
    setLatency(null);

    const offs = [
      adapter.on("state",       setState),
      adapter.on("levels",      setLevels),
      adapter.on("levelchange", ({ current, auto: isAuto }) => {
        setCurrentId(current);
        setAuto(isAuto);
        infoRef.current.auto = isAuto;
      }),
      adapter.on("latency", (l) => { setLatency(l); infoRef.current.latency = l; }),
      adapter.on("stats", (s) => {
        const v = videoRef.current;
        statsRef.current?.({
          protocol: adapter.engine === "dash" ? "DASH" : "HLS",
          width: v?.videoWidth || null,
          height: v?.videoHeight || null,
          auto: infoRef.current.auto,
          latency: infoRef.current.latency,
          ...s,
        });
      }),
      adapter.on("error",   (e) => console.warn("[LivePlayer]", e)),
    ];

    return () => {
      offs.forEach((off) => off?.());
      adapter.destroy();
      adapterRef.current = null;
    };
  }, [src]);

  // Auto-hide do overlay.
  const nudge = useCallback(() => {
    setOverlayVisible(true);
    clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => setOverlayVisible(false), HIDE_MS);
  }, []);

  useEffect(() => {
    nudge();
    return () => clearTimeout(hideTimer.current);
  }, [nudge]);

  const toggleFullscreen = useCallback(async () => {
    const el = containerRef.current;
    if (!el) return;
    if (document.fullscreenElement) {
      await document.exitFullscreen();
    } else {
      await el.requestFullscreen?.();
    }
  }, []);

  const toggleMute = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    v.muted = !v.muted;
    setMuted(v.muted);
  }, []);

  useEffect(() => {
    const onFs = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", onFs);
    return () => document.removeEventListener("fullscreenchange", onFs);
  }, []);

  // Atalhos de teclado (só no player principal).
  useEffect(() => {
    if (compact) return undefined;
    const onKey = (e) => {
      const t = e.target;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable)) return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.key === "c" || e.key === "C") { e.preventDefault(); onToggleCinema?.(); }
      if (e.key === "f" || e.key === "F") { e.preventDefault(); toggleFullscreen(); }
      if (e.key === "m" || e.key === "M") { e.preventDefault(); toggleMute(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [compact, onToggleCinema, toggleFullscreen, toggleMute]);

  const currentHeight = levels.find((l) => l.id === currentId)?.height ?? null;

  return (
    <div
      ref={containerRef}
      className={
        "relative overflow-hidden rounded-2xl border border-line bg-black " +
        (cinema ? "shadow-glow" : "")
      }
      onMouseMove={nudge}
      onTouchStart={nudge}
      onFocus={nudge}
    >
      <video
        ref={videoRef}
        className="aspect-video w-full bg-black"
        playsInline
        autoPlay
        muted={compact || muted}
        controls={!compact}
      />

      <StatusOverlay
        state={state}
        height={currentHeight}
        auto={auto}
        latency={latency}
        visible={overlayVisible || state !== "live"}
      />

      {!compact && (
        <div
          className={
            "pointer-events-none absolute bottom-14 right-3 z-10 flex items-center gap-2 " +
            "transition-opacity duration-300 " +
            (overlayVisible ? "opacity-100" : "opacity-0")
          }
        >
          <div className="pointer-events-auto">
            <QualityMenu
              levels={levels}
              currentId={currentId}
              auto={auto}
              onSelect={(id) => adapterRef.current?.setLevel(id)}
            />
          </div>

          {onToggleCinema && (
            <button
              type="button"
              onClick={onToggleCinema}
              aria-label={cinema ? "Sair do modo cinema" : "Modo cinema"}
              title="Modo cinema (C)"
              className="pointer-events-auto glass inline-flex h-8 w-8 items-center justify-center rounded-full border text-fg hover:border-accent/60"
            >
              {cinema ? <Minimize2 size={14} /> : <Expand size={14} />}
            </button>
          )}

          <button
            type="button"
            onClick={toggleFullscreen}
            aria-label={isFullscreen ? "Sair da tela cheia" : "Tela cheia"}
            title="Tela cheia (F)"
            className="pointer-events-auto glass inline-flex h-8 w-8 items-center justify-center rounded-full border text-fg hover:border-accent/60"
          >
            <Maximize2 size={14} />
          </button>
        </div>
      )}

      {/* CTA para ativar o som quando o autoplay é mudo. */}
      {!compact && muted && state === "live" && (
        <button
          type="button"
          onClick={toggleMute}
          className="absolute bottom-14 left-3 z-10 inline-flex items-center gap-2 rounded-full bg-accent px-3 py-1.5 text-xs font-medium text-white hover:brightness-110"
        >
          <VolumeX size={14} />
          Ativar som
        </button>
      )}
    </div>
  );
}
