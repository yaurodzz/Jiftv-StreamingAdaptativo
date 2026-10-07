import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { getVod } from "../services/vods.js";
import { getModalityByCode } from "../services/modalities.js";
import { subscribeApprovedAthletes } from "../services/athletes.js";
import { createScoutEvent, deleteScoutEvent, subscribeScoutEventsForVod } from "../services/scoutEvents.js";
import { currentIdToken } from "../providers/AuthProvider.jsx";
import { useToast } from "../features/admin/ToastProvider.jsx";
import { ToastProvider } from "../features/admin/ToastProvider.jsx";
import { createPlayer } from "../player/createPlayer.js";
import { cldAvatar } from "../lib/cloudinary.js";
import { vodSource, vodThumb } from "../lib/media.js";

// /scout/:vodId — ferramenta interna (admin) para marcar eventos sobre uma gravação.
// Fluxo: escolher atleta → tocar/pausar o vídeo → clicar no evento.
// O videoTime atual é lido do <video> no momento do clique, então o admin
// pode marcar com o vídeo pausado ou rodando indiferentemente.

function fmtTime(sec) {
  if (sec == null || !Number.isFinite(sec)) return "--:--";
  const s = Math.max(0, Math.floor(sec));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${String(m).padStart(2, "0")}:${String(r).padStart(2, "0")}`;
}

export default function ScoutPageWrapper() {
  return (
    <ToastProvider>
      <ScoutPage />
    </ToastProvider>
  );
}

function ScoutPage() {
  const { vodId } = useParams();
  const toast = useToast();

  const [vod, setVod] = useState(undefined);
  const [modality, setModality] = useState(null);
  const [athletes, setAthletes] = useState([]);
  const [events, setEvents] = useState([]);
  const [athleteQuery, setAthleteQuery] = useState("");
  const [selectedId, setSelectedId] = useState(null);
  const [submittingType, setSubmittingType] = useState(null);
  const [token, setToken] = useState(null);

  const videoRef = useRef(null);

  useEffect(() => {
    let cancelled = false;
    setVod(undefined);
    getVod(vodId)
      .then(async (v) => {
        if (cancelled) return;
        setVod(v);
        if (v?.modalityCode) {
          const m = await getModalityByCode(v.modalityCode);
          if (!cancelled) setModality(m);
        }
      })
      .catch(() => { if (!cancelled) setVod(null); });
    return () => { cancelled = true; };
  }, [vodId]);

  useEffect(() => subscribeApprovedAthletes(setAthletes), []);
  // Gravação oculta no servidor local: o servidor de mídia exige o ID token do admin.
  useEffect(() => { currentIdToken().then(setToken); }, []);

  useEffect(() => {
    if (!vodId) return;
    return subscribeScoutEventsForVod(vodId, setEvents, () => setEvents([]));
  }, [vodId]);

  // Player: Cloudinary quando a gravação foi enviada, senão o arquivo do servidor local.
  const src = vod ? vodSource(vod, token) : null;
  useEffect(() => {
    if (!src || !videoRef.current) return;
    const adapter = createPlayer({ video: videoRef.current, url: src, live: false });
    return () => adapter.destroy();
  }, [src]);

  useEffect(() => {
    document.title = vod?.title ? `Scout · ${vod.title}` : "Scout · JIFTv";
  }, [vod?.title]);

  const filteredAthletes = useMemo(() => {
    const code = vod?.modalityCode;
    const q = athleteQuery.trim().toLowerCase();
    return athletes
      .filter((a) => !code || a.modalityCode === code)
      .filter((a) => !q || a.name?.toLowerCase().includes(q) || String(a.jerseyNumber ?? "").includes(q));
  }, [athletes, vod?.modalityCode, athleteQuery]);

  const selected = useMemo(
    () => athletes.find((a) => a.id === selectedId) || null,
    [athletes, selectedId],
  );

  const scoutTypes = Array.isArray(modality?.scoutTypes) ? modality.scoutTypes : [];

  const athleteCounts = useMemo(() => {
    if (!selectedId) return {};
    const acc = {};
    for (const e of events) {
      if (e.athleteId !== selectedId) continue;
      acc[e.type] = (acc[e.type] || 0) + (e.value ?? 1);
    }
    return acc;
  }, [events, selectedId]);

  const submitEvent = async (type) => {
    if (!selected) {
      toast.error("Escolha um atleta antes de marcar.");
      return;
    }
    if (submittingType) return;
    const videoTime = Number(videoRef.current?.currentTime);
    setSubmittingType(type.code);
    try {
      await createScoutEvent({
        matchId: vodId,
        matchType: "vod",
        athlete: selected,
        type: type.code,
        value: 1,
        videoTime: Number.isFinite(videoTime) ? videoTime : null,
      });
      // Feedback rápido, sem toast pra cada clique (poluiria durante marcação em rajada).
    } catch (err) {
      toast.error(err.message || "Não foi possível registrar.");
    } finally {
      setSubmittingType(null);
    }
  };

  const removeEvent = async (id) => {
    try {
      await deleteScoutEvent(id);
    } catch (err) {
      toast.error(err.message || "Não foi possível remover.");
    }
  };

  const seekTo = (sec) => {
    const el = videoRef.current;
    if (!el || sec == null || !Number.isFinite(sec)) return;
    el.currentTime = sec;
    el.play?.().catch(() => {});
  };

  if (vod === undefined) {
    return <div className="mx-auto max-w-4xl px-4 py-20 text-center text-muted">Carregando…</div>;
  }
  if (vod === null) {
    return (
      <section className="mx-auto max-w-md px-4 py-20 text-center">
        <h1 className="text-2xl font-semibold">Gravação não encontrada</h1>
        <Link to="/admin/gravacoes" className="btn-ghost mt-6 inline-flex">Voltar às gravações</Link>
      </section>
    );
  }

  const typeLabel = (code) => scoutTypes.find((t) => t.code === code)?.label || code;

  return (
    <section className="mx-auto max-w-7xl px-4 py-6 md:py-8">
      <nav aria-label="Trilha de navegação" className="mb-3 text-xs text-muted">
        <Link to="/admin/gravacoes" className="hover:text-fg">Painel</Link>
        <span className="mx-2">/</span>
        <Link to={`/partidas/${vod.id}`} className="hover:text-fg">{vod.modality}</Link>
        <span className="mx-2">/</span>
        <span className="text-fg">Scout</span>
      </nav>

      <header className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
        <div className="min-w-0">
          <h1 className="truncate text-xl font-semibold md:text-2xl">{vod.title || "Sem título"}</h1>
          <p className="text-xs text-muted">
            {vod.modalityCode && <code className="mr-1 rounded bg-elevated px-1.5 py-0.5 font-mono">{vod.modalityCode}</code>}
            {vod.modality}
          </p>
        </div>
        {scoutTypes.length === 0 && modality && (
          <p className="rounded-full border border-live/50 bg-live/10 px-3 py-1 text-xs text-live">
            Modalidade sem tipos de scout. Configure em Painel → Modalidades.
          </p>
        )}
      </header>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        {/* Coluna esquerda: player + timeline */}
        <div className="space-y-4">
          <div className="overflow-hidden rounded-2xl border border-line bg-black">
            <video
              ref={videoRef}
              poster={vodThumb(vod, token) || undefined}
              controls
              playsInline
              className="aspect-video w-full bg-black"
            />
          </div>

          <div className="card p-4">
            <div className="mb-2 flex items-baseline justify-between">
              <h2 className="text-sm font-semibold">Linha do tempo</h2>
              <span className="text-xs text-muted">{events.length} evento(s)</span>
            </div>
            {events.length === 0 ? (
              <p className="rounded-xl border border-dashed border-line px-4 py-6 text-center text-xs text-muted">
                Nenhum evento marcado ainda.
              </p>
            ) : (
              <ul className="max-h-[420px] divide-y divide-line overflow-y-auto">
                {events.map((e) => (
                  <li key={e.id} className="flex items-center gap-3 py-2">
                    <button
                      onClick={() => seekTo(e.videoTime)}
                      className="w-14 shrink-0 rounded-md bg-elevated py-1 text-center font-mono text-xs text-fg hover:bg-accent hover:text-white"
                      aria-label={`Ir para ${fmtTime(e.videoTime)}`}
                    >
                      {fmtTime(e.videoTime)}
                    </button>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm">
                        <span className="font-medium">{e.athleteName || e.athleteId}</span>
                        <span className="text-muted"> · </span>
                        <span className="text-accent">{typeLabel(e.type)}</span>
                      </p>
                    </div>
                    <button
                      onClick={() => removeEvent(e.id)}
                      className="rounded-md px-2 py-1 text-xs text-muted hover:bg-live/10 hover:text-live"
                      aria-label="Remover evento"
                    >
                      remover
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        {/* Coluna direita: seletor + botões */}
        <div className="space-y-4">
          <div className="card p-4">
            <label className="text-xs font-medium text-muted">Atleta</label>
            <input
              value={athleteQuery}
              onChange={(e) => setAthleteQuery(e.target.value)}
              placeholder="Buscar por nome ou número…"
              className="input mt-1"
              aria-label="Buscar atleta"
            />

            <ul className="mt-3 max-h-[280px] space-y-1 overflow-y-auto">
              {filteredAthletes.length === 0 ? (
                <li className="rounded-xl border border-dashed border-line px-3 py-4 text-center text-xs text-muted">
                  Nenhum atleta aprovado nesta modalidade.
                </li>
              ) : (
                filteredAthletes.map((a) => {
                  const active = a.id === selectedId;
                  return (
                    <li key={a.id}>
                      <button
                        onClick={() => setSelectedId(a.id)}
                        className={
                          "flex w-full items-center gap-2 rounded-xl border px-2 py-1.5 text-left transition " +
                          (active
                            ? "border-accent bg-accent/10 text-fg"
                            : "border-line hover:border-accent/50")
                        }
                      >
                        <div className="h-8 w-8 shrink-0 overflow-hidden rounded-full bg-elevated">
                          {a.photoUrl ? (
                            <img
                              src={cldAvatar(a.photoUrl, { size: 64 })}
                              alt=""
                              width={64}
                              height={64}
                              className="h-full w-full object-cover"
                            />
                          ) : (
                            <div className="grid h-full w-full place-items-center text-xs font-bold text-muted">
                              {(a.name || "?").charAt(0)}
                            </div>
                          )}
                        </div>
                        <span className="min-w-0 flex-1 truncate text-sm">{a.name}</span>
                        {a.jerseyNumber != null && (
                          <span className="shrink-0 rounded bg-elevated px-1.5 py-0.5 font-mono text-[11px]">
                            #{a.jerseyNumber}
                          </span>
                        )}
                      </button>
                    </li>
                  );
                })
              )}
            </ul>
          </div>

          <div className="card p-4">
            <div className="mb-2 flex items-baseline justify-between">
              <h2 className="text-sm font-semibold">Marcar evento</h2>
              {selected && <span className="truncate text-xs text-muted">{selected.name}</span>}
            </div>

            {!selected ? (
              <p className="rounded-xl border border-dashed border-line px-3 py-6 text-center text-xs text-muted">
                Escolha um atleta acima.
              </p>
            ) : scoutTypes.length === 0 ? (
              <p className="rounded-xl border border-dashed border-line px-3 py-6 text-center text-xs text-muted">
                Sem tipos configurados.
              </p>
            ) : (
              <div className="grid grid-cols-2 gap-2">
                {scoutTypes.map((t) => (
                  <button
                    key={t.code}
                    onClick={() => submitEvent(t)}
                    disabled={submittingType === t.code}
                    className="group flex flex-col items-start rounded-xl border border-line px-3 py-2 text-left transition hover:border-accent hover:bg-accent/5 disabled:opacity-60"
                  >
                    <span className="text-sm font-medium">{t.label}</span>
                    <span className="mt-0.5 font-mono text-[10px] text-muted group-hover:text-accent">
                      {t.code} · total {athleteCounts[t.code] || 0}
                    </span>
                  </button>
                ))}
              </div>
            )}

            <p className="mt-3 text-[11px] text-muted">
              O tempo do vídeo é capturado no momento do clique.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
