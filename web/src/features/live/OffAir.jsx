import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { CalendarClock, Radio } from "lucide-react";
import { subscribeVods } from "../../services/vods.js";
import { subscribeAllStreams } from "../../services/streams.js";
import MediaCard from "../../components/ui/MediaCard.jsx";
import { formatDateTime, toDate, vodDuration, vodSubtitle } from "../../lib/format.js";
import { isPlayable, vodThumb } from "../../lib/media.js";

// Estado vazio da /live: próximas partidas e gravações recentes como atalho.
// A troca para o player quando uma transmissão começa é feita pela página,
// que reage ao LiveStatusProvider. `stream` = transmissão específica que ainda não começou.
export default function OffAir({ stream }) {
  const [recent, setRecent] = useState([]);
  const [streams, setStreams] = useState([]);

  useEffect(() => subscribeVods((list) => setRecent(list.filter(isPlayable).slice(0, 6))), []);
  useEffect(() => subscribeAllStreams(setStreams), []);

  const upcoming = useMemo(() => {
    const limit = Date.now() - 6 * 3600 * 1000;
    return streams
      .filter((s) => s.listed !== false && !s.isLive && s.keyActive !== false && s.id !== stream?.id)
      .filter((s) => !toDate(s.scheduledFor) || toDate(s.scheduledFor).getTime() > limit)
      .filter((s) => !s.endedAt || toDate(s.scheduledFor)?.getTime() > toDate(s.endedAt)?.getTime())
      .sort((a, b) => (toDate(a.scheduledFor)?.getTime() ?? Infinity) - (toDate(b.scheduledFor)?.getTime() ?? Infinity))
      .slice(0, 6);
  }, [streams, stream?.id]);

  const ended = stream?.endedAt;

  return (
    <section className="mx-auto max-w-6xl px-4 py-16">
      <div className="mx-auto max-w-xl text-center">
        <div className="mx-auto mb-5 grid h-14 w-14 place-items-center rounded-full border border-line bg-surface">
          {stream ? <CalendarClock className="text-muted" /> : <Radio className="text-muted" />}
        </div>
        {stream ? (
          <>
            <p className="text-sm text-accent">{stream.modalityName || stream.modality || "Transmissão"}</p>
            <h1 className="mt-1 text-3xl font-semibold md:text-4xl">{stream.title}</h1>
            <p className="mt-3 text-muted">
              {ended ? "Esta transmissão foi encerrada." : stream.scheduledFor
                ? `Prevista para ${formatDateTime(stream.scheduledFor)}. Deixe esta página aberta: o vídeo começa sozinho.`
                : "A transmissão ainda não começou. Deixe esta página aberta: o vídeo começa sozinho."}
            </p>
          </>
        ) : (
          <>
            <h1 className="text-3xl font-semibold md:text-4xl">Nenhuma partida ao vivo agora</h1>
            <p className="mt-3 text-muted">
              Assim que uma transmissão começar, esta página troca sozinha para o player.
            </p>
          </>
        )}
        <div className="mt-6 flex justify-center gap-3">
          <Link to="/catalogo" className="btn-primary">Ver gravações</Link>
        </div>
      </div>

      {upcoming.length > 0 && (
        <div className="mt-14">
          <h2 className="mb-4 text-lg font-semibold">Próximas transmissões</h2>
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {upcoming.map((s) => (
              <li key={s.id}>
                <Link to={`/live/${s.slug}`} className="card block p-4">
                  <p className="text-xs text-muted">
                    {s.scheduledFor ? formatDateTime(s.scheduledFor) : "Data a definir"}
                    {s.modalityName ? ` · ${s.modalityName}` : ""}
                  </p>
                  <p className="mt-1 font-medium">{s.title}</p>
                  {(s.teamA || s.teamB) && (
                    <p className="mt-1 text-sm text-muted">{s.teamA || "?"} × {s.teamB || "?"}</p>
                  )}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}

      {recent.length > 0 && (
        <div className="mt-14">
          <div className="mb-4 flex items-baseline justify-between">
            <h2 className="text-lg font-semibold">Gravações recentes</h2>
            <Link to="/catalogo" className="text-sm text-muted hover:text-fg">Ver todas</Link>
          </div>
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {recent.map((v) => (
              <li key={v.id}>
                <MediaCard
                  to={`/partidas/${v.id}`}
                  title={v.title}
                  subtitle={vodSubtitle(v)}
                  thumbnail={vodThumb(v)}
                  duration={vodDuration(v)}
                />
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
