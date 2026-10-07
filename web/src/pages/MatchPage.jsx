import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Download, Eye, EyeOff, Link2 } from "lucide-react";
import { addView, getVod, subscribeVods } from "../services/vods.js";
import { currentIdToken, useAuth } from "../providers/AuthProvider.jsx";
import VodPlayer from "../features/catalog/VodPlayer.jsx";
import Scoreboard from "../features/live/Scoreboard.jsx";
import MediaCard from "../components/ui/MediaCard.jsx";
import { useClipboard } from "../features/admin/useClipboard.js";
import { formatBytes, formatDateTime, formatNumber, vodDuration, vodSubtitle } from "../lib/format.js";
import { isPlayable, recordingUrl, vodSource, vodThumb } from "../lib/media.js";

// Página de gravação (/partidas/:id).
// Mostra a partida no player, o placar final e "Mais de {modalidade}" logo abaixo.
export default function MatchPage() {
  const { id } = useParams();
  const { isAdmin } = useAuth();
  const [vod, setVod] = useState(undefined);      // undefined = carregando, null = 404
  const [token, setToken] = useState(null);
  const [siblings, setSiblings] = useState([]);
  const counted = useRef(false);
  const clip = useClipboard();

  useEffect(() => {
    let cancelled = false;
    setVod(undefined);
    counted.current = false;
    // Gravações ocultas não são legíveis pelo público (regras do Firestore): vira 404.
    getVod(id)
      .then((v) => { if (!cancelled) setVod(v); })
      .catch(() => { if (!cancelled) setVod(null); });
    return () => { cancelled = true; };
  }, [id]);

  // Admin vendo uma gravação oculta: o servidor de mídia exige o ID token.
  useEffect(() => {
    if (vod && !vod.visible && isAdmin) currentIdToken().then(setToken);
  }, [vod, isAdmin]);

  useEffect(() => {
    if (!vod?.modality) { setSiblings([]); return undefined; }
    return subscribeVods((list) => setSiblings(
      list.filter((v) => v.id !== vod.id && v.modality === vod.modality && isPlayable(v)).slice(0, 8),
    ));
  }, [vod?.modality, vod?.id]);

  useEffect(() => {
    document.title = vod?.title ? `${vod.title} · JIFTv` : "Gravação · JIFTv";
  }, [vod?.title]);

  const duration = useMemo(() => (vod ? vodDuration(vod) : null), [vod]);

  const onPlay = () => {
    if (counted.current || !vod?.visible) return;
    counted.current = true;
    addView(vod.id).catch(() => {});
  };

  if (vod === undefined) {
    return <div role="status" className="mx-auto max-w-4xl px-4 py-20 text-center text-muted">Carregando…</div>;
  }

  if (vod === null) {
    return (
      <section className="mx-auto max-w-md px-4 py-20 text-center">
        <h1 className="text-2xl font-semibold">Gravação não encontrada</h1>
        <p className="mt-2 text-muted">A partida pode ter sido removida ou ocultada do catálogo.</p>
        <Link to="/catalogo" className="btn-ghost mt-6 inline-flex">Voltar ao catálogo</Link>
      </section>
    );
  }

  const needsToken = !vod.visible && !vod.playbackUrl;
  const src = needsToken && !token ? null : vodSource(vod, token);
  const download = vod.localFile && vod.localAvailable !== false ? recordingUrl(vod.localFile, vod.visible ? null : token) : null;

  return (
    <section className="mx-auto max-w-6xl px-4 py-8 md:py-10">
      <nav aria-label="Trilha de navegação" className="mb-4 text-xs text-muted">
        <Link to="/catalogo" className="hover:text-fg">Catálogo</Link>
        <span className="mx-2">/</span>
        <span className="text-fg">{vod.modality || "Gravação"}</span>
      </nav>

      {!vod.visible && (
        <p className="mb-4 inline-flex items-center gap-2 rounded-xl border border-warn/40 bg-warn/10 px-3 py-2 text-sm text-warn">
          <EyeOff size={15} /> Gravação oculta: só quem está no painel consegue ver.
        </p>
      )}

      <div className="mx-auto max-w-[min(100%,calc((100vh-260px)*16/9))]">
        {src ? (
          <VodPlayer src={src} poster={vodThumb(vod, token)} onPlay={onPlay} />
        ) : (
          <div className="grid aspect-video place-items-center rounded-2xl border border-line bg-surface px-6 text-center text-muted">
            {isPlayable(vod) ? "Carregando…" : "O arquivo desta gravação não está disponível no momento."}
          </div>
        )}
      </div>

      <header className="mx-auto mt-5 flex max-w-[min(100%,calc((100vh-260px)*16/9))] flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-sm text-accent">{vod.modality || "Gravação"}</p>
          <h1 className="mt-1 text-2xl font-semibold md:text-3xl">{vod.title}</h1>
          <p className="mt-2 text-sm text-muted">
            Gravada em <span className="text-fg">{formatDateTime(vod.recordedAt) || "data indisponível"}</span>
            {duration && <> · duração <span className="text-fg">{duration}</span></>}
            {vod.height ? <> · {vod.height}p</> : null}
            <> · <Eye size={13} className="inline -mt-0.5" /> {formatNumber(vod.views)}</>
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => clip.copy(window.location.href)} className="btn-ghost">
            <Link2 size={15} /> {clip.copied ? "Link copiado" : "Copiar link"}
          </button>
          {download && (
            <a href={download} download className="btn-ghost">
              <Download size={15} /> Baixar{vod.bytes ? ` (${formatBytes(vod.bytes)})` : ""}
            </a>
          )}
        </div>
      </header>

      <div className="mx-auto mt-4 grid max-w-[min(100%,calc((100vh-260px)*16/9))] gap-4 md:grid-cols-[minmax(0,1fr)_320px]">
        {vod.description ? <p className="whitespace-pre-line text-muted">{vod.description}</p> : <span />}
        {(vod.teamA || vod.teamB) && <Scoreboard stream={vod} />}
      </div>

      {siblings.length > 0 && (
        <section className="mt-14">
          <h2 className="mb-4 text-lg font-semibold">
            Mais de {vod.modality}
            <span className="ml-2 text-sm font-normal text-muted">{siblings.length}</span>
          </h2>
          <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
            {siblings.map((v) => (
              <MediaCard
                key={v.id}
                to={`/partidas/${v.id}`}
                title={v.title || "Sem título"}
                subtitle={vodSubtitle(v)}
                thumbnail={vodThumb(v)}
                duration={vodDuration(v)}
              />
            ))}
          </div>
        </section>
      )}
    </section>
  );
}
