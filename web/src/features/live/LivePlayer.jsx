import { useCallback, useEffect, useRef, useState } from "react";
import { Expand, Maximize2, Minimize2, Pause, Play, Volume2, VolumeX } from "lucide-react";
import { createPlayer } from "../../player/createPlayer.js";
import { timeUrl } from "../../lib/media.js";
import { useIsMobile } from "../../lib/useIsMobile.js";
import StatusOverlay from "./StatusOverlay.jsx";
import QualityMenu from "./QualityMenu.jsx";

// Player herói da página /live.
//   props.src             URL do manifesto (.m3u8 ou .mpd)
//   props.cinema          bool controlado externamente (modo cinema)
//   props.onToggleCinema  callback
//   props.onStats         recebe { protocol, height, width, auto, bandwidth, bitrate, buffer, latency }
//   props.compact         prévia do painel: sempre mudo, sem atalhos nem modo cinema
//   props.className       classes extras do contêiner (ex.: sem cantos no celular)
//
// Comportamento coberto:
//   - Autoplay mudo com CTA "Ativar som"
//   - Overlay glass com auto-hide após ~2.5s de inatividade
//   - Atalhos: c cinema · f fullscreen · m mudo
//   - No celular (useIsMobile) os controles nativos do <video> dão lugar a uma barra própria,
//     com botões de 44px: pausar, som, qualidade e tela cheia. Um toque no vídeo mostra ou
//     esconde a barra; escondida, ela não recebe toques. O desktop segue com os controles nativos.
//   - Cleanup completo do adapter no unmount / troca de src.

const HIDE_MS = 2500;

