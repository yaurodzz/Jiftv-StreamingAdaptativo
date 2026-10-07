// Adapter unificado hls.js / dash.js / HLS nativo (Safari/iOS).
// Expõe uma API pequena e estável ao componente React, escondendo as
// diferenças de cada engine. Nada de UI aqui.
//
// URLs decidem a engine:
//   .m3u8 → hls.js quando o navegador tem MediaSource; senão HLS nativo (iPhone).
//   .mpd  → dash.js.
//   outro → <video> nativo (MP4 das gravações).
//
// Eventos emitidos:
//   "state"      → "connecting" | "live" | "reconnecting" | "nosignal"
//   "levels"     → Level[]                (novo set de qualidades)
//   "levelchange"→ { current: number|null, auto: boolean }
//   "latency"    → number (segundos) | null
//   "stats"      → { bandwidth, bitrate, buffer }  (bits/s, bits/s, segundos), a cada 1 s
//   "error"      → Error
//
// Level = { id: number, height: number, bitrate?: number, label: string }
//
// Métodos: setLevel(id | -1 auto), setAuto(), destroy().

import { loadHls } from "./loadHls.js";
import { loadDash } from "./loadDash.js";

function labelFor(height) {
  if (!height) return "auto";
  return height >= 2160 ? "4K" : `${height}p`;
}

function createEmitter() {
  const map = new Map();
  return {
    on(event, cb) {
      const list = map.get(event) || new Set();
      list.add(cb);
      map.set(event, list);
      return () => list.delete(cb);
    },
    emit(event, payload) {
      map.get(event)?.forEach((cb) => { try { cb(payload); } catch (_) {} });
    },
    clear() { map.clear(); },
  };
}

