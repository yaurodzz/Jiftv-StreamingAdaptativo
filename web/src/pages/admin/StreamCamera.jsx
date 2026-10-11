import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, Radio, Square, SwitchCamera } from "lucide-react";
import { subscribeStream } from "../../services/streams.js";
import { QUALITIES, cameraSupported, useCameraBroadcast } from "../../features/admin/useCameraBroadcast.js";
import { useUptime } from "../../features/live/useUptime.js";
import { formatBytes } from "../../lib/format.js";

// Transmitir pelo celular: a câmera deste aparelho vai para o servidor pelo navegador,
// de qualquer rede (4G incluso), sem aplicativo e sem abrir porta na rede da escola.
export default function StreamCamera() {
  const { id } = useParams();
  const [stream, setStream] = useState(undefined);
  const [compat, setCompat] = useState(false);
  const cam = useCameraBroadcast(id);
  const uptime = useUptime(cam.status === "idle" ? null : cam.stats.since);

  useEffect(() => subscribeStream(id, setStream, () => setStream(null)), [id]);
  useEffect(() => { document.title = "Transmitir pelo celular · Painel JIFTv"; }, []);

  if (stream === undefined) return <p role="status" className="text-sm text-muted">Carregando…</p>;
  if (stream === null) {
    return (
      <div className="rounded-2xl border border-dashed border-line bg-surface px-6 py-14 text-center">
        <p className="text-lg font-semibold">Transmissão não encontrada</p>
        <Link to="/admin/transmissoes" className="btn-ghost mt-4 inline-flex">Voltar às transmissões</Link>
      </div>
    );
  }

  const idle = cam.status === "idle";
  const blocked = stream.keyActive === false;
  // Com mais de ~3 s de vídeo esperando para sair, a rede do celular não está dando conta
  const slow = cam.status === "live" && cam.stats.queued > 1_000_000;

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <header>
        <Link to={`/admin/transmissoes/${id}`} className="inline-flex items-center gap-1 text-xs text-muted hover:text-fg max-md:min-h-11">
          <ArrowLeft size={13} /> {stream.title}
        </Link>
        <h2 className="mt-1 text-2xl font-semibold">Transmitir pelo celular</h2>
        <p className="mt-1 text-sm text-muted">
          A câmera deste aparelho vai direto para o servidor, por Wi-Fi ou 4G. Deixe esta página aberta e o celular deitado.
        </p>
      </header>

      {!cameraSupported() ? (
        <p className="rounded-xl border border-warn/40 bg-warn/10 px-3 py-2 text-sm text-warn">
          Este navegador não consegue gravar a câmera. Use o Chrome (Android) ou o Safari (iPhone) atualizados, pelo endereço https.
        </p>
      ) : (
        <>
          <div className="relative overflow-hidden rounded-2xl border border-line bg-black max-md:-mx-4 max-md:rounded-none max-md:border-x-0">
            <video ref={cam.attachPreview} autoPlay muted playsInline className="aspect-video w-full object-contain" />
            <div className="absolute left-3 top-3 flex items-center gap-2">
              {cam.status === "live" && (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-live px-2.5 py-1 text-xs font-semibold text-white">
                  <span className="h-1.5 w-1.5 animate-live-pulse rounded-full bg-white" /> ENVIANDO · {uptime}
                </span>
              )}
              {(cam.status === "connecting" || cam.status === "reconnecting") && (
                <span role="status" className="rounded-full bg-black/70 px-2.5 py-1 text-xs font-medium text-white">
                  {cam.status === "connecting" ? "Conectando…" : "Sem conexão, tentando de novo…"}
                </span>
              )}
            </div>
            <button
              type="button"
              disabled={!idle}
              onClick={() => cam.setFacing((f) => (f === "environment" ? "user" : "environment"))}
              className="icon-btn absolute right-3 top-3 bg-black/60 text-white disabled:opacity-40"
              aria-label="Trocar entre a câmera traseira e a frontal"
              title="Trocar câmera"
            >
              <SwitchCamera size={18} />
            </button>
          </div>

          {cam.error && (
            <p role="alert" className="rounded-xl border border-live/40 bg-live/10 px-3 py-2 text-sm text-live">{cam.error}</p>
          )}
          {slow && (
            <p className="rounded-xl border border-warn/40 bg-warn/10 px-3 py-2 text-sm text-warn">
              A internet do celular está lenta para esta qualidade. Pare e escolha uma qualidade menor.
            </p>
          )}
          {blocked && idle && (
            <p className="rounded-xl border border-warn/40 bg-warn/10 px-3 py-2 text-sm text-warn">
              A chave desta transmissão está bloqueada. Libere na página da transmissão antes de transmitir.
            </p>
          )}

          <section className="space-y-4 rounded-2xl border border-line bg-surface p-5">
            {idle ? (
              <>
                <label className="block text-sm">
                  <span className="text-muted">Qualidade</span>
                  <select value={cam.quality} onChange={(e) => cam.setQuality(e.target.value)} className="input mt-1">
                    {QUALITIES.map((q) => <option key={q.id} value={q.id}>{q.label}</option>)}
                  </select>
                </label>
                <label className="flex items-start gap-3 text-sm max-md:min-h-11">
                  <input type="checkbox" checked={compat} onChange={(e) => setCompat(e.target.checked)} className="mt-1 h-4 w-4 accent-[rgb(var(--accent))]" />
                  <span>
                    Modo compatível
                    <span className="block text-xs text-muted">Marque só se a imagem chegar travada ou não aparecer. O servidor recodifica o vídeo e usa mais processador.</span>
                  </span>
                </label>
                <button type="button" disabled={!cam.ready || blocked} onClick={() => cam.start({ compat })} className="btn-primary w-full">
                  <Radio size={16} /> {cam.ready ? "Começar a transmitir" : "Abrindo a câmera…"}
                </button>
              </>
            ) : (
              <>
                <dl className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
                  <Info label="No site" value={stream.isLive ? "No ar" : "Aguardando o servidor"} tone={stream.isLive ? "text-accent" : "text-warn"} />
                  <Info label="Assistindo" value={stream.isLive ? stream.viewers || 0 : "–"} />
                  <Info label="Enviado" value={formatBytes(cam.stats.bytes)} />
                  <Info label="Vídeo no servidor" value={cam.stats.video === "x264" ? "Recodificado" : cam.stats.video === "copy" ? "Direto" : "–"} />
                </dl>
                <button type="button" onClick={() => cam.stop()} className="btn-danger w-full">
                  <Square size={14} /> Parar de transmitir
                </button>
              </>
            )}
          </section>

          <ul className="list-disc space-y-1 pl-5 text-xs text-muted">
            <li>Não troque de aplicativo nem bloqueie a tela: o navegador para a câmera e a transmissão cai.</li>
            <li>Cada vez que você começa, o servidor grava um vídeo novo no catálogo.</li>
            <li>No 4G, 720p gasta perto de 1,2 GB por hora.</li>
          </ul>
        </>
      )}
    </div>
  );
}

function Info({ label, value, tone = "" }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-muted">{label}</dt>
      <dd className={"text-right tabular-nums " + tone}>{value}</dd>
    </div>
  );
}
