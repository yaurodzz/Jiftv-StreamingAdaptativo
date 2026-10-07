import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ClipboardList, CloudUpload, Download, ExternalLink, Eye, EyeOff, Pencil, RefreshCw, Trash2 } from "lucide-react";
import { deleteVod, retryUpload, setVodVisible, subscribeAllVods, updateVod } from "../../services/vods.js";
import { subscribeModalities } from "../../services/modalities.js";
import { resyncRecordings } from "../../services/system.js";
import { currentIdToken } from "../../providers/AuthProvider.jsx";
import { useToast } from "../../features/admin/ToastProvider.jsx";
import { useServer } from "../../features/admin/useServer.js";
import { CloudBadge } from "../../features/admin/badges.jsx";
import FormDialog from "../../features/admin/FormDialog.jsx";
import SearchBox from "../../features/catalog/SearchBox.jsx";
import { formatBytes, formatDateTime, formatTime, vodDuration } from "../../lib/format.js";
import { recordingUrl, vodThumb } from "../../lib/media.js";

export default function Recordings() {
  const toast = useToast();
  const { server, mediaOnline } = useServer();
  const [vods, setVods] = useState(null);
  const [q, setQ] = useState("");
  const [cloudFilter, setCloudFilter] = useState("");
  const [visFilter, setVisFilter] = useState("");
  const [editing, setEditing] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const [syncing, setSyncing] = useState(false);
  const [token, setToken] = useState(null);

  useEffect(() => { document.title = "Gravações · Painel JIFTv"; }, []);
  useEffect(() => subscribeAllVods(setVods, () => setVods([])), []);
  // Miniaturas e downloads de gravações ocultas exigem o ID token no servidor de mídia.
  useEffect(() => { currentIdToken().then(setToken); }, []);

  const cloudOn = Boolean(server?.cloudinary?.configured);

  const filtered = useMemo(() => {
    const nq = q.trim().toLowerCase();
    return (vods || []).filter((v) => {
      const status = v.cloudinary?.status || (v.playbackUrl ? "uploaded" : "disabled");
      if (cloudFilter && status !== cloudFilter) return false;
      if (visFilter === "1" && !v.visible) return false;
      if (visFilter === "0" && v.visible) return false;
      return !nq || [v.title, v.modality, v.localFile, v.id].join(" ").toLowerCase().includes(nq);
    });
  }, [vods, q, cloudFilter, visFilter]);

  const totalBytes = (vods || []).reduce((sum, v) => sum + (v.localAvailable !== false ? v.bytes || 0 : 0), 0);

  const run = async (fn, ok) => {
    try {
      await fn();
      if (ok) toast.success(ok);
    } catch (err) {
      toast.error(err.message || "Não foi possível concluir.");
    }
  };

  const sync = async () => {
    setSyncing(true);
    try {
      const r = await resyncRecordings();
      toast.success(r?.novas ? `${r.novas} gravação(ões) nova(s) encontrada(s)` : "O acervo já está em dia com a pasta");
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSyncing(false);
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <SearchBox value={q} onChange={setQ} placeholder="Buscar por título ou arquivo" />
          <select className="input h-10 w-auto" value={cloudFilter} onChange={(e) => setCloudFilter(e.target.value)} aria-label="Situação no Cloudinary">
            <option value="">Cloudinary: todas</option>
            <option value="uploaded">No Cloudinary</option>
            <option value="pending">Na fila</option>
            <option value="uploading">Enviando</option>
            <option value="failed">Falhou</option>
            <option value="disabled">Só local</option>
          </select>
          <select className="input h-10 w-auto" value={visFilter} onChange={(e) => setVisFilter(e.target.value)} aria-label="Visibilidade">
            <option value="">Visibilidade: todas</option>
            <option value="1">Visíveis no site</option>
            <option value="0">Ocultas</option>
          </select>
        </div>
        <button type="button" onClick={sync} disabled={syncing || !mediaOnline} className="btn-ghost disabled:opacity-50"
                title={mediaOnline ? "Procura vídeos novos na pasta de gravações" : "Servidor de mídia fora do ar"}>
          <RefreshCw size={15} className={syncing ? "animate-spin" : undefined} /> {syncing ? "Verificando…" : "Verificar pasta"}
        </button>
      </div>

      <p className="text-xs text-muted">
        {vods ? `${filtered.length} de ${vods.length} gravações · ${formatBytes(totalBytes)} na pasta local` : "…"}
        {!cloudOn && server !== undefined && " · Cloudinary desligado (só pasta local)"}
      </p>

      {vods === null ? (
        <p role="status" className="text-sm text-muted">Carregando…</p>
      ) : filtered.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-line bg-surface px-4 py-10 text-center text-sm text-muted">
          {vods.length ? "Nenhuma gravação neste filtro." : "Quando uma transmissão termina, o vídeo inteiro aparece aqui."}
        </p>
      ) : (
        <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface">
          {filtered.map((v) => {
            const status = v.cloudinary?.status;
            const local = v.localFile && v.localAvailable !== false;
            return (
              <li key={v.id} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
                <Link to={`/partidas/${v.id}`} className="block aspect-video w-full shrink-0 overflow-hidden rounded-xl bg-elevated sm:w-36">
                  {vodThumb(v, token) && <img src={vodThumb(v, token)} alt="" loading="lazy" className="h-full w-full object-cover" />}
                </Link>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <Link to={`/partidas/${v.id}`} className="truncate font-medium hover:text-accent">{v.title || "Sem título"}</Link>
                    {!v.visible && <span className="badge bg-warn/10 text-warn"><EyeOff size={11} /> Oculta</span>}
                    <CloudBadge vod={v} />
                  </div>
                  <p className="mt-0.5 text-xs text-muted">
                    {v.modalityCode && <code className="mr-1 rounded bg-elevated px-1.5 py-0.5 font-mono">{v.modalityCode}</code>}
                    {[formatDateTime(v.recordedAt), vodDuration(v), v.height && `${v.height}p`, formatBytes(v.bytes), `${v.views || 0} visualizações`].filter(Boolean).join(" · ")}
                  </p>
                  {v.localFile && <p className="mt-0.5 truncate font-mono text-[11px] text-muted">{v.localFile}</p>}
                  {!local && v.localFile && (
                    <p className="mt-1 text-xs text-warn">Arquivo local não encontrado{v.playbackUrl ? " · tocando do Cloudinary" : ""}.</p>
                  )}
                  {status === "failed" && (
                    <p className="mt-1 text-xs text-live">
                      {v.cloudinary?.error}
                      {v.cloudinary?.nextAttemptAt && ` · nova tentativa às ${formatTime(v.cloudinary.nextAttemptAt)}`}
                    </p>
                  )}
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <button type="button" className="icon-btn" title={v.visible ? "Ocultar do site" : "Mostrar no site"}
                          onClick={() => run(() => setVodVisible(v.id, !v.visible), v.visible ? "Gravação ocultada do site" : "Gravação visível no site")}>
                    {v.visible ? <Eye size={17} /> : <EyeOff size={17} />}
                  </button>
                  <button type="button" className="icon-btn" title="Editar" onClick={() => setEditing(v)}><Pencil size={16} /></button>
                  <Link className="icon-btn" to={`/scout/${v.id}`} title="Scout: marcar eventos dos atletas"><ClipboardList size={16} /></Link>
                  {cloudOn && local && status !== "uploading" && status !== "pending" && (
                    <button type="button" className="icon-btn" title={status === "uploaded" ? "Enviar de novo ao Cloudinary" : "Enviar ao Cloudinary agora"}
                            onClick={() => run(() => retryUpload(v.id), "Gravação colocada na fila do Cloudinary")}>
                      <CloudUpload size={17} />
                    </button>
                  )}
                  {v.cloudinary?.secureUrl && (
                    <a className="icon-btn" href={v.cloudinary.secureUrl} target="_blank" rel="noopener noreferrer" title="Abrir no Cloudinary"><ExternalLink size={16} /></a>
                  )}
                  {local && (
                    <a className="icon-btn" href={recordingUrl(v.localFile, v.visible ? null : token)} download title="Baixar"><Download size={16} /></a>
                  )}
                  <button type="button" className="icon-btn hover:text-live" title="Excluir" onClick={() => setDeleting(v)}><Trash2 size={16} /></button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <EditVodDialog vod={editing} onClose={() => setEditing(null)} />
      <DeleteVodDialog vod={deleting} mediaOnline={mediaOnline} onClose={() => setDeleting(null)} />
    </div>
  );
}

function EditVodDialog({ vod, onClose }) {
  const toast = useToast();
  const [modalities, setModalities] = useState([]);
  const [form, setForm] = useState({ title: "", description: "", modality: "", visible: true });
  const [saving, setSaving] = useState(false);

  useEffect(() => subscribeModalities(setModalities), []);
  useEffect(() => {
    if (vod) setForm({ title: vod.title || "", description: vod.description || "", modality: vod.modality || "", visible: Boolean(vod.visible) });
  }, [vod]);

  const save = async () => {
    if (!form.title.trim()) return;
    setSaving(true);
    try {
      await updateVod(vod.id, form);
      toast.success("Gravação salva");
      onClose();
    } catch (err) {
      toast.error(err.message || "Não foi possível salvar.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <FormDialog open={Boolean(vod)} title="Editar gravação" submitLabel="Salvar" submitting={saving} onClose={onClose} onSubmit={save}>
      <div className="space-y-4">
        <label className="block">
          <span className="label">Título *</span>
          <input className="input" value={form.title} required maxLength={160} onChange={(e) => setForm({ ...form, title: e.target.value })} />
        </label>
        <label className="block">
          <span className="label">Modalidade</span>
          <select className="input" value={form.modality} onChange={(e) => setForm({ ...form, modality: e.target.value })}>
            <option value="">Sem modalidade</option>
            {modalities.map((m) => <option key={m.id} value={m.name}>{m.name}</option>)}
            {form.modality && !modalities.some((m) => m.name === form.modality) && <option value={form.modality}>{form.modality}</option>}
          </select>
        </label>
        <label className="block">
          <span className="label">Descrição</span>
          <textarea className="input min-h-[84px]" value={form.description} maxLength={4000} onChange={(e) => setForm({ ...form, description: e.target.value })} />
        </label>
        <label className="flex items-center gap-3 text-sm">
          <input type="checkbox" checked={form.visible} onChange={(e) => setForm({ ...form, visible: e.target.checked })} className="h-4 w-4 accent-[rgb(var(--accent))]" />
          Visível no catálogo do site
        </label>
        {vod?.cloudinary?.error && <p className="rounded-xl border border-live/40 bg-live/10 px-3 py-2 text-xs text-live">Cloudinary: {vod.cloudinary.error}</p>}
      </div>
    </FormDialog>
  );
}

function DeleteVodDialog({ vod, mediaOnline, onClose }) {
  const toast = useToast();
  const [alsoCloud, setAlsoCloud] = useState(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => { setAlsoCloud(false); }, [vod]);

  const onCloud = Boolean(vod?.cloudinary?.publicId);

  const confirm = async () => {
    setBusy(true);
    try {
      const r = await deleteVod(vod.id, { cloudinary: alsoCloud });
      toast.success(r?.aviso ? `Gravação excluída. ${r.aviso}` : "Gravação excluída");
      onClose();
    } catch (err) {
      toast.error(err.message || "Não foi possível excluir.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <FormDialog open={Boolean(vod)} title="Excluir gravação?" submitLabel={busy ? "Excluindo…" : "Excluir"}
                submitting={busy} submitDisabled={!mediaOnline} danger onClose={onClose} onSubmit={confirm}>
      <p className="text-sm text-muted">
        O arquivo <code className="break-all font-mono text-xs text-fg">{vod?.localFile || vod?.id}</code> ({formatBytes(vod?.bytes)}) será apagado
        da pasta local e sai do catálogo. Esta ação não pode ser desfeita.
      </p>
      {onCloud && (
        <label className="mt-4 flex items-center gap-3 text-sm">
          <input type="checkbox" checked={alsoCloud} onChange={(e) => setAlsoCloud(e.target.checked)} className="h-4 w-4 accent-[rgb(var(--live))]" />
          Excluir também a cópia no Cloudinary
        </label>
      )}
      {!mediaOnline && (
        <p className="mt-4 rounded-xl border border-warn/40 bg-warn/10 px-3 py-2 text-sm text-warn">
          O servidor de mídia está fora do ar. Ligue-o para excluir arquivos.
        </p>
      )}
    </FormDialog>
  );
}
