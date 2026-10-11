import { useCallback, useEffect, useRef, useState } from "react";
import { env } from "../../lib/env.js";
import { currentIdToken } from "../../providers/AuthProvider.jsx";

// Transmite a câmera deste aparelho para o servidor pelo navegador.
// O MediaRecorder grava a câmera em pedaços e cada pedaço segue por WebSocket para o worker
// (wss://api.jiftv.org/api/camera/<id>), que publica no servidor de mídia como se fosse o OBS.
// WebSocket passa pelo túnel HTTPS da Cloudflare; o RTMP (porta 1935) não passa.

export const QUALITIES = [
  { id: "720",  label: "720p · 2,5 Mbps (recomendado no 4G)", width: 1280, height: 720,  bps: 2_500_000 },
  { id: "1080", label: "1080p · 4,5 Mbps (Wi-Fi ou 4G forte)", width: 1920, height: 1080, bps: 4_500_000 },
  { id: "480",  label: "480p · 1,2 Mbps (rede fraca)",         width: 854,  height: 480,  bps: 1_200_000 },
];

// Em ordem de preferência. Com H.264 o servidor repassa o vídeo sem recodificar.
const MIMES = [
  "video/mp4;codecs=avc1.42E01F,mp4a.40.2",
  "video/webm;codecs=h264,opus",
  "video/mp4",
  "video/webm;codecs=vp8,opus",
  "video/webm",
];

const MAX_RETRIES = 5;

export const cameraSupported = () =>
  typeof window !== "undefined" && Boolean(navigator.mediaDevices?.getUserMedia) && typeof window.MediaRecorder === "function";

function cameraError(err) {
  if (err?.name === "NotAllowedError") return "Permita o uso da câmera e do microfone nas configurações do navegador.";
  if (err?.name === "NotFoundError") return "Nenhuma câmera encontrada neste aparelho.";
  if (err?.name === "NotReadableError") return "A câmera está em uso por outro aplicativo.";
  return "Não foi possível abrir a câmera.";
}

