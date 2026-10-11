import { Link } from "react-router-dom";
import { useLiveStatus } from "../../providers/LiveStatusProvider.jsx";

// Ponto vermelho pulsante + título da partida atual (ou quantas estão no ar).
export default function LiveIndicator({ compact = false }) {
  const { streams, stream } = useLiveStatus();
  if (!stream) return null;

  const label = streams.length > 1 ? `${streams.length} partidas` : stream.title;

  return (
    <Link
      to="/live"
      className="group inline-flex items-center gap-2 rounded-full border border-line bg-surface/70 px-3 py-1.5 text-xs font-medium text-fg hover:border-live/60 max-md:min-h-11"
    >
      <span className="relative flex h-2 w-2">
        <span className="absolute inline-flex h-full w-full animate-live-pulse rounded-full bg-live opacity-70" />
        <span className="relative inline-flex h-2 w-2 rounded-full bg-live" />
      </span>
      <span className="text-live">Ao vivo</span>
      {!compact && (
        <span className="max-w-[16ch] truncate text-muted group-hover:text-fg">{label}</span>
      )}
    </Link>
  );
}
