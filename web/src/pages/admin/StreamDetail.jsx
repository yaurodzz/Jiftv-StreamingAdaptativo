import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, ExternalLink, Minus, Pencil, Plus, Radio, Square, Trash2 } from "lucide-react";
import { deleteStream, setKeyActive, setScore, subscribeStream } from "../../services/streams.js";
import { subscribeAllVods } from "../../services/vods.js";
import LivePlayer from "../../features/live/LivePlayer.jsx";
import { useUptime } from "../../features/live/useUptime.js";
import StreamConfigCard from "../../features/admin/StreamConfigCard.jsx";
import StreamForm from "../../features/admin/StreamForm.jsx";
import ConfirmDialog from "../../features/admin/ConfirmDialog.jsx";
import { useToast } from "../../features/admin/ToastProvider.jsx";
import { useClipboard } from "../../features/admin/useClipboard.js";
import { CloudBadge, StreamBadge } from "../../features/admin/badges.jsx";
import { formatBytes, formatDateTime, formatMbps, vodDuration } from "../../lib/format.js";
import { liveUrl, vodThumb } from "../../lib/media.js";

export default function StreamDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const [stream, setStream] = useState(undefined);
  const [vods, setVods] = useState([]);
  const [editing, setEditing] = useState(false);
  const [confirm, setConfirm] = useState(null); // "end" | "delete"
  const link = useClipboard();

  useEffect(() => subscribeStream(id, setStream, () => setStream(null)), [id]);
  useEffect(() => subscribeAllVods(setVods), []);
  useEffect(() => { document.title = stream?.title ? `${stream.title} · Painel JIFTv` : "Transmissão · Painel JIFTv"; }, [stream?.title]);

  const recordings = useMemo(() => vods.filter((v) => v.sourceStreamId === id), [vods, id]);
  const uptime = useUptime(stream?.isLive ? stream.startedAt : null);

  if (stream === undefined) return <p role="status" className="text-sm text-muted">Carregando…</p>;
  if (stream === null) {
    return (
      <div className="rounded-2xl border border-dashed border-line bg-surface px-6 py-14 text-center">
        <p className="text-lg font-semibold">Transmissão não encontrada</p>
        <Link to="/admin/transmissoes" className="btn-ghost mt-4 inline-flex">Voltar às transmissões</Link>
      </div>
    );
  }

  const run = async (fn, ok) => {
    try {
      await fn();
      if (ok) toast.success(ok);
    } catch (err) {
      toast.error(err.message || "Não foi possível concluir.");
    }
  };

  const changeScore = (field, delta) => {
    const next = { scoreA: stream.scoreA || 0, scoreB: stream.scoreB || 0 };
    next[field] = Math.max(0, next[field] + delta);
    run(() => setScore(stream.id, next.scoreA, next.scoreB));
  };

  const endStream = () => {
    setConfirm(null);
    run(() => setKeyActive(stream.id, false), "Transmissão encerrada. A chave ficou bloqueada.");
  };

  const remove = async () => {
    setConfirm(null);
    try {
      await deleteStream(stream.id);
      toast.success("Transmissão excluída");
      navigate("/admin/transmissoes");
    } catch (err) {
      toast.error(err.message || "Não foi possível excluir.");
    }
  };

  const publicUrl = `${window.location.origin}/live/${stream.slug}`;
  const input = stream.input;
  const hasTeams = stream.teamA || stream.teamB;

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <Link to="/admin/transmissoes" className="inline-flex items-center gap-1 text-xs text-muted hover:text-fg max-md:min-h-11">
            <ArrowLeft size={13} /> Transmissões
          </Link>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <h2 className="text-2xl font-semibold">{stream.title}</h2>
            <StreamBadge stream={stream} />
          </div>
          <p className="mt-1 text-sm text-muted">
            {[stream.modalityName, stream.location, stream.scheduledFor && `prevista para ${formatDateTime(stream.scheduledFor)}`].filter(Boolean).join(" · ") || "Sem detalhes"}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link to={`/live/${stream.slug}`} target="_blank" className="btn-ghost"><ExternalLink size={15} /> Página pública</Link>
          <button type="button" onClick={() => setEditing(true)} className="btn-ghost"><Pencil size={15} /> Editar</button>
          {stream.isLive && (
            <button type="button" onClick={() => setConfirm("end")} className="btn-danger"><Square size={14} /> Encerrar transmissão</button>
          )}
          <button type="button" onClick={() => setConfirm("delete")} className="icon-btn hover:text-live" aria-label="Excluir transmissão" title="Excluir transmissão">
            <Trash2 size={17} />
          </button>
        </div>
      </header>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
        <div className="space-y-6">
          <section className="rounded-2xl border border-line bg-surface p-5">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
              <h3 className="flex items-center gap-2 font-semibold">
                {stream.isLive && <span className="h-2 w-2 animate-live-pulse rounded-full bg-live" />}
                {stream.isLive ? "No ar" : "Sinal"}
              </h3>
              {stream.isLive && (
                <span className="text-xs text-muted">há {uptime} · {stream.viewers || 0} assistindo · pico {stream.peakViewers || 0}</span>
              )}
            </div>

            {stream.isLive ? (
              <>
                <LivePlayer src={liveUrl(stream.slug)} compact />
                <dl className="mt-4 grid gap-x-6 gap-y-2 border-t border-line pt-4 text-sm sm:grid-cols-2">
                  <Info label="Entrada (OBS)" value={input ? `${input.width}×${input.height} · ${input.fps} fps` : "–"} />
                  <Info label="Bitrate recebido" value={formatMbps(input?.bitrate)} />
                  <Info label="Codecs" value={input ? `${input.videoCodec || "–"} / ${input.audioCodec || "sem áudio"}` : "–"} />
                  <Info label="Origem" value={stream.origin || "–"} />
                  <Info
                    label="Qualidades geradas"
                    value={stream.qualitiesTotal ? `${stream.qualitiesActive || 0} de ${stream.qualitiesTotal}` : "–"}
                    tone={stream.qualitiesActive < stream.qualitiesTotal ? "text-warn" : "text-accent"}
                  />
                  <Info label="Gravação" value="Gravando o sinal original" tone="text-accent" />
                </dl>
                {input && !input.audioCodec && (
                  <p className="mt-3 rounded-xl border border-warn/40 bg-warn/10 px-3 py-2 text-sm text-warn">
                    O sinal chegou sem áudio. Confira a saída de áudio do OBS (AAC).
                  </p>
                )}
              </>
            ) : (
              <div className="flex flex-wrap items-center gap-4 rounded-xl border border-dashed border-line bg-elevated/40 p-5">
                <Radio className="text-muted" />
                <div className="min-w-0 flex-1">
                  <p className="font-medium">{stream.keyActive === false ? "Chave bloqueada" : "Aguardando o OBS"}</p>
                  <p className="text-sm text-muted">
                    {stream.keyActive === false
                      ? "O OBS não consegue transmitir enquanto a chave estiver bloqueada."
                      : "Inicie a transmissão no OBS com os dados ao lado. Esta tela atualiza sozinha."}
                  </p>
                </div>
                {stream.keyActive === false && (
                  <button type="button" onClick={() => run(() => setKeyActive(stream.id, true), "Chave liberada: o OBS já pode transmitir")} className="btn-primary">
                    Liberar chave
                  </button>
                )}
              </div>
            )}
          </section>

          {hasTeams && (
            <section className="rounded-2xl border border-line bg-surface p-5">
              <div className="mb-4 flex items-center justify-between">
                <h3 className="font-semibold">Placar</h3>
                <button type="button" onClick={() => run(() => setScore(stream.id, 0, 0), "Placar zerado")} className="btn-ghost btn-sm">Zerar</button>
              </div>
              <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-4">
                <ScoreSide name={stream.teamA || "Equipe A"} value={stream.scoreA || 0} onChange={(d) => changeScore("scoreA", d)} />
                <span className="text-2xl text-muted">×</span>
                <ScoreSide name={stream.teamB || "Equipe B"} value={stream.scoreB || 0} onChange={(d) => changeScore("scoreB", d)} />
              </div>
              <p className="mt-4 text-xs text-muted">O placar aparece na hora para quem está assistindo.</p>
            </section>
          )}

          <section className="rounded-2xl border border-line bg-surface p-5">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="font-semibold">Gravações <span className="text-sm font-normal text-muted">{recordings.length}</span></h3>
              {recordings.length > 0 && <Link to="/admin/gravacoes" className="tap text-sm text-accent hover:underline">Gerenciar</Link>}
            </div>
            {recordings.length === 0 ? (
              <p className="text-sm text-muted">
                {stream.isLive ? "A gravação em andamento aparece aqui quando a transmissão terminar." : "Cada vez que o OBS transmitir, o vídeo inteiro é gravado e aparece aqui."}
              </p>
            ) : (
              <ul className="divide-y divide-line">
                {recordings.map((v) => (
                  <li key={v.id}>
                    <Link to={`/partidas/${v.id}`} className="flex items-center gap-3 py-2.5 hover:text-accent">
                      <span className="block aspect-video w-24 shrink-0 overflow-hidden rounded-lg bg-elevated">
                        {vodThumb(v) && <img src={vodThumb(v)} alt="" loading="lazy" className="h-full w-full object-cover" />}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-medium">{formatDateTime(v.recordedAt)}</span>
                        <span className="block text-xs text-muted">{vodDuration(v) || "–"} · {formatBytes(v.bytes)} · {v.views || 0} visualizações</span>
                      </span>
                      <CloudBadge vod={v} />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>

        <aside className="space-y-6">
          <StreamConfigCard stream={stream} />
          <section className="rounded-2xl border border-line bg-surface p-5">
            <h3 className="font-semibold">Link para os espectadores</h3>
            <div className="mt-2 flex gap-2">
              <input readOnly value={publicUrl} className="input font-mono text-xs" aria-label="Link público" onFocus={(e) => e.target.select()} />
              <button type="button" onClick={() => link.copy(publicUrl).then((ok) => ok && toast.info("Link copiado"))} className="btn-ghost btn-sm shrink-0">
                {link.copied ? "Copiado" : "Copiar"}
              </button>
            </div>
            <dl className="mt-4 space-y-1.5 text-sm">
              <Info label="No site" value={stream.listed === false ? "Só com o link" : "Listada"} />
              <Info label="Última vez no ar" value={stream.startedAt ? formatDateTime(stream.startedAt) : "Nunca"} />
              <Info label="Pico de espectadores" value={stream.peakViewers || 0} />
              <Info label="Nome público" value={<code className="font-mono text-xs">{stream.slug}</code>} />
            </dl>
          </section>
        </aside>
      </div>

      <StreamForm open={editing} stream={stream} onClose={() => setEditing(false)} onSaved={() => setEditing(false)} />
      <ConfirmDialog
        open={confirm === "end"}
        title="Encerrar transmissão?"
        description="O OBS será desconectado e a chave ficará bloqueada (senão o OBS reconecta sozinho). A gravação é finalizada e salva normalmente. Você pode liberar a chave depois."
        confirmLabel="Encerrar transmissão"
        onConfirm={endStream}
        onCancel={() => setConfirm(null)}
      />
      <ConfirmDialog
        open={confirm === "delete"}
        title={`Excluir “${stream.title}”?`}
        description={`A transmissão e a chave serão apagadas${stream.isLive ? " e o OBS desconectado" : ""}. As gravações continuam no catálogo.`}
        confirmLabel="Excluir"
        onConfirm={remove}
        onCancel={() => setConfirm(null)}
      />
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

function ScoreSide({ name, value, onChange }) {
  return (
    <div className="flex min-w-0 flex-col items-center gap-2 text-center">
      <span className="max-w-full truncate font-medium">{name}</span>
      <div className="flex items-center gap-3">
        <button type="button" onClick={() => onChange(-1)} className="icon-btn border border-line" aria-label={`Diminuir ${name}`}><Minus size={16} /></button>
        <b className="min-w-[2ch] text-4xl font-semibold tabular-nums">{value}</b>
        <button type="button" onClick={() => onChange(1)} className="icon-btn border border-accent/40 bg-accent/10 text-accent hover:bg-accent hover:text-white" aria-label={`Aumentar ${name}`}><Plus size={16} /></button>
      </div>
    </div>
  );
}
