import { useEffect, useRef, useState } from "react";
import {
  addAthleteModality, approveAthlete, deleteAthlete, fetchInstitutionalPhoto, rejectAthlete, setAthleteMatricula, subscribeAthletePrivate,
  subscribeAthletesAdmin, updateAthlete, uploadAthletePhoto, validatePhotoFile,
} from "../../services/athletes.js";
import { athletePhoto } from "../../lib/media.js";
import { subscribeModalities } from "../../services/modalities.js";
import { computeAge, classLine } from "../athletes/format.js";
import FormDialog from "./FormDialog.jsx";
import { useToast } from "./ToastProvider.jsx";
import ConfirmDialog from "./ConfirmDialog.jsx";

// Painel de moderação de atletas. Três abas internas: Pendentes, Aprovados, Rejeitados.
// - Aprovar: um clique (ação positiva, low-risk).
// - Rejeitar: abre diálogo com campo opcional "motivo" (fica no doc pra auditoria).
// - Remover (só para spam óbvio): confirmação separada.
// - Editar: corrige os dados, a matrícula e a foto. O cadastro público não envia foto: ela vem do
//   site institucional pela matrícula e, quando isso não dá certo, o admin envia uma por aqui.

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
  const [priv, setPriv] = useState({}); // { idDoAtleta: { matricula, institutionalName, photoStatus } } (só admin lê)

  useEffect(() => subscribeAthletePrivate(setPriv, () => setPriv({})), []);

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
        <div role="tablist" aria-label="Filtro por status" className="max-md:no-scrollbar flex max-w-full gap-1 overflow-x-auto rounded-full border border-line bg-surface p-1 text-sm">
          {TABS.map((t) => (
            <button
              key={t.key}
              role="tab"
              aria-selected={tab === t.key}
              onClick={() => setTab(t.key)}
              className={
                "shrink-0 rounded-full px-3 py-1 max-md:min-h-11 max-md:px-4 " +
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
              priv={priv[a.id]}
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

      {/* O atleta vem da lista ao vivo: a foto do diálogo muda assim que o servidor grava a nova */}
      <EditAthleteDialog
        athlete={editing && (list?.find((a) => a.id === editing.id) || editing)}
        priv={editing ? priv[editing.id] : null}
        allPriv={priv}
        onClose={() => setEditing(null)}
      />
    </div>
  );
}

// Por que o atleta está sem foto (athletePrivate.photoStatus, gravado pelo worker).
const PHOTO_ISSUE = {
  nao_configurada: "a busca pela matrícula não está configurada no servidor",
  nao_encontrada: "matrícula não encontrada no cadastro da instituição",
  sem_foto: "o cadastro da instituição não tem foto",
  erro: "a consulta ao site da instituição falhou",
};

const MATRICULA = /^[0-9A-Za-z]{4,20}$/;

function photoIssue(athlete, priv) {
  if (athletePhoto(athlete)) return null;
  if (!priv?.matricula) return "sem matrícula";
  return PHOTO_ISSUE[priv.photoStatus] || "a foto ainda não foi buscada";
}

// Correção de dados, da matrícula e da foto (erros de digitação, foto que não veio da instituição…).
function EditAthleteDialog({ athlete, priv, allPriv, onClose }) {
  const toast = useToast();
  const [form, setForm] = useState({ name: "", nickname: "", jerseyNumber: "", position: "", bio: "", matricula: "" });
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState("");
  const [saving, setSaving] = useState(false);
  const [fetching, setFetching] = useState(false);
  const fileInput = useRef(null);
  const id = athlete?.id;
  const savedMatricula = priv?.matricula || "";

  useEffect(() => {
    if (!athlete) return;
    setForm({
      name: athlete.name || "",
      nickname: athlete.nickname || "",
      jerseyNumber: athlete.jerseyNumber ?? "",
      position: athlete.position || "",
      bio: athlete.bio || "",
      matricula: savedMatricula,
    });
    setFile(null);
    // Só ao abrir outro atleta: a lista ao vivo não pode apagar o que o admin está digitando
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  useEffect(() => {
    if (!file) { setPreview(""); return undefined; }
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const matricula = form.matricula.trim();
  const matriculaOk = MATRICULA.test(matricula);
  const current = athlete ? athletePhoto(athlete, 200) : null;
  const issue = athlete ? photoIssue(athlete, priv) : null;
  const busy = saving || fetching;

  const pickFile = (e) => {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    const err = validatePhotoFile(f);
    if (err) { toast.error(err); return; }
    setFile(f);
  };

  const saveMatricula = async () => {
    if (matricula && matricula !== savedMatricula) await setAthleteMatricula(id, matricula);
  };

  const fetchPhoto = async () => {
    setFetching(true);
    try {
      await saveMatricula();
      await fetchInstitutionalPhoto(id);
      setFile(null);
      toast.success("Foto trazida do cadastro da instituição");
    } catch (err) {
      toast.error(err.message || "Não foi possível buscar a foto.");
    } finally {
      setFetching(false);
    }
  };

  const save = async () => {
    if (form.name.trim().length < 2) return;
    if (matricula && !matriculaOk) { toast.error("Matrícula: só letras e números, de 4 a 20 caracteres."); return; }
    setSaving(true);
    try {
      await saveMatricula();
      if (file) await uploadAthletePhoto(id, file);
      await updateAthlete(id, form);
      toast.success("Dados do atleta salvos");
      onClose();
    } catch (err) {
      toast.error(err.message || "Não foi possível salvar.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <FormDialog open={Boolean(athlete)} title="Editar atleta" submitLabel="Salvar" submitting={saving} submitDisabled={fetching} onClose={onClose} onSubmit={save}>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex gap-4 sm:col-span-2">
          <div className="h-24 w-24 shrink-0 overflow-hidden rounded-xl bg-elevated">
            {preview || current ? (
              <img src={preview || current} alt="Foto do atleta" className="h-full w-full object-cover" />
            ) : (
              <div className="grid h-full w-full place-items-center text-2xl font-bold text-muted">
                {(form.name || "?").charAt(0)}
              </div>
            )}
          </div>
          <div className="min-w-0 flex-1">
            <span className="label">Foto</span>
            <p className={"text-xs " + (issue && !file ? "text-warn" : "text-muted")}>
              {file ? "Nova foto escolhida. Ela é enviada ao salvar."
                : issue ? `Sem foto: ${issue}.`
                  : athlete?.photoSource === "admin" ? "Foto enviada por um administrador."
                    : athlete?.photoSource === "institucional" ? "Foto do cadastro da instituição."
                      : "Foto enviada no cadastro."}
            </p>
            <div className="mt-2 flex flex-wrap gap-2 text-xs max-md:[&>*]:min-h-11 max-md:[&>*]:px-4">
              <button type="button" disabled={busy} onClick={() => fileInput.current?.click()} className="rounded-full border border-line px-3 py-1 text-muted hover:text-fg disabled:opacity-60">
                {current || file ? "Trocar foto" : "Enviar foto"}
              </button>
              {file && (
                <button type="button" disabled={busy} onClick={() => setFile(null)} className="rounded-full border border-line px-3 py-1 text-muted hover:text-fg disabled:opacity-60">
                  Desfazer
                </button>
              )}
              <button type="button" disabled={busy || !matriculaOk} onClick={fetchPhoto} className="rounded-full border border-line px-3 py-1 text-muted hover:text-fg disabled:opacity-60">
                {fetching ? "Buscando…" : "Buscar pela matrícula"}
              </button>
            </div>
            <input ref={fileInput} type="file" accept="image/jpeg,image/png,image/webp" onChange={pickFile} className="hidden" />
          </div>
        </div>
        {athlete && <ModalitiesSection athlete={athlete} priv={priv} allPriv={allPriv} />}
        <label className="sm:col-span-2">
          <span className="label">Nome completo *</span>
          <input className="input" value={form.name} onChange={set("name")} minLength={2} maxLength={60} required />
        </label>
        <label>
          <span className="label">Matrícula escolar</span>
          <input className="input font-mono" value={form.matricula} onChange={set("matricula")} maxLength={20} inputMode="numeric" autoComplete="off" spellCheck={false} />
        </label>
        <label>
          <span className="label">Apelido</span>
          <input className="input" value={form.nickname} onChange={set("nickname")} maxLength={30} />
        </label>
        <label>
          <span className="label">Número</span>
          <input className="input" type="number" min={0} max={999} value={form.jerseyNumber} onChange={set("jerseyNumber")} />
        </label>
        <label>
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

// Modalidades do atleta. Cada modalidade é um perfil próprio (uma cópia do mesmo aluno, ligada pela
// matrícula), então "Também joga em" cria a cópia na outra modalidade pelo worker.
function ModalitiesSection({ athlete, priv, allPriv }) {
  const toast = useToast();
  const [modalities, setModalities] = useState([]);
  const [code, setCode] = useState("");
  const [adding, setAdding] = useState(false);

  useEffect(() => subscribeModalities(setModalities), []);

  const matricula = priv?.matricula;
  const codes = [...new Set([
    athlete.modalityCode,
    ...(matricula ? Object.values(allPriv || {}).filter((p) => p.matricula === matricula).map((p) => p.modalityCode) : []),
  ].filter(Boolean))];
  const nameOf = (c) => modalities.find((m) => m.code === c)?.name || c;
  const available = modalities.filter((m) => m.code && !codes.includes(m.code));

  const add = async () => {
    setAdding(true);
    try {
      await addAthleteModality(athlete.id, code);
      toast.success(`${athlete.name} também está em ${nameOf(code)}`);
      setCode("");
    } catch (err) {
      toast.error(err.message || "Não foi possível adicionar a modalidade.");
    } finally {
      setAdding(false);
    }
  };

  return (
    <div className="sm:col-span-2">
      <span className="label">Modalidades</span>
      <div className="flex flex-wrap gap-1.5">
        {codes.map((c) => (
          <span key={c} className={"badge " + (c === athlete.modalityCode ? "bg-accent/10 text-accent" : "border border-line text-fg")}>
            {nameOf(c)}{c === athlete.modalityCode && " (este perfil)"}
          </span>
        ))}
      </div>
      {available.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-2">
          <select className="input min-w-0 flex-1 basis-48" value={code} onChange={(e) => setCode(e.target.value)} aria-label="Outra modalidade do atleta">
            <option value="">Também joga em…</option>
            {available.map((m) => <option key={m.id} value={m.code}>{m.name}</option>)}
          </select>
          <button type="button" disabled={!code || adding} onClick={add} className="btn-ghost btn-sm disabled:opacity-60">
            {adding ? "Adicionando…" : "Adicionar"}
          </button>
        </div>
      )}
      <p className="mt-1 text-xs text-muted">
        Cria um perfil do mesmo atleta na outra modalidade, com os mesmos dados, foto e matrícula. Depois cada perfil é editado separado.
      </p>
    </div>
  );
}

const norm = (s) => (s || "").normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase().replace(/\s+/g, " ").trim();

function AthleteRow({ athlete, priv, tab, onApprove, onReject, onRemove, onEdit }) {
  const age = computeAge(athlete.birthDate);
  const cls = classLine(athlete);
  const submittedWhen = athlete.submittedAt?.toDate
    ? athlete.submittedAt.toDate().toLocaleString("pt-BR")
    : null;

  return (
    <li className="flex gap-3 rounded-2xl border border-line bg-surface p-3">
      <div className="h-24 w-24 shrink-0 overflow-hidden rounded-xl bg-elevated">
        {athletePhoto(athlete, 200) ? (
          <img
            src={athletePhoto(athlete, 200)}
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
        {photoIssue(athlete, priv) && (
          <p className="mt-1 text-[11px] text-warn">Sem foto: {photoIssue(athlete, priv)}. Adicione em Editar.</p>
        )}
        {priv?.matricula && (
          <p className="mt-1 text-[11px] text-muted">
            Matrícula <code className="font-mono text-fg">{priv.matricula}</code>
            {priv.institutionalName && (
              norm(priv.institutionalName) === norm(athlete.name)
                ? <> · confere com o cadastro da instituição</>
                : <span className="text-warn"> · nome no cadastro da instituição: {priv.institutionalName}</span>
            )}
          </p>
        )}

        {tab === "pending" && submittedWhen && (
          <p className="mt-1 text-[11px] text-muted">Enviado em {submittedWhen}</p>
        )}
        {tab === "rejected" && athlete.rejectionReason && (
          <p className="mt-1 line-clamp-2 text-[11px] italic text-muted">"{athlete.rejectionReason}"</p>
        )}

        <div className="mt-auto flex flex-wrap justify-end gap-2 pt-2 text-xs max-md:[&>*]:inline-flex max-md:[&>*]:min-h-11 max-md:[&>*]:items-center max-md:[&>*]:px-4">
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
