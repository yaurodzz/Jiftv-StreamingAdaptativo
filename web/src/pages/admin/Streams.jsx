import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ChevronRight, Plus } from "lucide-react";
import { subscribeAllStreams } from "../../services/streams.js";
import { subscribeAllVods } from "../../services/vods.js";
import StreamForm from "../../features/admin/StreamForm.jsx";
import { StreamBadge, streamStatus } from "../../features/admin/badges.jsx";
import SearchBox from "../../features/catalog/SearchBox.jsx";
import { formatDateTime, formatRelative } from "../../lib/format.js";

const FILTERS = [
  { key: "",          label: "Todas" },
  { key: "live",      label: "Ao vivo" },
  { key: "scheduled", label: "Agendadas" },
  { key: "ended",     label: "Encerradas" },
  { key: "blocked",   label: "Bloqueadas" },
];

export default function Streams() {
  const navigate = useNavigate();
  const [streams, setStreams] = useState(null);
  const [vods, setVods] = useState([]);
  const [filter, setFilter] = useState("");
  const [q, setQ] = useState("");
  const [creating, setCreating] = useState(false);

  useEffect(() => { document.title = "Transmissões · Painel JIFTv"; }, []);
  useEffect(() => subscribeAllStreams(setStreams, () => setStreams([])), []);
  useEffect(() => subscribeAllVods(setVods), []);

  const recordingsBy = useMemo(() => {
    const map = new Map();
    for (const v of vods) if (v.sourceStreamId) map.set(v.sourceStreamId, (map.get(v.sourceStreamId) || 0) + 1);
    return map;
  }, [vods]);

  const counts = useMemo(() => {
    const c = { "": streams?.length || 0 };
    for (const s of streams || []) c[streamStatus(s)] = (c[streamStatus(s)] || 0) + 1;
    return c;
  }, [streams]);

  const visible = useMemo(() => {
    const nq = q.trim().toLowerCase();
    return (streams || [])
      .filter((s) => !filter || streamStatus(s) === filter)
      .filter((s) => !nq || [s.title, s.modalityName, s.teamA, s.teamB, s.slug].join(" ").toLowerCase().includes(nq))
      .sort((a, b) => Number(b.isLive) - Number(a.isLive));
  }, [streams, filter, q]);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-1 rounded-full border border-line bg-surface p-1 text-sm" role="tablist" aria-label="Filtrar transmissões">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              type="button"
              role="tab"
              aria-selected={filter === f.key}
              onClick={() => setFilter(f.key)}
              className={"rounded-full px-3 py-1 transition max-md:min-h-11 " + (filter === f.key ? "bg-elevated text-fg" : "text-muted hover:text-fg")}
            >
              {f.label} <span className="text-xs text-muted">{counts[f.key] || 0}</span>
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <SearchBox value={q} onChange={setQ} placeholder="Buscar transmissão" />
          <button type="button" onClick={() => setCreating(true)} className="btn-primary">
            <Plus size={16} /> Nova transmissão
          </button>
        </div>
      </div>

      {streams === null ? (
        <p role="status" className="text-sm text-muted">Carregando…</p>
      ) : streams.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-line bg-surface px-6 py-14 text-center">
          <p className="text-lg font-semibold">Nenhuma transmissão criada</p>
          <p className="mt-1 text-sm text-muted">Cada transmissão tem sua própria chave para o OBS, página pública e gravações.</p>
          <button type="button" onClick={() => setCreating(true)} className="btn-primary mt-5">
            <Plus size={16} /> Criar a primeira
          </button>
        </div>
      ) : visible.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-line bg-surface px-4 py-10 text-center text-sm text-muted">
          Nenhuma transmissão neste filtro.
        </p>
      ) : (
        <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface">
          {visible.map((s) => (
            <li key={s.id}>
              <Link to={`/admin/transmissoes/${s.id}`} className="flex items-center gap-4 px-4 py-3 transition-colors hover:bg-elevated/60">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="truncate font-medium">{s.title}</span>
                    <StreamBadge stream={s} />
                    {s.listed === false && <span className="badge border border-line text-muted">Não listada</span>}
                  </div>
                  <p className="mt-0.5 truncate text-xs text-muted">
                    {s.modalityCode && <code className="mr-1 rounded bg-elevated px-1.5 py-0.5 font-mono">{s.modalityCode}</code>}
                    {[s.modalityName, (s.teamA || s.teamB) && `${s.teamA || "?"} × ${s.teamB || "?"}`, s.location].filter(Boolean).join(" · ")}
                  </p>
                </div>
                <div className="hidden text-right text-xs text-muted sm:block">
                  <p>
                    {s.isLive ? `No ar ${formatRelative(s.startedAt)}`
                      : s.endedAt && streamStatus(s) === "ended" ? `Encerrada ${formatRelative(s.endedAt)}`
                      : s.scheduledFor ? formatDateTime(s.scheduledFor) : "Sem data"}
                  </p>
                  <p>{recordingsBy.get(s.id) || 0} gravação(ões) · pico {s.peakViewers || 0}</p>
                </div>
                <ChevronRight size={16} className="shrink-0 text-muted" />
              </Link>
            </li>
          ))}
        </ul>
      )}

      <StreamForm
        open={creating}
        onClose={() => setCreating(false)}
        onSaved={(id) => { setCreating(false); navigate(`/admin/transmissoes/${id}`); }}
      />
    </div>
  );
}
