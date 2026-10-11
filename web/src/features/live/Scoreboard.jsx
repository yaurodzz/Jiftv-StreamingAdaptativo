// Placar da partida (equipes e pontos vêm do documento da transmissão, em tempo real).
export default function Scoreboard({ stream, size = "md" }) {
  if (!stream?.teamA && !stream?.teamB) return null;
  const big = size === "lg";
  return (
    <div
      className={
        "grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-3 rounded-2xl border border-line bg-surface " +
        (big ? "px-4 py-4 md:px-5" : "px-3 py-2")
      }
      aria-label={`Placar: ${stream.teamA || "Equipe A"} ${stream.scoreA ?? 0}, ${stream.teamB || "Equipe B"} ${stream.scoreB ?? 0}`}
    >
      <span className={"font-medium leading-tight " + (big ? "break-words text-base" : "truncate text-sm")}>{stream.teamA || "Equipe A"}</span>
      <span className="inline-flex items-center gap-2 tabular-nums">
        <b className={"rounded-lg bg-elevated text-center font-semibold " + (big ? "min-w-12 px-3 py-1 text-3xl" : "min-w-8 px-2 text-lg")}>
          {stream.scoreA ?? 0}
        </b>
        <span className="text-muted">×</span>
        <b className={"rounded-lg bg-elevated text-center font-semibold " + (big ? "min-w-12 px-3 py-1 text-3xl" : "min-w-8 px-2 text-lg")}>
          {stream.scoreB ?? 0}
        </b>
      </span>
      <span className={"text-right font-medium leading-tight " + (big ? "break-words text-base" : "truncate text-sm")}>{stream.teamB || "Equipe B"}</span>
    </div>
  );
}
