import { useEffect, useState } from "react";
import { ExternalLink, Pause, Play, RotateCcw, Users, X } from "lucide-react";
import {
  clockMs, formatClock, pauseClock, PERIOD_MAX, readOverlay, setClock, setLineup,
  setPeriod, setScoreboardVisible, startClock,
} from "../../services/overlay.js";
import { useNow, useServerOffset } from "../../lib/serverClock.js";
import { cleanRoster, hasTeams } from "../live/roster.js";
import { useToast } from "./ToastProvider.jsx";
import { useClipboard } from "./useClipboard.js";

const PERIODS = ["1º tempo", "2º tempo", "Intervalo", "Prorrogação", "Fim de jogo"];

// Endereço da página de gráficos desta transmissão, para a fonte "Navegador" do OBS.
export const overlayUrl = (stream) => `${window.location.origin}/overlay/${stream.slug}`;

// Controle dos gráficos que aparecem DENTRO do vídeo (página /overlay/:slug aberta no OBS):
// placar no canto, cronômetro, período e a tela de escalação. Cada botão grava em
// `streams/{id}.overlay` e o OBS reage em menos de um segundo, de qualquer rede.
// Os pontos do placar continuam no cartão "Placar" desta mesma tela.
export default function BroadcastGraphicsCard({ stream }) {
  const toast = useToast();
  const clip = useClipboard();
  const overlay = readOverlay(stream);
  const offset = useServerOffset();
  const now = useNow(offset, overlay.clock.running);
  const [period, setPeriodText] = useState(overlay.period);
  useEffect(() => setPeriodText(overlay.period), [overlay.period]);

  const url = overlayUrl(stream);
  const teams = hasTeams(stream);
  const roster = cleanRoster(stream.roster);
  const countA = roster.filter((e) => e.team === "A").length;
  const countB = roster.length - countA;
  const elapsed = clockMs(overlay.clock, now);

  const run = (promise) => promise.catch((err) => toast.error(err.message || "Não foi possível atualizar os gráficos."));
  const serverNow = () => Date.now() + offset;
  const savePeriod = (value) => { if (value.trim() !== overlay.period) run(setPeriod(stream.id, value)); };

  const lineupOptions = teams
    ? [
      { mode: "A", label: stream.teamA || "Equipe A", count: countA },
      { mode: "B", label: stream.teamB || "Equipe B", count: countB },
      { mode: "all", label: "As duas equipes", count: countA && countB ? roster.length : 0 },
    ]
    : [{ mode: "all", label: "Elenco", count: roster.length }];

  return (
    <section className="rounded-2xl border border-line bg-surface p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-semibold">Gráficos no vídeo (OBS)</h3>
        <a href={`${url}?fundo=1`} target="_blank" rel="noreferrer" className="tap inline-flex items-center gap-1 text-sm text-accent hover:underline">
          <ExternalLink size={14} /> Ver como está
        </a>
      </div>
      <p className="mt-1 text-sm text-muted">
        Placar e tela de escalação desenhados por cima do jogo. No OBS, adicione uma fonte <b className="text-fg">Navegador</b> de 1920×1080 com este endereço
        (ou use o botão do cartão “Controlar o OBS”).
      </p>
      <div className="mt-2 flex gap-2">
        <input readOnly value={url} className="input font-mono text-xs" aria-label="Endereço dos gráficos para o OBS" onFocus={(e) => e.target.select()} />
        <button type="button" onClick={() => clip.copy(url).then((ok) => ok && toast.info("Endereço copiado"))} className="btn-ghost btn-sm shrink-0">
          {clip.copied ? "Copiado" : "Copiar"}
        </button>
      </div>

      {/* Tela de escalação */}
      <div className="mt-5 border-t border-line pt-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h4 className="flex items-center gap-2 text-sm font-semibold">
            <Users size={15} /> Tela de escalação
            {overlay.lineup && <span className="badge bg-live/10 text-live"><span className="h-1.5 w-1.5 animate-live-pulse rounded-full bg-live" /> No ar</span>}
          </h4>
          {overlay.lineup && (
            <button type="button" onClick={() => run(setLineup(stream.id, null))} className="btn-danger btn-sm"><X size={14} /> Tirar do ar</button>
          )}
        </div>
        {roster.length === 0 ? (
          <p className="mt-2 text-sm text-muted">Monte o elenco da partida no cartão “Elenco” para liberar a tela de escalação.</p>
        ) : (
          <div className="mt-3 flex flex-wrap gap-2">
            {lineupOptions.map((option) => (
              <button
                key={option.mode}
                type="button"
                disabled={option.count === 0}
                aria-pressed={overlay.lineup === option.mode}
                onClick={() => run(setLineup(stream.id, overlay.lineup === option.mode ? null : option.mode))}
                className={(overlay.lineup === option.mode ? "btn-primary" : "btn-ghost") + " max-w-full disabled:opacity-40"}
              >
                <span className="truncate">{option.label}</span>
                {option.mode !== "all" && <span className="text-xs opacity-70">{option.count}</span>}
              </button>
            ))}
          </div>
        )}
        <p className="mt-2 text-xs text-muted">A escalação cobre a tela inteira e esconde o placar enquanto estiver no ar. Só atletas aprovados aparecem.</p>
      </div>

      {/* Placar no vídeo */}
      <div className="mt-5 border-t border-line pt-4">
        <label className="flex cursor-pointer items-center justify-between gap-3 text-sm">
          <span>
            <span className="font-semibold">Placar no vídeo</span>
            <span className="block text-xs text-muted">
              {teams ? "Equipes, pontos, cronômetro e período no canto da imagem." : "Preencha as equipes em Editar para ativar o placar."}
            </span>
          </span>
          <button
            type="button"
            role="switch"
            aria-checked={overlay.scoreboard && teams}
            disabled={!teams}
            onClick={() => run(setScoreboardVisible(stream.id, !overlay.scoreboard))}
            className={"relative h-6 w-11 shrink-0 rounded-full transition-colors disabled:opacity-50 before:absolute before:-inset-2.5 md:before:hidden " + (overlay.scoreboard && teams ? "bg-accent" : "border border-line bg-elevated")}
          >
            <span className={"absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform " + (overlay.scoreboard && teams ? "translate-x-5" : "translate-x-0.5")} />
          </button>
        </label>

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <b className="min-w-[5ch] text-4xl font-semibold tabular-nums" aria-label="Cronômetro">{formatClock(elapsed)}</b>
          {overlay.clock.running ? (
            <button type="button" onClick={() => run(pauseClock(stream.id, overlay.clock, serverNow()))} className="btn-ghost"><Pause size={15} /> Pausar</button>
          ) : (
            <button type="button" onClick={() => run(startClock(stream.id, overlay.clock, serverNow()))} className="btn-primary"><Play size={15} /> {elapsed > 0 ? "Continuar" : "Iniciar"}</button>
          )}
          <button type="button" onClick={() => run(setClock(stream.id, overlay.clock, serverNow(), elapsed - 60000))} className="btn-ghost btn-sm" aria-label="Tirar um minuto do cronômetro">−1 min</button>
          <button type="button" onClick={() => run(setClock(stream.id, overlay.clock, serverNow(), elapsed + 60000))} className="btn-ghost btn-sm" aria-label="Somar um minuto ao cronômetro">+1 min</button>
          <button type="button" onClick={() => run(setClock(stream.id, { ...overlay.clock, running: false }, serverNow(), 0))} className="btn-ghost btn-sm"><RotateCcw size={13} /> Zerar</button>
        </div>
        <p className="mt-1 text-xs text-muted">Zerado e parado, o cronômetro não aparece no vídeo.</p>

        <label className="mt-4 block">
          <span className="label">Período</span>
          <input
            className="input"
            value={period}
            maxLength={PERIOD_MAX}
            placeholder="Ex.: 1º tempo (vazio não mostra)"
            onChange={(e) => setPeriodText(e.target.value)}
            onBlur={(e) => savePeriod(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }}
          />
        </label>
        <div className="mt-2 flex flex-wrap gap-2">
          {PERIODS.map((name) => (
            <button
              key={name}
              type="button"
              aria-pressed={overlay.period === name}
              onClick={() => run(setPeriod(stream.id, overlay.period === name ? "" : name))}
              className={"btn-sm rounded-full border font-medium transition-colors max-md:min-h-11 " + (overlay.period === name ? "border-accent bg-accent/10 text-accent" : "border-line text-muted hover:text-fg")}
            >
              {name}
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}
