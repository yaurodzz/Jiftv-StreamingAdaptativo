import { doc, updateDoc } from "firebase/firestore";
import { db } from "../lib/firebase.js";

// Gráficos da transmissão desenhados dentro do OBS (página /overlay/:slug, fonte "Navegador").
// O estado fica em `streams/{id}.overlay`, que o painel escreve e a página do OBS escuta:
//   scoreboard  mostra o placar no canto do vídeo (padrão: ligado)
//   lineup      tela de escalação no ar: null | "A" | "B" | "all"
//   period      texto ao lado do cronômetro ("1º tempo", "Intervalo"…)
//   clock       { running, baseMs, startedAt }: tempo = baseMs + (agora - startedAt, se rodando)
// O placar em si continua em scoreA/scoreB e o elenco em `roster` (ver features/live/roster.js).

export const PERIOD_MAX = 24;

export function readOverlay(stream) {
  const raw = stream?.overlay || {};
  const clock = raw.clock || {};
  return {
    scoreboard: raw.scoreboard !== false,
    lineup: ["A", "B", "all"].includes(raw.lineup) ? raw.lineup : null,
    period: typeof raw.period === "string" ? raw.period.slice(0, PERIOD_MAX) : "",
    clock: {
      running: Boolean(clock.running) && Number.isFinite(clock.startedAt),
      baseMs: Number.isFinite(clock.baseMs) ? Math.max(0, clock.baseMs) : 0,
      startedAt: Number.isFinite(clock.startedAt) ? clock.startedAt : null,
    },
  };
}

export function clockMs(clock, now) {
  return Math.max(0, clock.baseMs + (clock.running ? now - clock.startedAt : 0));
}

// O cronômetro aparece quando está rodando ou parado com algum tempo marcado.
export const clockVisible = (clock) => clock.running || clock.baseMs > 0;

export function formatClock(ms) {
  const total = Math.floor(ms / 1000);
  const pad = (n) => String(n).padStart(2, "0");
  return `${pad(Math.floor(total / 60))}:${pad(total % 60)}`;
}

const patch = (id, fields) => updateDoc(doc(db, "streams", id), fields);

export const setScoreboardVisible = (id, visible) => patch(id, { "overlay.scoreboard": Boolean(visible) });
export const setLineup = (id, mode) => patch(id, { "overlay.lineup": mode || null });
export const setPeriod = (id, period) => patch(id, { "overlay.period": String(period || "").trim().slice(0, PERIOD_MAX) });

// `now` é a hora corrigida pelo servidor (lib/serverClock.js).
export const startClock = (id, clock, now) =>
  patch(id, { "overlay.clock": { running: true, baseMs: clockMs(clock, now), startedAt: now } });
export const pauseClock = (id, clock, now) =>
  patch(id, { "overlay.clock": { running: false, baseMs: clockMs(clock, now), startedAt: null } });
export const setClock = (id, clock, now, ms) =>
  patch(id, { "overlay.clock": { running: clock.running, baseMs: Math.max(0, ms), startedAt: clock.running ? now : null } });
