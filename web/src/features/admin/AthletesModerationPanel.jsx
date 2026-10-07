import { useEffect, useMemo, useState } from "react";
import { approveAthlete, deleteAthlete, rejectAthlete, subscribeAthletesAdmin, updateAthlete } from "../../services/athletes.js";
import { cldAvatar } from "../../lib/cloudinary.js";
import { computeAge, classLine } from "../athletes/format.js";
import FormDialog from "./FormDialog.jsx";
import { useToast } from "./ToastProvider.jsx";
import ConfirmDialog from "./ConfirmDialog.jsx";

// Painel de moderação de atletas. Três abas internas: Pendentes, Aprovados, Rejeitados.
// - Aprovar: um clique (ação positiva, low-risk).
// - Rejeitar: abre diálogo com campo opcional "motivo" (fica no doc pra auditoria).
// - Remover (só para spam óbvio): confirmação separada.

const TABS = [
  { key: "pending",  label: "Pendentes" },
  { key: "approved", label: "Aprovados" },
  { key: "rejected", label: "Rejeitados" },
];

export default function AthletesModerationPanel({ onPendingCount }) {
  const toast = useToast();
  const [tab, setTab] = useState("pending");
  const [list, setList] = useState(null);
  const [reject, setReject] = useState(null); // { athlete, reason }
  const [remove, setRemove] = useState(null); // athlete
  const [editing, setEditing] = useState(null); // athlete

  // Contagem de pendentes fica sempre atualizada, mesmo quando a aba ativa é outra.
  useEffect(() => subscribeAthletesAdmin({ status: "pending" }, (l) => onPendingCount?.(l.length)), [onPendingCount]);

  useEffect(() => {
    setList(null);
    return subscribeAthletesAdmin({ status: tab }, setList);
  }, [tab]);

  const approve = async (a) => {
    try {
      await approveAthlete(a.id);
      toast.success(`${a.name} aprovado(a)`);
    } catch (err) {
      toast.error(err.message || "Não foi possível aprovar.");
    }
  };

  const confirmReject = async () => {
    if (!reject) return;
    const { athlete, reason } = reject;
    setReject(null);
    try {
      await rejectAthlete(athlete.id, reason);
      toast.success(`${athlete.name} rejeitado(a)`);
    } catch (err) {
      toast.error(err.message || "Não foi possível rejeitar.");
    }
  };

  const confirmRemove = async () => {
    if (!remove) return;
    const a = remove;
    setRemove(null);
    try {
      await deleteAthlete(a.id);
      toast.success(`${a.name} removido(a)`);
    } catch (err) {
      toast.error(err.message || "Não foi possível remover.");
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold">Atletas</h2>
        <div role="tablist" aria-label="Filtro por status" className="flex gap-1 rounded-full border border-line bg-surface p-1 text-sm">
          {TABS.map((t) => (
            <button
              key={t.key}
              role="tab"
              aria-selected={tab === t.key}
              onClick={() => setTab(t.key)}
              className={
                "rounded-full px-3 py-1 " +
                (tab === t.key ? "bg-accent text-white" : "text-muted hover:text-fg")
              }
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {list === null ? (
        <p className="text-sm text-muted">Carregando…</p>
      ) : list.length === 0 ? (
        <EmptyState tab={tab} />
      ) : (
        <ul className="grid gap-3 md:grid-cols-2">
          {list.map((a) => (
            <AthleteRow
              key={a.id}
              athlete={a}
              tab={tab}
              onApprove={() => approve(a)}
              onReject={() => setReject({ athlete: a, reason: "" })}
              onRemove={() => setRemove(a)}
              onEdit={() => setEditing(a)}
            />
          ))}
        </ul>
      )}

      <ConfirmDialog
        open={!!reject}
        title={reject ? `Rejeitar “${reject.athlete.name}”?` : ""}
        description={
          <>
            <p className="mb-2 text-sm text-muted">
              O perfil deixa de aparecer em qualquer lugar. Fica salvo com o motivo abaixo para auditoria.
            </p>
            <textarea
              placeholder="Motivo (opcional)"
              rows={3}
              maxLength={200}
              value={reject?.reason || ""}
              onChange={(e) => setReject((r) => (r ? { ...r, reason: e.target.value } : r))}
              className="input resize-none"
            />
          </>
        }
        confirmLabel="Rejeitar"
        onConfirm={confirmReject}
        onCancel={() => setReject(null)}
      />

      <ConfirmDialog
        open={!!remove}
        title={remove ? `Remover “${remove.name}” do banco?` : ""}
        description="Apaga o documento definitivamente. Use só para spam/duplicata — para casos comuns, prefira rejeitar."
        confirmLabel="Remover"
        onConfirm={confirmRemove}
        onCancel={() => setRemove(null)}
      />

      <EditAthleteDialog athlete={editing} onClose={() => setEditing(null)} />
    </div>
  );
}

// Correção de dados antes de aprovar (erros de digitação, número da camisa…).
function EditAthleteDialog({ athlete, onClose }) {
  const toast = useToast();
  const [form, setForm] = useState({ name: "", nickname: "", jerseyNumber: "", position: "", bio: "" });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (athlete) {
      setForm({
        name: athlete.name || "",
        nickname: athlete.nickname || "",
        jerseyNumber: athlete.jerseyNumber ?? "",
        position: athlete.position || "",
        bio: athlete.bio || "",
      });
    }
  }, [athlete]);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const save = async () => {
    if (form.name.trim().length < 2) return;
    setSaving(true);
    try {
      await updateAthlete(athlete.id, form);
      toast.success("Dados do atleta salvos");
      onClose();
    } catch (err) {
      toast.error(err.message || "Não foi possível salvar.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <FormDialog open={Boolean(athlete)} title="Editar atleta" submitLabel="Salvar" submitting={saving} onClose={onClose} onSubmit={save}>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="sm:col-span-2">
          <span className="label">Nome completo *</span>
          <input className="input" value={form.name} onChange={set("name")} minLength={2} maxLength={60} required />
        </label>
        <label>
          <span className="label">Apelido</span>
          <input className="input" value={form.nickname} onChange={set("nickname")} maxLength={30} />
        </label>
        <label>
          <span className="label">Número</span>
          <input className="input" type="number" min={0} max={999} value={form.jerseyNumber} onChange={set("jerseyNumber")} />
        </label>
        <label className="sm:col-span-2">
          <span className="label">Posição</span>
          <input className="input" value={form.position} onChange={set("position")} maxLength={40} />
        </label>
        <label className="sm:col-span-2">
          <span className="label">Bio</span>
          <textarea className="input min-h-[84px]" value={form.bio} onChange={set("bio")} maxLength={400} />
        </label>
      </div>
    </FormDialog>
  );
}

function AthleteRow({ athlete, tab, onApprove, onReject, onRemove, onEdit }) {
  const age = computeAge(athlete.birthDate);
  const cls = classLine(athlete);
  const submittedWhen = athlete.submittedAt?.toDate
    ? athlete.submittedAt.toDate().toLocaleString("pt-BR")
    : null;

  return (
    <li className="flex gap-3 rounded-2xl border border-line bg-surface p-3">
      <div className="h-24 w-24 shrink-0 overflow-hidden rounded-xl bg-elevated">
        {athlete.photoUrl ? (
          <img
            src={cldAvatar(athlete.photoUrl, { size: 200 })}
            alt=""
            width={200}
            height={200}
            loading="lazy"
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="grid h-full w-full place-items-center text-2xl font-bold text-muted">
            {(athlete.name || "?").charAt(0)}
          </div>
        )}
      </div>

      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex items-baseline justify-between gap-2">
          <p className="truncate text-sm font-semibold">{athlete.name}</p>
          {athlete.jerseyNumber != null && (
            <span className="shrink-0 rounded-md bg-elevated px-1.5 py-0.5 font-mono text-xs">
              #{athlete.jerseyNumber}
            </span>
          )}
        </div>
        <p className="mt-0.5 truncate text-xs text-muted">
          {athlete.modalityCode && <code className="mr-1 rounded bg-elevated px-1.5 py-0.5 font-mono">{athlete.modalityCode}</code>}
          {athlete.modalityName || athlete.modality}
          {cls && ` · ${cls}`}
          {age != null && ` · ${age} anos`}
        </p>
        {athlete.position && <p className="text-xs text-muted">{athlete.position}</p>}

        {tab === "pending" && submittedWhen && (
          <p className="mt-1 text-[11px] text-muted">Enviado em {submittedWhen}</p>
        )}
        {tab === "rejected" && athlete.rejectionReason && (
          <p className="mt-1 line-clamp-2 text-[11px] italic text-muted">"{athlete.rejectionReason}"</p>
        )}

        <div className="mt-auto flex flex-wrap justify-end gap-2 pt-2 text-xs">
          <button onClick={onEdit} className="rounded-full border border-line px-3 py-1 text-muted hover:text-fg">Editar</button>
          {tab === "pending" && (
            <>
              <button onClick={onReject} className="rounded-full border border-line px-3 py-1 text-muted hover:text-fg">Rejeitar</button>
              <button onClick={onApprove} className="rounded-full bg-accent px-3 py-1 font-medium text-white hover:brightness-110">Aprovar</button>
            </>
          )}
          {tab === "approved" && (
            <>
              <a
                href={`/atletas/${athlete.id}`}
                target="_blank"
                rel="noreferrer"
                className="rounded-full border border-line px-3 py-1 text-muted hover:text-fg"
              >
                Ver perfil
              </a>
              <button onClick={onReject} className="rounded-full border border-live/50 px-3 py-1 text-live hover:bg-live/10">Rejeitar</button>
            </>
          )}
          {tab === "rejected" && (
            <>
              <button onClick={onApprove} className="rounded-full border border-accent/50 px-3 py-1 text-accent hover:bg-accent/10">Aprovar</button>
              <button onClick={onRemove} className="rounded-full border border-live/50 px-3 py-1 text-live hover:bg-live/10">Remover</button>
            </>
          )}
        </div>
      </div>
    </li>
  );
}

function EmptyState({ tab }) {
  const msg =
    tab === "pending"  ? "Nenhum cadastro aguardando aprovação."
    : tab === "approved" ? "Nenhum atleta aprovado ainda."
    : "Nenhum atleta rejeitado.";
  return (
    <p className="rounded-2xl border border-dashed border-line px-6 py-10 text-center text-sm text-muted">
      {msg}
    </p>
  );
}