export function createPlayer({ video, url, timeUrl, live = true }) {
  const emitter = createEmitter();
  let engine = null;   // "hls" | "dash" | "native"
  let hls = null;
  let dash = null;
  let timers = [];
  let destroyed = false;
  let lastState = "connecting";
  let stallTimer = null;

  const setState = (s) => {
    if (destroyed || lastState === s) return;
    lastState = s;
    emitter.emit("state", s);
  };

  const scheduleStallWatch = () => {
    clearTimeout(stallTimer);
    stallTimer = setTimeout(() => setState("reconnecting"), 6000);
  };
  const cancelStallWatch = () => { clearTimeout(stallTimer); stallTimer = null; };

  // Listeners genéricos do elemento <video>.
  const onWaiting  = () => scheduleStallWatch();
  const onPlaying  = () => { cancelStallWatch(); setState("live"); };
  const onStalled  = () => scheduleStallWatch();
  const onError    = () => setState("nosignal");
  video.addEventListener("waiting", onWaiting);
  video.addEventListener("playing", onPlaying);
  video.addEventListener("stalled", onStalled);
  video.addEventListener("error", onError);

  // O navegador pausa vídeo mudo em aba escondida. Ao voltar para a aba, a transmissão
  // continua sozinha, a não ser que a pessoa tenha pausado de propósito.
  let pausedByUser = false;
  const onPause = () => { pausedByUser = !document.hidden; };
  const onPlay = () => { pausedByUser = false; };
  const onVisibility = () => {
    if (!document.hidden && live && video.paused && !pausedByUser) video.play?.()?.catch(() => {});
  };
  video.addEventListener("pause", onPause);
  video.addEventListener("play", onPlay);
  document.addEventListener("visibilitychange", onVisibility);

  const isMpd = /\.mpd(\?|$)/i.test(url);
  const isM3u8 = /\.m3u8(\?|$)/i.test(url);
  const hasMse = typeof window !== "undefined" && Boolean(window.MediaSource || window.ManagedMediaSource);

  // O atributo autoplay só vale no primeiro carregamento; depois de uma reconexão
  // (manifesto que ainda não existia, por exemplo) é preciso pedir o play de novo.
  const tryPlay = () => {
    if (live && !destroyed) video.play?.()?.catch(() => {});
  };

  const bufferAhead = () => {
    const b = video.buffered;
    return b.length ? Math.max(0, b.end(b.length - 1) - video.currentTime) : 0;
  };

  async function start() {
    setState("connecting");
    try {
      if (isMpd) {
        engine = "dash";
        await startDash();
      } else if (isM3u8 && hasMse) {
        engine = "hls";
        await startHls();
      } else {
        engine = "native";
        startNative();
      }
    } catch (err) {
      if (destroyed) return;
      emitter.emit("error", err);
      setState("nosignal");
    }
  }

  async function startHls() {
    const Hls = await loadHls();
    if (destroyed) return;
    if (!Hls.isSupported()) {
      engine = "native";
      startNative();
      return;
    }

    hls = new Hls({ enableWorker: true, liveSyncDurationCount: 3, backBufferLength: 60 });

    hls.on(Hls.Events.MANIFEST_PARSED, () => {
      const levels = hls.levels.map((l, i) => ({ id: i, height: l.height, bitrate: l.bitrate, label: labelFor(l.height) }));
      emitter.emit("levels", levels);
      emitter.emit("levelchange", { current: hls.currentLevel, auto: hls.autoLevelEnabled });
      tryPlay();
    });

    hls.on(Hls.Events.LEVEL_SWITCHED, (_e, data) => {
      emitter.emit("levelchange", { current: data.level, auto: hls.autoLevelEnabled });
    });

    // Antes da transmissão começar o manifesto ainda não existe: tenta de novo em vez de desistir.
    hls.on(Hls.Events.ERROR, (_e, data) => {
      if (!data?.fatal) return;
      if (data.type === Hls.ErrorTypes.NETWORK_ERROR) {
        setState("reconnecting");
        setTimeout(() => { if (!destroyed && hls) { hls.loadSource(url); hls.startLoad(); } }, 3000);
      } else if (data.type === Hls.ErrorTypes.MEDIA_ERROR) {
        setState("reconnecting");
        hls.recoverMediaError();
      } else {
        emitter.emit("error", new Error(data.details || "hls fatal"));
        setState("nosignal");
      }
    });

    hls.loadSource(url);
    hls.attachMedia(video);

    timers.push(setInterval(() => {
      if (!hls) return;
      if (typeof hls.latency === "number" && Number.isFinite(hls.latency) && live) emitter.emit("latency", hls.latency);
      emitter.emit("stats", {
        bandwidth: hls.bandwidthEstimate || null,
        bitrate: hls.levels?.[hls.currentLevel]?.bitrate || null,
        buffer: bufferAhead(),
      });
    }, 1000));
  }

  async function startDash() {
    const dashjs = await loadDash();
    if (destroyed) return;

    dash = dashjs.MediaPlayer().create();
    dash.updateSettings({
      debug: { logLevel: dashjs.Debug.LOG_LEVEL_NONE },
      streaming: {
        abr: { autoSwitchBitrate: { video: true } },
        delay: { liveDelay: 8 },
        // Relógio do servidor de mídia: evita erros quando o relógio do aparelho está errado.
        ...(timeUrl ? {
          utcSynchronization: {
            defaultTimingSource: { scheme: "urn:mpeg:dash:utc:http-xsdate:2014", value: timeUrl },
          },
        } : {}),
      },
    });

    const E = dashjs.MediaPlayer.events;
    dash.on(E.STREAM_INITIALIZED, () => {
      const infos = dash.getBitrateInfoListFor("video") || [];
      const levels = infos.map((b) => ({ id: b.qualityIndex, height: b.height, bitrate: b.bitrate, label: labelFor(b.height) }));
      emitter.emit("levels", levels);
      const auto = dash.getSettings()?.streaming?.abr?.autoSwitchBitrate?.video ?? true;
      emitter.emit("levelchange", { current: dash.getQualityFor("video"), auto });
      tryPlay();
    });

    dash.on(E.QUALITY_CHANGE_RENDERED, (evt) => {
      if (evt.mediaType !== "video") return;
      const auto = dash.getSettings()?.streaming?.abr?.autoSwitchBitrate?.video ?? true;
      emitter.emit("levelchange", { current: evt.newQuality, auto });
    });

    // Manifesto ainda inexistente (transmissão começando): recarrega em vez de desistir.
    dash.on(E.ERROR, (evt) => {
      emitter.emit("error", new Error(evt?.error?.message || "dash error"));
      setState("reconnecting");
      setTimeout(() => { if (!destroyed && dash) dash.attachSource(url); }, 3000);
    });

    dash.initialize(video, url, true);

    timers.push(setInterval(() => {
      if (!dash) return;
      try {
        const l = dash.getCurrentLiveLatency?.();
        if (live && typeof l === "number" && Number.isFinite(l) && l > 0) emitter.emit("latency", l);
        const list = dash.getBitrateInfoListFor("video") || [];
        const tp = dash.getAverageThroughput("video"); // kbps
        emitter.emit("stats", {
          bandwidth: tp ? tp * 1000 : null,
          bitrate: list[dash.getQualityFor("video")]?.bitrate || null,
          buffer: bufferAhead(),
        });
      } catch (_) {}
    }, 1000));
  }

  function startNative() {
    video.src = url;
    tryPlay();

    const emitNative = () => {
      const h = video.videoHeight;
      if (!h) return;
      emitter.emit("levels", [{ id: 0, height: h, label: labelFor(h) }]);
      emitter.emit("levelchange", { current: 0, auto: true });
    };
    video.addEventListener("loadedmetadata", emitNative);
    video.addEventListener("resize", emitNative);
    timers.push(setInterval(() => emitter.emit("stats", { bandwidth: null, bitrate: null, buffer: bufferAhead() }), 1000));
  }

  function setLevel(id) {
    if (engine === "hls" && hls) {
      hls.currentLevel = id; // -1 → auto
      emitter.emit("levelchange", { current: hls.currentLevel, auto: hls.autoLevelEnabled });
    } else if (engine === "dash" && dash) {
      const auto = id < 0;
      dash.updateSettings({ streaming: { abr: { autoSwitchBitrate: { video: auto } } } });
      if (!auto) dash.setQualityFor("video", id, true);
      emitter.emit("levelchange", { current: auto ? dash.getQualityFor("video") : id, auto });
    }
  }

  function destroy() {
    if (destroyed) return;
    destroyed = true;
    timers.forEach(clearInterval);
    timers = [];
    cancelStallWatch();
    video.removeEventListener("waiting", onWaiting);
    video.removeEventListener("playing", onPlaying);
    video.removeEventListener("stalled", onStalled);
    video.removeEventListener("error", onError);
    video.removeEventListener("pause", onPause);
    video.removeEventListener("play", onPlay);
    document.removeEventListener("visibilitychange", onVisibility);
    try { hls?.destroy(); } catch (_) {}
    try { dash?.reset(); } catch (_) {}
    hls = null;
    dash = null;
    try { video.removeAttribute("src"); video.load(); } catch (_) {}
    emitter.clear();
  }

  start();

  return {
    on: emitter.on,
    setLevel,
    setAuto: () => setLevel(-1),
    destroy,
    get engine() { return engine; },
  };
}
