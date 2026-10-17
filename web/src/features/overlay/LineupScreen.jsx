import { useEffect, useState } from "react";
import { athletePhoto } from "../../lib/media.js";
import { rosterTeams } from "../live/roster.js";

// Tela de escalação em tela cheia (1920×1080), como nas transmissões de futebol: nome da
// equipe em destaque e um cartão por atleta com foto, número e nome.
// `mode`: null (fora do ar) | "A" | "B" | "all". O conteúdo do último modo continua montado
// enquanto a tela some, para a saída ser suave.

const GAP = 20;
const CARD_RATIO = 1.34; // altura / largura do cartão (foto quadrada + faixa do nome)
const CARD_MAX = 250;

// Maior cartão que faz `count` atletas caberem numa área de `width` × `height`.
function fit(count, width, height) {
  let best = { cols: 1, card: 0 };
  for (let cols = 1; cols <= Math.max(1, count); cols += 1) {
    const rows = Math.ceil(count / cols);
    const card = Math.min(
      (width - GAP * (cols - 1)) / cols,
      (height - GAP * (rows - 1)) / rows / CARD_RATIO,
      CARD_MAX,
    );
    if (card > best.card) best = { cols, card };
  }
  // Mesmo número de linhas, mas com as linhas equilibradas (8 atletas: 4 + 4, não 6 + 2).
  const rows = Math.ceil(count / best.cols);
  return { cols: Math.ceil(count / rows), card: best.card };
}

// Nome curto para caber no cartão: apelido, ou primeiro e último nome.
function shortName(athlete) {
  if (athlete.nickname) return athlete.nickname;
  const parts = (athlete.name || "").trim().split(/\s+/);
  return parts.length > 2 ? `${parts[0]} ${parts[parts.length - 1]}` : parts.join(" ");
}

export default function LineupScreen({ stream, athletesById, mode }) {
  const [shown, setShown] = useState(mode);
  const [run, setRun] = useState(0);
  useEffect(() => {
    if (!mode) return;
    setShown(mode);
    setRun((n) => n + 1); // reinicia a entrada dos cartões
  }, [mode]);

  const all = rosterTeams(stream, athletesById);
  const teams = shown === "A" || shown === "B" ? all.filter((t) => t.key === shown || t.key === "all") : all;
  const on = Boolean(mode) && teams.length > 0;
  const single = teams.length === 1;
  const subtitle = [stream.modalityName, stream.title].filter(Boolean).join(" · ");

  return (
    <div className={"ovl-lineup absolute inset-0 " + (on ? "ovl-lineup-on" : "")} aria-hidden={!on}>
      <div className="absolute inset-0 bg-[linear-gradient(135deg,rgba(7,12,26,0.97)_0%,rgba(10,24,44,0.96)_55%,rgba(13,52,30,0.96)_100%)]" />
      <div className="absolute -right-40 top-0 h-full w-[520px] skew-x-[-14deg] bg-[#2F9E41]/15" />
      <div className="absolute -right-10 top-0 h-full w-[120px] skew-x-[-14deg] bg-[#2F9E41]/25" />

      <header className="absolute left-20 right-20 top-14 flex items-end justify-between gap-10 text-white">
        <div className="min-w-0">
          <p className="text-[26px] font-bold uppercase tracking-[0.35em] text-[#5FD873]">{single ? "Escalação" : "Escalações"}</p>
          <h1 className="mt-1 truncate text-[84px] font-extrabold uppercase leading-none tracking-tight">
            {single ? teams[0].name || stream.title : stream.title}
          </h1>
        </div>
        <div className="shrink-0 pb-2 text-right">
          <p className="text-[40px] font-extrabold leading-none tracking-tight">JIF<span className="text-[#5FD873]">Tv</span></p>
          {single && subtitle && <p className="mt-2 max-w-[640px] truncate text-[24px] text-white/70">{subtitle}</p>}
        </div>
      </header>

      <div key={run} className="absolute bottom-16 left-20 right-20 top-[250px] flex gap-12">
        {teams.map((team) => (
          <TeamGrid
            key={team.key}
            team={team}
            width={single ? 1760 : 856}
            height={single ? 770 : 700}
            heading={!single}
          />
        ))}
      </div>
    </div>
  );
}

function TeamGrid({ team, width, height, heading }) {
  const { cols, card } = fit(team.players.length, width, height);
  return (
    <section className="flex min-w-0 flex-1 flex-col">
      {heading && (
        <h2 className="mb-5 flex h-[50px] items-center gap-4 border-b-4 border-[#2F9E41] pb-2 text-[36px] font-extrabold uppercase leading-none tracking-tight text-white">
          <span className="truncate">{team.name}</span>
        </h2>
      )}
      <ul className="mx-auto flex w-full flex-1 flex-wrap content-center justify-center" style={{ gap: GAP, maxWidth: cols * card + GAP * (cols - 1) + 1 }}>
        {team.players.map((athlete, index) => (
          <Player key={athlete.id} athlete={athlete} size={card} delay={Math.min(index * 60, 900)} />
        ))}
      </ul>
    </section>
  );
}

// Todas as medidas internas são em `em`, proporcionais à largura do cartão.
function Player({ athlete, size, delay }) {
  const [broken, setBroken] = useState(false);
  const photo = athletePhoto(athlete, 400);
  const hasNumber = athlete.jerseyNumber != null;

  return (
    <li
      className="ovl-card relative flex flex-col overflow-hidden rounded-[0.8em] bg-[#0B1220] shadow-[0_10px_30px_rgba(0,0,0,0.45)] ring-1 ring-white/10"
      style={{ width: size, height: size * CARD_RATIO, fontSize: size / 10, animationDelay: `${delay}ms` }}
    >
      <div className="relative flex-1 overflow-hidden bg-[linear-gradient(160deg,#1B2B4B,#0F3B22)]">
        {photo && !broken ? (
          <img src={photo} alt="" onError={() => setBroken(true)} className="h-full w-full object-cover object-top" />
        ) : (
          <span className="grid h-full w-full place-items-center text-[4.4em] font-extrabold text-white/25">
            {(athlete.name || "?").charAt(0).toUpperCase()}
          </span>
        )}
        <div className="absolute inset-x-0 bottom-0 h-1/3 bg-gradient-to-t from-[#0B1220] to-transparent" />
        {hasNumber && (
          <span className="absolute bottom-[0.1em] left-[0.35em] text-[2.9em] font-extrabold leading-none tabular-nums text-white [text-shadow:0_0.06em_0.2em_rgba(0,0,0,0.8)]">
            {athlete.jerseyNumber}
          </span>
        )}
      </div>
      <div className="border-t-[0.22em] border-[#2F9E41] px-[0.7em] py-[0.5em] text-white">
        <p className="truncate text-[1.12em] font-bold uppercase leading-tight tracking-tight">{shortName(athlete)}</p>
        <p className="h-[1.3em] truncate text-[0.82em] leading-tight text-white/60">{athlete.position || ""}</p>
      </div>
    </li>
  );
}
