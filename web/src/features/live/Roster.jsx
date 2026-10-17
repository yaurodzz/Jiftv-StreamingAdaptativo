import { useState } from "react";
import { Link } from "react-router-dom";
import { athletePhoto } from "../../lib/media.js";
import { rosterTeams } from "./roster.js";

// Elenco da partida: foto, nome e número de cada atleta, separado por equipe quando a
// transmissão tem equipes. Fica abaixo do vídeo na página pública e no painel da transmissão.
// `athletesById` vem de useRosterAthletes (público) ou da lista de aprovados (painel).
// `link` leva ao perfil público do atleta; no painel fica desligado para não sair da tela.
export default function Roster({ stream, athletesById, link = true, heading = true, className = "" }) {
  const teams = rosterTeams(stream, athletesById);
  if (teams.length === 0) return null;
  const split = teams.length > 1 || Boolean(teams[0].name);

  return (
    <section aria-label="Elenco" className={className}>
      {heading && <h2 className="mb-3 text-lg font-semibold">Elenco</h2>}
      <div className={"grid gap-x-6 gap-y-5 " + (teams.length > 1 ? "sm:grid-cols-2" : "")}>
        {teams.map((team) => (
          <div key={team.key} className="min-w-0">
            {team.name && (
              <h3 className="mb-2 flex items-baseline justify-between gap-3 border-b border-line pb-2 text-sm font-semibold">
                <span className="min-w-0 break-words">{team.name}</span>
                <span className="shrink-0 text-xs font-normal text-muted">
                  {team.players.length} {team.players.length === 1 ? "atleta" : "atletas"}
                </span>
              </h3>
            )}
            <ul className={"grid gap-2 " + (split ? "" : "sm:grid-cols-2 xl:grid-cols-3")}>
              {team.players.map((a) => (
                <li key={a.id} className="min-w-0"><Player athlete={a} link={link} /></li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </section>
  );
}

function Player({ athlete, link }) {
  const [broken, setBroken] = useState(false);
  const photo = athletePhoto(athlete, 120);
  const hasNumber = athlete.jerseyNumber != null;
  const label = `${hasNumber ? `Número ${athlete.jerseyNumber}, ` : ""}${athlete.name}`;

  const body = (
    <>
      <span className="grid h-12 w-12 shrink-0 place-items-center overflow-hidden rounded-lg bg-elevated text-lg font-bold text-muted">
        {photo && !broken ? (
          <img src={photo} alt="" width={120} height={120} loading="lazy" decoding="async" onError={() => setBroken(true)} className="h-full w-full object-cover" />
        ) : (athlete.name || "?").charAt(0)}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium">{athlete.name}</span>
        {(athlete.position || athlete.nickname) && (
          <span className="block truncate text-xs text-muted">{athlete.position || athlete.nickname}</span>
        )}
      </span>
      {hasNumber && (
        <span aria-hidden="true" className="grid h-9 min-w-9 shrink-0 place-items-center rounded-full bg-accent px-1.5 text-sm font-bold tabular-nums text-white">
          {athlete.jerseyNumber}
        </span>
      )}
    </>
  );

  const box = "flex min-h-16 items-center gap-3 rounded-xl border border-line bg-surface p-2 pr-3";
  return link ? (
    <Link to={`/atletas/${athlete.id}`} aria-label={label} className={box + " transition-colors hover:border-accent/60"}>{body}</Link>
  ) : (
    <div aria-label={label} className={box}>{body}</div>
  );
}
