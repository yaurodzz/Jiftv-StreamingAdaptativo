import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { getAthlete, subscribeAthleteScout } from "../services/athletes.js";
import { subscribeModalities } from "../services/modalities.js";
import { subscribeVods } from "../services/vods.js";
import { formatDate } from "../lib/format.js";
import { cldAvatar } from "../lib/cloudinary.js";
import StatBlock from "../components/ui/StatBlock.jsx";
import { computeAge, classLine, aggregateScout } from "../features/athletes/format.js";

// /atletas/:id — perfil público de um atleta aprovado.
// Layout: capa com foto + identidade à esquerda; estatísticas agregadas
// (a partir de scoutEvents) em grid; últimas participações abaixo.

export default function AthletePage() {
  const { id } = useParams();
  const [athlete, setAthlete] = useState(undefined); // undefined=loading, null=404
  const [modalities, setModalities] = useState([]);
  const [scout, setScout] = useState([]);
  const [vodTitles, setVodTitles] = useState(new Map());
  const [photoBroken, setPhotoBroken] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setAthlete(undefined);
    getAthlete(id)
      .then((a) => { if (!cancelled) setAthlete(a); })
      .catch(() => { if (!cancelled) setAthlete(null); });
    return () => { cancelled = true; };
  }, [id]);

  useEffect(() => subscribeModalities(setModalities), []);
  // Título e data das gravações, para listar as participações pelo nome da partida.
  useEffect(() => subscribeVods((list) => setVodTitles(new Map(list.map((v) => [v.id, v])))), []);

  useEffect(() => {
    if (!athlete?.id) return;
    return subscribeAthleteScout(athlete.id, setScout);
  }, [athlete?.id]);

  useEffect(() => {
    document.title = athlete?.name ? `${athlete.name} · JIFTv` : "Atleta · JIFTv";
  }, [athlete?.name]);

  const scoutTypes = useMemo(() => {
    if (!athlete) return [];
    const m = modalities.find((x) => x.code === athlete.modalityCode);
    return Array.isArray(m?.scoutTypes) ? m.scoutTypes : [];
  }, [modalities, athlete]);

  const stats = useMemo(() => aggregateScout(scout, scoutTypes), [scout, scoutTypes]);

  // Últimas partidas: distintas por matchId, ordenadas por evento mais recente.
  const matches = useMemo(() => {
    const seen = new Map();
    for (const ev of [...scout].sort((a, b) => {
      const ta = a.createdAt?.toMillis?.() || 0;
      const tb = b.createdAt?.toMillis?.() || 0;
      return tb - ta;
    })) {
      if (!ev.matchId || seen.has(ev.matchId)) continue;
      seen.set(ev.matchId, ev);
    }
    return [...seen.values()].slice(0, 8);
  }, [scout]);

  if (athlete === undefined) {
    return <div className="mx-auto max-w-4xl px-4 py-20 text-center text-muted">Carregando…</div>;
  }
  if (athlete === null) {
    return (
      <section className="mx-auto max-w-md px-4 py-20 text-center">
        <h1 className="text-2xl font-semibold">Atleta não encontrado</h1>
        <p className="mt-2 text-muted">O perfil pode não ter sido aprovado ou foi removido.</p>
        <Link to="/atletas" className="btn-ghost mt-6 inline-flex">Ver todos os atletas</Link>
      </section>
    );
  }

  const age = computeAge(athlete.birthDate);
  const cls = classLine(athlete);

  return (
    <section className="mx-auto max-w-5xl px-4 py-8 md:py-10">
      <nav aria-label="Trilha de navegação" className="mb-4 text-xs text-muted">
        <Link to="/atletas" className="hover:text-fg">Atletas</Link>
        <span className="mx-2">/</span>
        <span className="text-fg">{athlete.modalityName || athlete.modality}</span>
      </nav>

      <header className="grid gap-6 rounded-3xl border border-line bg-surface p-6 md:grid-cols-[220px_1fr] md:p-8">
        <div className="mx-auto md:mx-0">
          <div className="relative aspect-square w-44 overflow-hidden rounded-2xl border border-line bg-elevated md:w-full">
            {athlete.photoUrl && !photoBroken ? (
              <img
                src={cldAvatar(athlete.photoUrl, { size: 512 })}
                alt={`Foto de ${athlete.name}`}
                width={512}
                height={512}
                onError={() => setPhotoBroken(true)}
                className="h-full w-full object-cover"
              />
            ) : (
              <div className="grid h-full w-full place-items-center text-5xl font-bold text-muted">
                {athlete.name.charAt(0)}
              </div>
            )}
            {athlete.jerseyNumber != null && (
              <span className="absolute -bottom-3 -right-3 grid h-14 min-w-14 place-items-center rounded-full bg-accent px-2 text-xl font-bold text-white shadow-lg">
                {athlete.jerseyNumber}
              </span>
            )}
          </div>
        </div>

        <div className="min-w-0">
          <p className="text-sm text-accent">
            {athlete.modalityCode ? `${athlete.modalityCode} · ` : ""}
            {athlete.modalityName || athlete.modality}
          </p>
          <h1 className="mt-1 text-3xl font-semibold md:text-4xl">{athlete.name}</h1>
          {athlete.nickname && (
            <p className="mt-1 text-lg text-muted">"{athlete.nickname}"</p>
          )}
          <dl className="mt-4 grid grid-cols-2 gap-4 text-sm sm:grid-cols-4">
            <Info label="Idade"    value={age != null ? `${age} anos` : "—"} />
            <Info label="Posição"  value={athlete.position || "—"} />
            <Info label="Turma"    value={athlete.className || "—"} />
            <Info label="Câmpus"   value={athlete.classCampus || "—"} />
          </dl>
          {athlete.bio && (
            <p className="mt-4 max-w-prose text-sm text-muted">{athlete.bio}</p>
          )}
        </div>
      </header>

      <h2 className="mt-10 mb-4 text-lg font-semibold">Estatísticas</h2>
      {stats.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-line bg-surface px-6 py-10 text-center text-sm text-muted">
          Ainda não há eventos de scout registrados para este atleta.
        </p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-4">
          {stats.map((s, i) => (
            <StatBlock
              key={s.code}
              value={s.total}
              label={s.label}
              tone={i === 0 ? "accent" : "default"}
            />
          ))}
        </div>
      )}

      {matches.length > 0 && (
        <>
          <h2 className="mt-10 mb-4 text-lg font-semibold">Últimas participações</h2>
          <ul className="divide-y divide-line rounded-2xl border border-line bg-surface">
            {matches.map((ev) => (
              <li key={ev.matchId} className="flex items-center justify-between gap-3 px-4 py-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{vodTitles.get(ev.matchId)?.title || `Partida ${ev.matchId}`}</p>
                  <p className="mt-0.5 text-xs text-muted">
                    {formatDate(vodTitles.get(ev.matchId)?.recordedAt || ev.createdAt) || "—"}
                  </p>
                </div>
                {ev.matchType === "vod" && vodTitles.has(ev.matchId) && (
                  <Link to={`/partidas/${ev.matchId}`} className="btn-ghost text-xs">
                    Ver gravação
                  </Link>
                )}
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}

function Info({ label, value }) {
  return (
    <div>
      <dt className="text-xs text-muted">{label}</dt>
      <dd className="mt-0.5 text-fg">{value}</dd>
    </div>
  );
}
