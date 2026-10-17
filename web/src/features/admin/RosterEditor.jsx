import { useEffect, useMemo, useState } from "react";
import { ArrowLeftRight, Plus, Search, X } from "lucide-react";
import { subscribeApprovedAthletes } from "../../services/athletes.js";
import { athletePhoto } from "../../lib/media.js";
import { classLine } from "../athletes/format.js";
import { byJersey, cleanRoster, ROSTER_MAX } from "../live/roster.js";

// Atletas aprovados (os únicos que podem entrar num elenco, porque só eles aparecem no site).
// null = carregando.
export function useApprovedAthletes(enabled = true) {
  const [athletes, setAthletes] = useState(null);
  useEffect(() => {
    if (!enabled) return undefined;
    return subscribeApprovedAthletes(setAthletes, () => setAthletes([]));
  }, [enabled]);
  return athletes;
}

const norm = (s) => (s || "").normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();

// Monta o elenco de uma transmissão: escolhe a equipe, busca o atleta e toca nele para adicionar.
// `value` e `onChange` trabalham com [{ athleteId, team: "A" | "B" }]. Sem nomes de equipe a lista
// é única. Usado na criação da transmissão e no cartão "Elenco" da página dela.
export default function RosterEditor({ value, onChange, teamA, teamB, modalityCode, athletes: given }) {
  const own = useApprovedAthletes(!given);
  const athletes = given || own;
  const roster = useMemo(() => cleanRoster(value), [value]);
  const twoTeams = Boolean(teamA || teamB);
  const [team, setTeam] = useState("A");
  const [q, setQ] = useState("");
  const [onlyModality, setOnlyModality] = useState(true);

  const byId = useMemo(() => Object.fromEntries((athletes || []).map((a) => [a.id, a])), [athletes]);
  const chosen = useMemo(() => new Set(roster.map((e) => e.athleteId)), [roster]);
  const full = roster.length >= ROSTER_MAX;

  const candidates = useMemo(() => {
    const nq = norm(q.trim());
    return (athletes || [])
      .filter((a) => !chosen.has(a.id))
      .filter((a) => !modalityCode || !onlyModality || a.modalityCode === modalityCode)
      .filter((a) => !nq || norm([a.name, a.nickname, a.jerseyNumber, a.className, a.classCampus].join(" ")).includes(nq));
  }, [athletes, chosen, q, modalityCode, onlyModality]);

  const add = (athleteId) => { if (!full) onChange([...roster, { athleteId, team: twoTeams ? team : "A" }]); };
  const remove = (athleteId) => onChange(roster.filter((e) => e.athleteId !== athleteId));
  const swap = (athleteId) => onChange(roster.map((e) => (e.athleteId === athleteId ? { ...e, team: e.team === "A" ? "B" : "A" } : e)));

  const groups = twoTeams
    ? [{ key: "A", name: teamA || "Equipe A" }, { key: "B", name: teamB || "Equipe B" }]
    : [{ key: null, name: "No elenco" }];
  const entriesOf = (key) => roster
    .filter((e) => !key || e.team === key)
    .map((e) => ({ ...e, athlete: byId[e.athleteId] }))
    .sort((a, b) => (a.athlete && b.athlete ? byJersey(a.athlete, b.athlete) : Number(!a.athlete) - Number(!b.athlete)));

  return (
    <div className="space-y-4">
      {twoTeams && (
        <div>
          <span className="label">Adicionar na equipe</span>
          <div role="radiogroup" aria-label="Equipe que recebe os atletas" className="grid grid-cols-2 gap-1 rounded-xl border border-line bg-elevated/40 p-1 text-sm">
            {groups.map((g) => (
              <button
                key={g.key}
                type="button"
                role="radio"
                aria-checked={team === g.key}
                onClick={() => setTeam(g.key)}
                className={"min-w-0 truncate rounded-lg px-3 py-1.5 font-medium max-md:min-h-11 " + (team === g.key ? "bg-accent text-white" : "text-muted hover:text-fg")}
              >
                {g.name}
              </button>
            ))}
          </div>
        </div>
      )}

      <div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <div className="relative min-w-0 flex-1 basis-56">
            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted"><Search size={16} /></span>
            <input
              type="search"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              // Enter aqui não pode enviar o formulário da transmissão
              onKeyDown={(e) => { if (e.key === "Enter") e.preventDefault(); }}
              placeholder="Buscar atleta por nome, número ou turma"
              aria-label="Buscar atleta"
              enterKeyHint="search"
              autoComplete="off"
              className="input pl-9"
            />
          </div>
          {modalityCode && (
            <label className="flex items-center gap-2 text-xs text-muted max-md:min-h-11">
              <input type="checkbox" checked={onlyModality} onChange={(e) => setOnlyModality(e.target.checked)} className="h-4 w-4 accent-[rgb(var(--accent))]" />
              Só atletas de {modalityCode}
            </label>
          )}
        </div>

        <div className="mt-2 max-h-60 overflow-y-auto rounded-xl border border-line">
          {athletes === null ? (
            <p role="status" className="px-3 py-4 text-sm text-muted">Carregando atletas…</p>
          ) : athletes.length === 0 ? (
            <p className="px-3 py-4 text-sm text-muted">Nenhum atleta aprovado ainda. Aprove os cadastros em Atletas para montar o elenco.</p>
          ) : candidates.length === 0 ? (
            <p className="px-3 py-4 text-sm text-muted">
              {q.trim() ? "Nenhum atleta encontrado com essa busca."
                : modalityCode && onlyModality ? `Todos os atletas aprovados de ${modalityCode} já estão no elenco, ou ainda não há nenhum.`
                  : "Todos os atletas aprovados já estão no elenco."}
            </p>
          ) : (
            <ul className="divide-y divide-line">
              {candidates.map((a) => (
                <li key={a.id}>
                  <button
                    type="button"
                    disabled={full}
                    onClick={() => add(a.id)}
                    className="flex w-full items-center gap-3 px-3 py-2 text-left hover:bg-elevated/60 disabled:opacity-50 max-md:min-h-14"
                  >
                    <Avatar athlete={a} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">
                        {a.jerseyNumber != null && <span className="mr-1.5 font-mono text-xs text-muted">#{a.jerseyNumber}</span>}
                        {a.name}
                      </span>
                      <span className="block truncate text-xs text-muted">{[a.modalityCode, classLine(a)].filter(Boolean).join(" · ")}</span>
                    </span>
                    <Plus size={16} className="shrink-0 text-accent" aria-hidden="true" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
        {full && <p className="mt-1 text-xs text-warn">O elenco chegou ao limite de {ROSTER_MAX} atletas.</p>}
      </div>

      <div className={"grid gap-4 " + (twoTeams ? "sm:grid-cols-2" : "")}>
        {groups.map((g) => {
          const entries = entriesOf(g.key);
          return (
            <div key={g.key || "all"} className="min-w-0">
              <p className="label flex justify-between gap-2">
                <span className="truncate">{g.name}</span>
                <span className="shrink-0">{entries.length}</span>
              </p>
              {entries.length === 0 ? (
                <p className="rounded-xl border border-dashed border-line px-3 py-3 text-xs text-muted">Ninguém ainda.</p>
              ) : (
                <ul className="space-y-1.5">
                  {entries.map(({ athleteId, athlete }) => (
                    <li key={athleteId} className="flex items-center gap-2 rounded-xl border border-line py-1 pl-2 pr-1">
                      {athlete ? (
                        <>
                          <Avatar athlete={athlete} small />
                          <span className="min-w-0 flex-1 truncate text-sm">
                            {athlete.jerseyNumber != null && <span className="mr-1.5 font-mono text-xs text-muted">#{athlete.jerseyNumber}</span>}
                            {athlete.name}
                          </span>
                        </>
                      ) : (
                        // Rejeitado ou removido depois de entrar no elenco: não aparece no site
                        <span className="min-w-0 flex-1 truncate py-1.5 text-xs text-warn">
                          {athletes === null ? "Carregando…" : "Atleta indisponível (não está mais aprovado)"}
                        </span>
                      )}
                      {twoTeams && (
                        <button type="button" onClick={() => swap(athleteId)} className="icon-btn shrink-0" aria-label={`Passar ${athlete?.name || "atleta"} para a outra equipe`} title="Passar para a outra equipe">
                          <ArrowLeftRight size={15} />
                        </button>
                      )}
                      <button type="button" onClick={() => remove(athleteId)} className="icon-btn shrink-0 hover:text-live" aria-label={`Tirar ${athlete?.name || "atleta"} do elenco`} title="Tirar do elenco">
                        <X size={15} />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Avatar({ athlete, small = false }) {
  const photo = athletePhoto(athlete, 96);
  return (
    <span className={"grid shrink-0 place-items-center overflow-hidden rounded-lg bg-elevated font-bold text-muted " + (small ? "h-8 w-8 text-xs" : "h-10 w-10 text-sm")}>
      {photo
        ? <img src={photo} alt="" width={96} height={96} loading="lazy" className="h-full w-full object-cover" />
        : (athlete.name || "?").charAt(0)}
    </span>
  );
}
