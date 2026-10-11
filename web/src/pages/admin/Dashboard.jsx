import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { AlertTriangle, Eye, Plus, Radio } from "lucide-react";
import { useLiveStatus } from "../../providers/LiveStatusProvider.jsx";
import { subscribeAllStreams } from "../../services/streams.js";
import { subscribeAllVods } from "../../services/vods.js";
import { subscribeEvents } from "../../services/system.js";
import { useServer } from "../../features/admin/useServer.js";
import StreamForm from "../../features/admin/StreamForm.jsx";
import { streamStatus } from "../../features/admin/badges.jsx";
import StatBlock from "../../components/ui/StatBlock.jsx";
import { formatBytes, formatDateTime, formatMbps, formatRelative, toDate } from "../../lib/format.js";
import { liveThumb } from "../../lib/media.js";

export default function Dashboard() {
  const navigate = useNavigate();
  const { streams: listedLive } = useLiveStatus();
  const { server, loading: serverLoading, online, mediaOnline } = useServer();
  const [streams, setStreams] = useState([]);
  const [vods, setVods] = useState([]);
  const [events, setEvents] = useState([]);
  const [creating, setCreating] = useState(false);
  const [tick, setTick] = useState(0);

  useEffect(() => { document.title = "Painel · JIFTv"; }, []);
  useEffect(() => subscribeAllStreams(setStreams), []);
  useEffect(() => subscribeAllVods(setVods), []);
  useEffect(() => subscribeEvents(15, setEvents, () => setEvents([])), []);
  useEffect(() => {
    const t = setInterval(() => setTick((n) => n + 1), 10000);
    return () => clearInterval(t);
  }, []);

  const live = streams.filter((s) => s.isLive);
  const upcoming = useMemo(() => streams
    .filter((s) => streamStatus(s) === "scheduled")
    .sort((a, b) => (toDate(a.scheduledFor)?.getTime() ?? Infinity) - (toDate(b.scheduledFor)?.getTime() ?? Infinity))
    .slice(0, 6), [streams]);

  const viewers = live.reduce((sum, s) => sum + (s.viewers || 0), 0);
  const cloud = useMemo(() => {
    const c = {};
    for (const v of vods) {
      const st = v.cloudinary?.status || (v.playbackUrl ? "uploaded" : "disabled");
      c[st] = (c[st] || 0) + 1;
    }
    return c;
  }, [vods]);
  const disk = server?.disk;
  const diskPct = disk ? Math.round((disk.used / disk.total) * 100) : null;

  return (
    <div className="space-y-6">
      {!serverLoading && !mediaOnline && (
        <div role="alert" className="flex items-start gap-3 rounded-2xl border border-live/40 bg-live/10 p-4 text-sm">
          <AlertTriangle size={18} className="mt-0.5 shrink-0 text-live" />
          <div>
            <p className="font-medium text-live">{online ? "O nginx-rtmp não está respondendo" : "Sem sinal do servidor de mídia"}</p>
            <p className="mt-0.5 text-muted">
              {server?.lastSeen ? `Último sinal ${formatRelative(server.lastSeen)}. ` : ""}
              Sem ele não há transmissão nem gravação. No computador do servidor, rode <code className="font-mono">docker compose up -d</code>.
            </p>
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-xl font-semibold">Visão geral</h2>
        <button type="button" onClick={() => setCreating(true)} className="btn-primary"><Plus size={16} /> Nova transmissão</button>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <StatBlock value={live.length} label="Ao vivo agora" hint={`${listedLive.length} listada(s) no site`} tone={live.length ? "accent" : "default"} />
        <StatBlock value={viewers} label="Espectadores agora" hint={server?.media ? `Entrada ${formatMbps(server.media.bwIn)}` : null} />
        <StatBlock value={vods.length} label="Gravações" hint={server?.recordings ? `${formatBytes(server.recordings.bytes)} na pasta local` : null} />
        <div className="rounded-2xl border border-line bg-surface p-4">
          <p className={"text-3xl font-semibold tabular-nums " + (diskPct > 90 ? "text-live" : "text-fg")}>{disk ? formatBytes(disk.free) : "—"}</p>
          <p className="mt-1 text-sm font-medium">Espaço livre</p>
          {disk && (
            <>
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-elevated">
                <div className={"h-full rounded-full " + (diskPct > 90 ? "bg-live" : "bg-accent")} style={{ width: `${diskPct}%` }} />
              </div>
              <p className="mt-1 text-xs text-muted">{diskPct}% de {formatBytes(disk.total)} usados</p>
            </>
          )}
        </div>
        <div className="rounded-2xl border border-line bg-surface p-4">
          {server?.cloudinary?.configured ? (
            <>
              <p className="text-3xl font-semibold tabular-nums">{cloud.uploaded || 0}</p>
              <p className="mt-1 text-sm font-medium">No Cloudinary</p>
              <p className="mt-0.5 text-xs text-muted">
                {(cloud.pending || 0) + (cloud.uploading || 0)} na fila · <span className={cloud.failed ? "text-live" : ""}>{cloud.failed || 0} falha(s)</span>
              </p>
            </>
          ) : (
            <>
              <p className="text-2xl font-semibold">Desligado</p>
              <p className="mt-1 text-sm font-medium">Cloudinary</p>
              <p className="mt-0.5 text-xs text-muted">Gravações só na pasta local.</p>
            </>
          )}
        </div>
      </div>

      <section className="card p-5">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="flex items-center gap-2 font-semibold">
            {live.length > 0 && <span className="h-2 w-2 animate-live-pulse rounded-full bg-live" />} No ar agora
          </h3>
          <Link to="/admin/transmissoes" className="tap text-sm text-accent hover:underline">Todas as transmissões</Link>
        </div>
        {live.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-8 text-center text-sm text-muted">
            <Radio />
            <p>Nenhuma transmissão no ar. Crie uma transmissão e use a chave dela no OBS: ela aparece aqui assim que o sinal chegar.</p>
          </div>
        ) : (
          <ul className="divide-y divide-line">
            {live.map((s) => (
              <li key={s.id} className="flex flex-col gap-3 py-3 sm:flex-row sm:items-center">
                <img src={liveThumb(s.slug, tick)} alt="" className="aspect-video w-full rounded-xl bg-black object-cover ring-2 ring-live/50 sm:w-40" />
                <div className="min-w-0 flex-1">
                  <p className="font-medium">{s.title}</p>
                  <p className="mt-0.5 text-xs text-muted">
                    {[
                      `no ar ${formatRelative(s.startedAt)}`,
                      s.input && `${s.input.width}×${s.input.height} · ${s.input.fps} fps · ${formatMbps(s.input.bitrate)}`,
                      s.qualitiesTotal && `${s.qualitiesActive || 0}/${s.qualitiesTotal} qualidades`,
                    ].filter(Boolean).join(" · ")}
                  </p>
                  <p className="mt-0.5 inline-flex items-center gap-1 text-xs text-muted"><Eye size={12} /> {s.viewers || 0} assistindo · pico {s.peakViewers || 0}</p>
                </div>
                <div className="flex gap-2">
                  <Link to={`/admin/transmissoes/${s.id}`} className="btn-ghost btn-sm">Gerenciar</Link>
                  <Link to={`/live/${s.slug}`} className="btn-ghost btn-sm">Assistir</Link>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="card p-5">
          <h3 className="mb-3 font-semibold">Próximas transmissões</h3>
          {upcoming.length === 0 ? (
            <p className="text-sm text-muted">Nada agendado. Crie uma transmissão com data e hora para ela aparecer na agenda do site.</p>
          ) : (
            <ul className="divide-y divide-line">
              {upcoming.map((s) => (
                <li key={s.id}>
                  <Link to={`/admin/transmissoes/${s.id}`} className="flex items-baseline justify-between gap-3 py-2.5 hover:text-accent">
                    <span className="min-w-0 truncate font-medium">{s.title}</span>
                    <span className="shrink-0 text-xs text-muted">{s.scheduledFor ? formatDateTime(s.scheduledFor) : "Sem data"}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="card p-5">
          <h3 className="mb-3 font-semibold">Atividade recente</h3>
          {events.length === 0 ? (
            <p className="text-sm text-muted">Sem atividade ainda.</p>
          ) : (
            <ul className="max-h-80 space-y-2 overflow-y-auto pr-1 text-sm">
              {events.map((e) => (
                <li key={e.id} className="flex items-start justify-between gap-3">
                  <span className={"min-w-0 " + (/erro|seguranca/.test(e.type) ? "text-warn" : e.type === "ao_vivo" ? "text-live" : "text-fg")}>
                    {e.message}
                  </span>
                  <time className="shrink-0 text-xs text-muted">{formatRelative(e.at)}</time>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <StreamForm
        open={creating}
        onClose={() => setCreating(false)}
        onSaved={(id) => { setCreating(false); navigate(`/admin/transmissoes/${id}`); }}
      />
    </div>
  );
}
