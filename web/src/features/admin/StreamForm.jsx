import { useEffect, useState } from "react";
import { createStream, updateStream } from "../../services/streams.js";
import { subscribeModalities } from "../../services/modalities.js";
import { toDate } from "../../lib/format.js";
import FormDialog from "./FormDialog.jsx";
import { useToast } from "./ToastProvider.jsx";

const pad = (n) => String(n).padStart(2, "0");
function toInput(ts) {
  const d = toDate(ts);
  if (!d) return "";
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

const empty = { title: "", modalityId: "", location: "", teamA: "", teamB: "", scheduledFor: "", description: "", listed: true };

// Criação e edição de transmissão. Ao criar, a chave do OBS é gerada no navegador
// (crypto.getRandomValues) e gravada em `streamKeys`, que só o painel lê.
export default function StreamForm({ open, stream, onClose, onSaved }) {
  const toast = useToast();
  const [modalities, setModalities] = useState([]);
  const [form, setForm] = useState(empty);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => subscribeModalities(setModalities), []);

  useEffect(() => {
    if (!open) return;
    setForm(stream ? {
      title: stream.title || "",
      modalityId: stream.modalityId || "",
      location: stream.location || "",
      teamA: stream.teamA || "",
      teamB: stream.teamB || "",
      scheduledFor: toInput(stream.scheduledFor),
      description: stream.description || "",
      listed: stream.listed !== false,
    } : empty);
  }, [open, stream]);

  const set = (field) => (e) => setForm((f) => ({ ...f, [field]: e.target.type === "checkbox" ? e.target.checked : e.target.value }));

  const submit = async () => {
    if (!form.title.trim() || submitting) return;
    setSubmitting(true);
    try {
      const modality = modalities.find((m) => m.id === form.modalityId) || null;
      if (stream) {
        await updateStream(stream.id, form, modality);
        toast.success("Transmissão salva");
        onSaved?.(stream.id);
      } else {
        const id = await createStream(form, modality);
        toast.success("Transmissão criada. Agora configure o OBS com a chave dela.");
        onSaved?.(id);
      }
    } catch (err) {
      toast.error(err.message || "Não foi possível salvar a transmissão.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <FormDialog
      open={open}
      title={stream ? "Editar transmissão" : "Nova transmissão"}
      submitLabel={stream ? "Salvar" : "Criar transmissão"}
      submitting={submitting}
      onClose={onClose}
      onSubmit={submit}
      wide
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="sm:col-span-2">
          <span className="label">Título *</span>
          <input className="input" value={form.title} onChange={set("title")} required maxLength={120}
                 placeholder="Ex.: Semifinal Futsal — Câmpus Florianópolis" autoFocus />
        </label>
        <label>
          <span className="label">Modalidade</span>
          <select className="input" value={form.modalityId} onChange={set("modalityId")}>
            <option value="">Sem modalidade</option>
            {modalities.map((m) => (
              <option key={m.id} value={m.id}>{m.code ? `${m.code} — ${m.name}` : m.name}</option>
            ))}
          </select>
          {modalities.length === 0 && (
            <span className="mt-1 block text-xs text-muted">Cadastre modalidades na aba Modalidades.</span>
          )}
        </label>
        <label>
          <span className="label">Local</span>
          <input className="input" value={form.location} onChange={set("location")} maxLength={120} placeholder="Ginásio do câmpus" />
        </label>
        <label>
          <span className="label">Equipe A</span>
          <input className="input" value={form.teamA} onChange={set("teamA")} maxLength={60} placeholder="Opcional (ativa o placar)" />
        </label>
        <label>
          <span className="label">Equipe B</span>
          <input className="input" value={form.teamB} onChange={set("teamB")} maxLength={60} placeholder="Opcional" />
        </label>
        <label>
          <span className="label">Data e hora previstas</span>
          <input className="input" type="datetime-local" value={form.scheduledFor} onChange={set("scheduledFor")} />
        </label>
        <label className="flex items-center gap-3 self-end rounded-xl border border-line px-3 py-2.5 text-sm">
          <input type="checkbox" checked={form.listed} onChange={set("listed")} className="h-4 w-4 accent-[rgb(var(--accent))]" />
          <span>
            Listar no site
            <span className="block text-xs text-muted">{form.listed ? "Aparece no ao vivo e na agenda" : "Só quem tiver o link assiste"}</span>
          </span>
        </label>
        <label className="sm:col-span-2">
          <span className="label">Descrição</span>
          <textarea className="input min-h-[84px]" value={form.description} onChange={set("description")} maxLength={4000}
                    placeholder="Informações para quem vai assistir" />
        </label>
      </div>
    </FormDialog>
  );
}
