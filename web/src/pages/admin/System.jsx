import { useCallback, useEffect, useRef, useState } from "react";
import { RefreshCw } from "lucide-react";
import { fetchLogs } from "../../services/system.js";
import { usingEmulators } from "../../lib/firebase.js";
import { env } from "../../lib/env.js";
import { useServer } from "../../features/admin/useServer.js";
import { formatBytes, formatMbps, formatNumber, formatRelative, qualityLabel } from "../../lib/format.js";

const LOGS = [
  { key: "jiftv", label: "Eventos" },
  { key: "transcode", label: "FFmpeg" },
  { key: "remux", label: "Conversão MP4" },
];

function period(s) {
  if (!s) return "–";
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return h ? `${h} h ${String(m).padStart(2, "0")} min` : `${m} min`;
}

export default function SystemPage() {
  const { server, loading, online, mediaOnline } = useServer();
  const [log, setLog] = useState("jiftv");
  const [lines, setLines] = useState(null);
  const [logError, setLogError] = useState("");
  const [loadingLog, setLoadingLog] = useState(false);
  const box = useRef(null);

  useEffect(() => { document.title = "Sistema · Painel JIFTv"; }, []);

  const loadLog = useCallback(async () => {
    setLoadingLog(true);
    setLogError("");
    try {
      const r = await fetchLogs(log);
      setLines(r?.lines || []);
    } catch (err) {
      setLines(null);
      setLogError(err.message);
    } finally {
      setLoadingLog(false);
    }
  }, [log]);

  useEffect(() => { loadLog(); }, [loadLog]);
  useEffect(() => { if (box.current) box.current.scrollTop = box.current.scrollHeight; }, [lines]);

  const disk = server?.disk;
  const diskPct = disk ? Math.round((disk.used / disk.total) * 100) : null;

  return (
    <div className="space-y-6">
      <div className="grid gap-6 lg:grid-cols-2">
        <section className="card p-5">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-semibold">Servidor de mídia</h2>
            {!loading && (
              <span className={"badge " + (mediaOnline ? "bg-accent/10 text-accent" : "bg-live/10 text-live")}>
                {mediaOnline ? "On-line" : online ? "nginx fora do ar" : "Sem sinal"}
              </span>
            )}
          </div>
          {server ? (
            <dl className="space-y-1.5 text-sm">
              <Row k="Último sinal" v={formatRelative(server.lastSeen)} />
              <Row k="nginx-rtmp ligado há" v={mediaOnline ? period(server.media?.uptime) : "–"} />
              <Row k="Entrada (OBS)" v={formatMbps(server.media?.bwIn)} />
              <Row k="Espectadores agora" v={formatNumber(server.viewers)} />
              <Row k="Versões" v={`nginx ${server.media?.nginxVersion || "–"} · rtmp ${server.media?.rtmpVersion || "–"}`} />
              <Row k="Firebase" v={server.firebaseEmulator ? "Emuladores (desenvolvimento)" : "Projeto na nuvem"} />
            </dl>
          ) : (
            <p className="text-sm text-muted">
              O worker ainda não publicou o estado do servidor. Confira se os containers estão rodando com <code className="font-mono">docker compose ps</code>.
            </p>
          )}
          {server?.qualities?.length > 0 && (
            <>
              <h3 className="mb-2 mt-5 text-sm font-medium text-muted">Qualidades geradas (streaming adaptativo)</h3>
              <div className="flex flex-wrap gap-2">
                {server.qualities.map((q) => (
                  <span key={q.height} className="rounded-full border border-line px-3 py-1 font-mono text-xs">
                    {qualityLabel(q.height)} · {formatNumber(q.kbps)} kbps
                  </span>
                ))}
              </div>
              <p className="mt-2 text-xs text-muted">Altere em <code className="font-mono">QUALIDADES</code> no .env do servidor.</p>
            </>
          )}
        </section>

        <section className="card p-5">
          <h2 className="mb-3 font-semibold">Endereços</h2>
          <dl className="space-y-3 text-sm">
            <Field k="Servidor RTMP (OBS)" v={env.rtmpUrl} />
            <Field k="Servidor de mídia (vídeo)" v={env.mediaUrl} />
            <Field k="HLS de uma transmissão" v={`${env.hlsBase}/<nome>.m3u8`} />
            <Field k="DASH de uma transmissão" v={`${env.dashBase}/<nome>/manifest.mpd`} />
          </dl>
          {window.location.protocol === "https:" && env.mediaUrl.startsWith("http:") && (
            <p className="mt-3 rounded-xl border border-live/40 bg-live/10 px-3 py-2 text-xs text-live">
              O site está em HTTPS, mas o servidor de mídia em HTTP: os navegadores bloqueiam o vídeo.
              Publique o servidor de mídia por HTTPS (túnel da Cloudflare) e ajuste <code className="font-mono">VITE_MEDIA_URL</code>.
            </p>
          )}
          {usingEmulators && <p className="mt-3 text-xs text-muted">Site em modo de desenvolvimento (emuladores do Firebase).</p>}
        </section>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="card p-5">
          <h2 className="mb-3 font-semibold">Armazenamento local</h2>
          <dl className="space-y-1.5 text-sm">
            <Row k="Gravações na pasta" v={server?.recordings ? `${server.recordings.count} · ${formatBytes(server.recordings.bytes)}` : "–"} />
            <Row k="Espaço livre" v={disk ? `${formatBytes(disk.free)} de ${formatBytes(disk.total)}` : "–"} />
            <Row k="Novas gravações" v={server ? (server.publicRecordings ? "Visíveis no site" : "Ocultas até liberar") : "–"} />
          </dl>
          {disk && (
            <div className="mt-3 h-2 overflow-hidden rounded-full bg-elevated">
              <div className={"h-full rounded-full " + (diskPct > 90 ? "bg-live" : "bg-accent")} style={{ width: `${diskPct}%` }} />
            </div>
          )}
          <p className="mt-3 text-xs text-muted">
            Os vídeos ficam em <code className="font-mono">gravacoes/videos/&lt;nome&gt;/</code> no servidor. Uma hora em 1080p a 6 Mbps ocupa cerca de 2,7 GB.
          </p>
        </section>

        <section className="card p-5">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-semibold">Cloudinary</h2>
            {server && (
              <span className={"badge " + (server.cloudinary?.configured ? "bg-accent/10 text-accent" : "border border-line text-muted")}>
                {server.cloudinary?.configured ? "Ativo" : "Desligado"}
              </span>
            )}
          </div>
          {server?.cloudinary?.configured ? (
            <dl className="space-y-1.5 text-sm">
              <Row k="Conta (cloud name)" v={server.cloudinary.cloudName} />
              <Row k="Pasta" v={<code className="font-mono text-xs">{server.cloudinary.folder}/&lt;nome&gt;</code>} />
              <Row k="Novas tentativas" v={server.cloudinary.retryMin ? `a cada ${server.cloudinary.retryMin} min (crescente)` : "desativadas"} />
            </dl>
          ) : (
            <p className="text-sm text-muted">
              Para enviar as gravações, copie a <b>API environment variable</b> do painel do Cloudinary para
              <code className="mx-1 font-mono">CLOUDINARY_URL</code> no .env do servidor e reinicie.
            </p>
          )}
          <p className="mt-3 text-xs text-muted">
            No plano gratuito, cada vídeo pode ter no máximo 100 MB. Vídeos maiores falham no envio, mas continuam salvos na pasta local.
          </p>
        </section>
      </div>

      <section className="card p-5">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-semibold">Registros (logs)</h2>
          <div className="flex items-center gap-2">
            <div className="inline-flex rounded-full border border-line bg-surface p-0.5 text-sm" role="tablist" aria-label="Arquivo de log">
              {LOGS.map((l) => (
                <button key={l.key} type="button" role="tab" aria-selected={log === l.key} onClick={() => setLog(l.key)}
                        className={"rounded-full px-3 py-1 " + (log === l.key ? "bg-elevated text-fg" : "text-muted hover:text-fg")}>
                  {l.label}
                </button>
              ))}
            </div>
            <button type="button" onClick={loadLog} className="icon-btn" aria-label="Atualizar log" disabled={loadingLog}>
              <RefreshCw size={16} className={loadingLog ? "animate-spin" : undefined} />
            </button>
          </div>
        </div>
        <pre ref={box} className="max-h-[420px] overflow-auto whitespace-pre-wrap break-all rounded-xl border border-line bg-black/90 p-3 font-mono text-xs leading-relaxed text-slate-200">
          {logError ? logError : lines === null ? "Carregando…" : lines.length ? lines.join("\n") : "(vazio)"}
        </pre>
      </section>
    </div>
  );
}

function Row({ k, v }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-muted">{k}</dt>
      <dd className="text-right">{v}</dd>
    </div>
  );
}

function Field({ k, v }) {
  return (
    <div>
      <dt className="label">{k}</dt>
      <dd><code className="block break-all rounded-lg bg-elevated px-2 py-1.5 font-mono text-xs">{v}</code></dd>
    </div>
  );
}