// status: "idle" | "connecting" | "live" | "reconnecting"
export function useCameraBroadcast(streamId) {
  const videoRef = useRef(null);
  const media = useRef(null);
  const ws = useRef(null);
  const recorder = useRef(null);
  const wanted = useRef(false);   // o operador pediu para transmitir (e ainda não parou)
  const retries = useRef(0);
  const liveSince = useRef(0);
  const retryTimer = useRef(null);
  const wakeLock = useRef(null);
  const options = useRef({ compat: false, bps: QUALITIES[0].bps });

  const [facing, setFacing] = useState("environment");
  const [quality, setQuality] = useState(QUALITIES[0].id);
  const [ready, setReady] = useState(false);
  const [status, setStatus] = useState("idle");
  const [error, setError] = useState("");
  const [stats, setStats] = useState({ bytes: 0, queued: 0, since: null, video: null });

  // Abre (ou troca) a câmera. Fora do ar: com a transmissão rodando a câmera não muda.
  useEffect(() => {
    if (!cameraSupported()) return undefined;
    let cancelled = false;
    const q = QUALITIES.find((x) => x.id === quality) || QUALITIES[0];
    options.current.bps = q.bps;
    setReady(false);
    navigator.mediaDevices
      .getUserMedia({
        video: { facingMode: { ideal: facing }, width: { ideal: q.width }, height: { ideal: q.height }, frameRate: { ideal: 30 } },
        audio: { echoCancellation: false },
      })
      .then((stream) => {
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        media.current = stream;
        if (videoRef.current) videoRef.current.srcObject = stream;
        setReady(true);
        setError("");
      })
      .catch((err) => !cancelled && setError(cameraError(err)));
    return () => {
      cancelled = true;
      media.current?.getTracks().forEach((t) => t.stop());
      media.current = null;
    };
  }, [facing, quality]);

  // O <video> da prévia pode entrar na tela depois de a câmera abrir (a página ainda carregava)
  const attachPreview = useCallback((el) => {
    videoRef.current = el;
    if (el && media.current) el.srcObject = media.current;
  }, []);

  const releaseWakeLock = () => {
    wakeLock.current?.release?.().catch(() => {});
    wakeLock.current = null;
  };
  const keepAwake = useCallback(async () => {
    try {
      wakeLock.current = await navigator.wakeLock?.request("screen");
    } catch {
      // sem suporte ou negado: a transmissão segue, mas a tela pode apagar
    }
  }, []);

  const teardown = () => {
    clearTimeout(retryTimer.current);
    const rec = recorder.current;
    recorder.current = null;
    if (rec && rec.state !== "inactive") {
      try { rec.stop(); } catch { /* já parado */ }
    }
    const socket = ws.current;
    ws.current = null;
    if (socket) {
      socket.onclose = null;
      socket.onmessage = null;
      try { socket.close(); } catch { /* já fechado */ }
    }
  };

  const stop = useCallback((message = "") => {
    wanted.current = false;
    teardown();
    releaseWakeLock();
    setStatus("idle");
    if (message) setError(message);
  }, []);

  const connect = useCallback(async () => {
    const mimeType = MIMES.find((m) => MediaRecorder.isTypeSupported(m)) || "";
    let token;
    try {
      token = await currentIdToken();
    } catch {
      token = null;
    }
    if (!wanted.current) return;
    if (!token) return stop("Entre de novo no painel para transmitir.");

    const socket = new WebSocket(`${env.apiUrl.replace(/^http/, "ws")}/api/camera/${encodeURIComponent(streamId)}`);
    ws.current = socket;
    socket.onopen = () => socket.send(JSON.stringify({ token, mime: mimeType, recodificar: options.current.compat }));

    socket.onmessage = (ev) => {
      let msg = {};
      try { msg = JSON.parse(ev.data); } catch { /* ignora */ }
      // Recusa do servidor (chave bloqueada, já no ar...): não adianta tentar de novo
      if (msg.erro && !recorder.current) return stop(msg.erro);
      if (!msg.ok || !media.current) return undefined;

      // Um MediaRecorder novo a cada conexão: o primeiro pedaço traz o cabeçalho do vídeo
      const rec = new MediaRecorder(media.current, {
        ...(mimeType ? { mimeType } : {}),
        videoBitsPerSecond: options.current.bps,
        audioBitsPerSecond: 128_000,
      });
      recorder.current = rec;
      rec.ondataavailable = (e) => {
        if (!e.data.size || socket.readyState !== WebSocket.OPEN) return;
        socket.send(e.data);
        setStats((s) => ({ ...s, bytes: s.bytes + e.data.size, queued: socket.bufferedAmount }));
      };
      rec.start(250);
      liveSince.current = Date.now();
      setStats((s) => ({ ...s, since: s.since || Date.now(), video: msg.video }));
      setStatus("live");
      setError("");
      return undefined;
    };

    // Queda de rede (troca de antena, túnel): tenta voltar sozinho algumas vezes
    socket.onclose = () => {
      if (ws.current !== socket || !wanted.current) return;
      // Só zera as tentativas se a conexão durou: evita ficar reconectando sem parar
      if (recorder.current && Date.now() - liveSince.current > 30_000) retries.current = 0;
      teardown();
      if (retries.current >= MAX_RETRIES) return stop("A conexão com o servidor caiu. Confira a internet do celular e transmita de novo.");
      retries.current += 1;
      setStatus("reconnecting");
      retryTimer.current = setTimeout(connect, 3000);
    };
  }, [streamId, stop]);

  const start = useCallback(({ compat = false } = {}) => {
    if (!media.current || wanted.current) return;
    options.current.compat = compat;
    wanted.current = true;
    retries.current = 0;
    setError("");
    setStats({ bytes: 0, queued: 0, since: null, video: null });
    setStatus("connecting");
    keepAwake();
    connect();
  }, [connect, keepAwake]);

  // A trava de tela se solta quando a página sai da frente: pede de novo ao voltar
  useEffect(() => {
    const onVisible = () => document.visibilityState === "visible" && wanted.current && keepAwake();
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [keepAwake]);

  useEffect(() => () => {
    wanted.current = false;
    teardown();
    releaseWakeLock();
  }, []);

  return { attachPreview, ready, status, error, stats, facing, setFacing, quality, setQuality, start, stop };
}