export default function LivePlayer({ src, cinema = false, onToggleCinema, onStats, compact = false, className = "" }) {
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
  const [menuOpen, setMenuOpen]             = useState(false);
  const [paused, setPaused]                 = useState(true);
  const touchUi = useIsMobile() && !compact;
  const touchUiRef = useRef(touchUi);
  touchUiRef.current = touchUi;
  const liveGap = useRef(null);
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
    } else if (el.requestFullscreen) {
      await el.requestFullscreen();
      // Celular: deita a tela junto com a tela cheia (onde o navegador permite).
      if (touchUiRef.current) {
        try { await window.screen.orientation?.lock?.("landscape"); } catch { /* sem suporte */ }
      }
    } else {
      // iPhone: só o próprio <video> entra em tela cheia.
      videoRef.current?.webkitEnterFullscreen?.();
    }
  }, []);

  // Pausar/retomar pela barra de toque. Numa transmissão ao vivo, retomar volta para o ponto
  // ao vivo (mesma distância da borda que havia ao pausar) em vez de continuar atrasado.
  const togglePlay = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    const r = v.seekable;
    const edge = r.length ? r.end(r.length - 1) : null;
    if (v.paused) {
      if (edge != null && liveGap.current != null) {
        const target = edge - liveGap.current;
        if (target > v.currentTime + 1) v.currentTime = target;
      }
      v.play()?.catch(() => {});
    } else {
      liveGap.current = edge != null ? Math.max(0, edge - v.currentTime) : null;
      v.pause();
    }
  }, []);

  // Toque no vídeo (celular): mostra a barra, ou esconde se já estava à vista.
  const toggleOverlay = useCallback(() => {
    if (overlayVisible) {
      clearTimeout(hideTimer.current);
      setOverlayVisible(false);
    } else {
      nudge();
    }
  }, [overlayVisible, nudge]);

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

  // Barra de toque à vista: enquanto pausado ou com o menu aberto ela não some sozinha.
  const barVisible = overlayVisible || menuOpen || paused;
  const barButton = "grid h-11 w-11 shrink-0 place-items-center rounded-full active:bg-white/15";

  return (
    <div
      ref={containerRef}
      className={
        "relative overflow-hidden rounded-2xl border border-line bg-black " +
        (cinema ? "shadow-glow " : "") +
        (touchUi && isFullscreen ? "flex items-center justify-center " : "") +
        className
      }
      // No toque quem controla a barra é o clique (ver toggleOverlay): mostrar no touchstart
      // deixaria o mesmo toque acertar um botão que ainda estava invisível.
      onMouseMove={touchUi ? undefined : nudge}
      onTouchStart={touchUi ? undefined : nudge}
      onFocus={nudge}
    >
      <video
        ref={videoRef}
        className={touchUi && isFullscreen ? "h-full w-full bg-black object-contain" : "aspect-video w-full bg-black"}
        playsInline
        autoPlay
        muted={compact || muted}
        controls={!compact && !touchUi}
        onPlay={() => setPaused(false)}
        onPause={() => setPaused(true)}
        onVolumeChange={(e) => { if (touchUi) setMuted(e.currentTarget.muted); }}
      />

      <StatusOverlay
        state={state}
        height={currentHeight}
        auto={auto}
        latency={latency}
        visible={(touchUi ? barVisible : overlayVisible) || state !== "live"}
      />

      {touchUi && (
        <>
          <div aria-hidden="true" onClick={toggleOverlay} className="absolute inset-0 z-[5]" />
          <div
            onClick={nudge}
            className={
              "absolute inset-x-0 bottom-0 flex items-center gap-1 bg-gradient-to-t from-black/80 via-black/40 to-transparent " +
              // Com o menu aberto a barra sobe de camada: a folha de qualidade cobre a navegação inferior.
              (menuOpen ? "z-50 " : "z-10 ") +
              "pb-[max(0.25rem,env(safe-area-inset-bottom))] pl-[max(0.25rem,env(safe-area-inset-left))] pr-[max(0.25rem,env(safe-area-inset-right))] pt-8 " +
              "text-white transition-opacity duration-300 " +
              (barVisible ? "opacity-100" : "pointer-events-none opacity-0")
            }
          >
            <button type="button" onClick={togglePlay} aria-label={paused ? "Reproduzir" : "Pausar"} className={barButton}>
              {paused ? <Play size={22} fill="currentColor" /> : <Pause size={22} fill="currentColor" />}
            </button>
            <button type="button" onClick={toggleMute} aria-label={muted ? "Ativar som" : "Silenciar"} aria-pressed={!muted} className={barButton}>
              {muted ? <VolumeX size={22} /> : <Volume2 size={22} />}
            </button>

            <div className="ml-auto flex items-center gap-1">
              <QualityMenu
                levels={levels}
                currentId={currentId}
                auto={auto}
                onSelect={(id) => adapterRef.current?.setLevel(id)}
                onOpenChange={setMenuOpen}
                buttonClassName="inline-flex min-h-11 items-center gap-1.5 rounded-full px-3 text-sm font-medium text-white active:bg-white/15"
              />
              <button
                type="button"
                onClick={toggleFullscreen}
                aria-label={isFullscreen ? "Sair da tela cheia" : "Tela cheia"}
                className={barButton}
              >
                {isFullscreen ? <Minimize2 size={20} /> : <Maximize2 size={20} />}
              </button>
            </div>
          </div>
        </>
      )}

      {!compact && !touchUi && (
        <div
          className={
            "pointer-events-none absolute bottom-14 right-3 z-10 flex items-center gap-2 " +
            "transition-opacity duration-300 " +
            (overlayVisible || menuOpen ? "opacity-100" : "opacity-0")
          }
        >
          <div className="pointer-events-auto">
            <QualityMenu
              levels={levels}
              currentId={currentId}
              auto={auto}
              onSelect={(id) => adapterRef.current?.setLevel(id)}
              onOpenChange={setMenuOpen}
            />
          </div>

          {onToggleCinema && (
            <button
              type="button"
              onClick={onToggleCinema}
              aria-label={cinema ? "Sair do modo cinema" : "Modo cinema"}
              title="Modo cinema (C)"
              className="pointer-events-auto glass inline-flex h-8 w-8 items-center justify-center rounded-full border text-fg hover:border-accent/60 max-md:h-11 max-md:w-11"
            >
              {cinema ? <Minimize2 size={14} /> : <Expand size={14} />}
            </button>
          )}

          <button
            type="button"
            onClick={toggleFullscreen}
            aria-label={isFullscreen ? "Sair da tela cheia" : "Tela cheia"}
            title="Tela cheia (F)"
            className="pointer-events-auto glass inline-flex h-8 w-8 items-center justify-center rounded-full border text-fg hover:border-accent/60 max-md:h-11 max-md:w-11"
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
          className="absolute bottom-14 left-[max(0.75rem,env(safe-area-inset-left))] z-10 inline-flex items-center gap-2 rounded-full bg-accent px-3 py-1.5 text-xs font-medium text-white hover:brightness-110 max-md:min-h-11 max-md:px-4 max-md:text-sm"
        >
          <VolumeX size={14} />
          Ativar som
        </button>
      )}
    </div>
  );
}
