import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Eye, Link2, MapPin } from "lucide-react";
import { useLiveStatus } from "../providers/LiveStatusProvider.jsx";
import { subscribeStreamBySlug } from "../services/streams.js";
import LivePlayer from "../features/live/LivePlayer.jsx";
import OffAir from "../features/live/OffAir.jsx";
import Scoreboard from "../features/live/Scoreboard.jsx";
import StreamStats from "../features/live/StreamStats.jsx";
import { useUptime } from "../features/live/useUptime.js";
import { useViewerPing } from "../features/live/useViewerPing.js";
import { useClipboard } from "../features/admin/useClipboard.js";
import MediaCard, { LiveBadge } from "../components/ui/MediaCard.jsx";
import { liveThumb, liveUrl } from "../lib/media.js";

const PROTOCOL_KEY = "jiftv-protocol";

function readProtocol() {
  try { return localStorage.getItem(PROTOCOL_KEY) === "dash" ? "dash" : "hls"; } catch { return "hls"; }
}

// /live            → transmissão principal no ar (ou agenda + gravações, se não houver)
// /live/:slug      → uma transmissão específica (link para compartilhar)
export default function Live() {
  const { slug } = useParams();
  const { streams: liveStreams, stream: mainStream, loading: liveLoading } = useLiveStatus();
  const [bySlug, setBySlug] = useState(undefined); // undefined = carregando, null = não existe
  const [cinema, setCinema] = useState(false);
  const [protocol, setProtocol] = useState(readProtocol);
  const [stats, setStats] = useState(null);
  const clip = useClipboard();

  useEffect(() => {
    if (!slug) { setBySlug(undefined); return undefined; }
    setBySlug(undefined);
    return subscribeStreamBySlug(slug, setBySlug, () => setBySlug(null));
  }, [slug]);

  const stream = slug ? bySlug : mainStream;
  const isLive = Boolean(stream?.isLive);
  const uptime = useUptime(isLive ? stream?.startedAt : null);
  const pinged = useViewerPing(stream?.slug, isLive);
  const viewers = Math.max(pinged ?? 0, stream?.viewers ?? 0, isLive ? 1 : 0);
  const others = liveStreams.filter((s) => s.id !== stream?.id);

  // Ao sair do modo cinema, garante que a página não fica com o body preso.
  useEffect(() => {
    document.body.style.overflow = cinema ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [cinema]);

  useEffect(() => {
    document.title = stream ? `${isLive ? "Ao vivo · " : ""}${stream.title} · JIFTv` : "Ao vivo · JIFTv";
  }, [stream, isLive]);

  const changeProtocol = (p) => {
    setProtocol(p);
    setStats(null);
    try { localStorage.setItem(PROTOCOL_KEY, p); } catch { /* navegação privada */ }
  };

  if ((slug && bySlug === undefined) || (!slug && liveLoading)) {
    return <div role="status" className="mx-auto max-w-md px-4 py-24 text-center text-muted">Carregando…</div>;
  }

  if (slug && bySlug === null) {
    return (
      <section className="mx-auto max-w-md px-4 py-20 text-center">
        <h1 className="text-2xl font-semibold">Transmissão não encontrada</h1>
        <p className="mt-2 text-muted">O link pode estar errado ou a transmissão foi removida.</p>
        <Link to="/live" className="btn-ghost mt-6 inline-flex">Ver o que está ao vivo</Link>
      </section>
    );
  }

  if (!isLive) return <OffAir stream={slug ? stream : null} />;

  const player = (
    <LivePlayer
      src={liveUrl(stream.slug, protocol)}
      cinema={cinema}
      onToggleCinema={() => setCinema((v) => !v)}
      onStats={setStats}
    />
  );

  if (cinema) {
    return (
      <div className="fixed inset-0 z-50 bg-black/95 backdrop-blur-sm">
        <button
          onClick={() => setCinema(false)}
          className="absolute right-4 top-4 z-20 rounded-full border border-white/20 bg-black/40 px-3 py-1.5 text-xs font-medium text-white hover:bg-black/60"
        >
          Sair do cinema (C)
        </button>
        <div className="mx-auto grid h-full max-w-[min(100vw,calc(100vh*16/9))] place-items-center px-4">
          <div className="w-full">{player}</div>
        </div>
      </div>
    );
  }

  const shareUrl = `${window.location.origin}/live/${stream.slug}`;

  return (
    <section className="mx-auto max-w-7xl px-4 py-6 md:py-8">
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="min-w-0">
          {player}

          <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
            <div role="radiogroup" aria-label="Protocolo de streaming" className="inline-flex rounded-full border border-line bg-surface p-0.5 text-sm">
              {["hls", "dash"].map((p) => (
                <button
                  key={p}
                  type="button"
                  role="radio"
                  aria-checked={protocol === p}
                  onClick={() => changeProtocol(p)}
                  className={"rounded-full px-4 py-1.5 font-medium transition-colors " + (protocol === p ? "bg-accent text-white" : "text-muted hover:text-fg")}
                >
                  {p.toUpperCase()}
                </button>
              ))}
            </div>
            <p className="text-xs text-muted">
              Atalhos: <kbd className="rounded border border-line px-1">C</kbd> cinema ·{" "}
              <kbd className="rounded border border-line px-1">F</kbd> tela cheia ·{" "}
              <kbd className="rounded border border-line px-1">M</kbd> mudo
            </p>
          </div>

          <header className="mt-5 flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm text-accent">{stream.modalityName || stream.modality || "Transmissão ao vivo"}</p>
              <h1 className="mt-1 text-2xl font-semibold md:text-3xl">{stream.title}</h1>
              <p className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted">
                <span className="inline-flex items-center gap-1.5 text-live">
                  <span className="h-2 w-2 animate-live-pulse rounded-full bg-live" /> Ao vivo
                </span>
                {uptime && <span>No ar há <span className="font-medium text-fg">{uptime}</span></span>}
                <span className="inline-flex items-center gap-1.5"><Eye size={14} /> {viewers} assistindo</span>
                {stream.location && <span className="inline-flex items-center gap-1.5"><MapPin size={14} /> {stream.location}</span>}
              </p>
            </div>
            <button
              type="button"
              onClick={() => clip.copy(shareUrl)}
              className="btn-ghost"
            >
              <Link2 size={15} /> {clip.copied ? "Link copiado" : "Copiar link"}
            </button>
          </header>
          {stream.description && <p className="mt-4 max-w-3xl whitespace-pre-line text-muted">{stream.description}</p>}
        </div>

        <aside className="space-y-4">
          <Scoreboard stream={stream} size="lg" />
          <StreamStats stats={stats} />
          {others.length > 0 && (
            <section>
              <h2 className="mb-3 text-sm font-semibold">Também ao vivo</h2>
              <div className="space-y-3">
                {others.map((s) => (
                  <OtherLive key={s.id} stream={s} />
                ))}
              </div>
            </section>
          )}
        </aside>
      </div>
    </section>
  );
}

function OtherLive({ stream }) {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setTick((n) => n + 1), 10000);
    return () => clearInterval(t);
  }, []);
  return (
    <MediaCard
      to={`/live/${stream.slug}`}
      title={stream.title}
      subtitle={stream.modalityName || stream.modality}
      thumbnail={liveThumb(stream.slug, tick)}
      badge={<LiveBadge />}
      corner={<><Eye size={11} /> {stream.viewers || 0}</>}
      live
      width={320}
    />
  );
}
