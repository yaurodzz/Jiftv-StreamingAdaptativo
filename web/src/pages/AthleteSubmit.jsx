import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { UploadCloud, Check } from "lucide-react";
import { subscribeModalities } from "../services/modalities.js";
import { subscribeClasses } from "../services/classes.js";
import { submitAthlete } from "../services/publicApi.js";
import { uploadAthletePhoto, validatePhotoFile } from "../lib/uploadPhoto.js";
import { computeAge } from "../features/athletes/format.js";

// /atletas/novo — formulário público de submissão. Envia direto para o Cloudinary
// (foto) e depois para POST /public/athletes/submit (dados). Fica pendente
// até um admin aprovar; só então aparece na vitrine.
//
// Validações client-side espelham as do backend (Zod) — a rede segue sendo
// a fonte de verdade, mas evitamos requests inúteis.

const INITIAL = {
  name: "", nickname: "", birthDate: "",
  jerseyNumber: "", position: "", bio: "",
  modalityCode: "", classId: "",
  submittedByName: "", submittedByEmail: "",
};

export default function AthleteSubmit() {
  const navigate = useNavigate();
  const [modalities, setModalities] = useState([]);
  const [classes, setClasses] = useState([]);
  const [form, setForm] = useState(INITIAL);
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState("");
  const [progress, setProgress] = useState(0);
  const [phase, setPhase] = useState("idle"); // idle | uploading | submitting | done
  const [error, setError] = useState("");
  const [submittedId, setSubmittedId] = useState(null);
  const fileInputRef = useRef(null);

  useEffect(() => subscribeModalities(setModalities), []);
  useEffect(() => subscribeClasses(setClasses), []);
  useEffect(() => { document.title = "Cadastrar atleta · JIFTv"; }, []);

  // Preview local (objectURL); revoga ao trocar/desmontar.
  useEffect(() => {
    if (!file) { setPreview(""); return; }
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const age = computeAge(form.birthDate);

  const localError = useMemo(() => {
    if (!file) return "Escolha uma foto.";
    if (form.name.trim().length < 2) return "Informe o nome completo.";
    if (!form.birthDate) return "Informe a data de nascimento.";
    if (age == null || age < 8 || age > 80) return "Data de nascimento fora da faixa aceita.";
    if (!form.modalityCode) return "Escolha a modalidade.";
    if (!form.classId) return "Escolha a turma.";
    if (form.submittedByEmail && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(form.submittedByEmail))
      return "E-mail de contato inválido.";
    return null;
  }, [file, form, age]);

  const onPickFile = (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    const err = validatePhotoFile(f);
    if (err) { setError(err); e.target.value = ""; return; }
    setError(""); setFile(f);
  };

  const submit = async (e) => {
    e.preventDefault();
    if (localError) { setError(localError); return; }
    setError("");
    try {
      setPhase("uploading");
      setProgress(0);
      const photoUrl = await uploadAthletePhoto(file, { onProgress: setProgress });

      setPhase("submitting");
      const payload = {
        name: form.name.trim(),
        nickname: form.nickname.trim() || undefined,
        birthDate: form.birthDate,
        photoUrl,
        jerseyNumber: form.jerseyNumber ? Number(form.jerseyNumber) : undefined,
        position: form.position.trim() || undefined,
        bio: form.bio.trim() || undefined,
        modalityCode: form.modalityCode,
        classId: form.classId,
        submittedByName:  form.submittedByName.trim()  || undefined,
        submittedByEmail: form.submittedByEmail.trim() || undefined,
      };
      const result = await submitAthlete(payload);
      setSubmittedId(result.id);
      setPhase("done");
    } catch (err) {
      setError(err.message || "Não foi possível enviar o cadastro.");
      setPhase("idle");
    }
  };

  if (phase === "done") {
    return (
      <section className="mx-auto grid min-h-[60vh] max-w-md place-items-center px-4 py-16 text-center">
        <div>
          <div className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-accent/15 text-accent">
            <Check size={28} />
          </div>
          <h1 className="mt-4 text-2xl font-semibold">Cadastro enviado</h1>
          <p className="mt-2 text-muted">
            Um administrador vai revisar e aprovar o perfil. Você não precisa fazer mais nada.
          </p>
          <p className="mt-4 text-xs text-muted">Protocolo: <code className="font-mono">{submittedId}</code></p>
          <div className="mt-6 flex justify-center gap-2">
            <Link to="/atletas" className="btn-ghost">Ver vitrine</Link>
            <button
              onClick={() => { setForm(INITIAL); setFile(null); setPreview(""); setPhase("idle"); setSubmittedId(null); }}
              className="btn-primary"
            >
              Cadastrar outro
            </button>
          </div>
        </div>
      </section>
    );
  }

  const busy = phase !== "idle";

  return (
    <section className="mx-auto max-w-3xl px-4 py-8 md:py-12">
      <nav aria-label="Trilha de navegação" className="mb-4 text-xs text-muted">
        <Link to="/atletas" className="hover:text-fg">Atletas</Link>
        <span className="mx-2">/</span>
        <span className="text-fg">Novo cadastro</span>
      </nav>

      <header className="mb-8">
        <h1 className="text-3xl font-semibold md:text-4xl">Cadastrar atleta</h1>
        <p className="mt-2 max-w-2xl text-muted">
          Qualquer pessoa pode enviar. O perfil só aparece na vitrine depois de aprovado por um
          administrador, geralmente no mesmo dia.
        </p>
      </header>

      <form onSubmit={submit} className="grid gap-6 rounded-3xl border border-line bg-surface p-6 md:p-8" noValidate>
        <div className="grid gap-6 md:grid-cols-[200px_1fr]">
          <PhotoPicker
            preview={preview}
            onPick={() => fileInputRef.current?.click()}
            onClear={() => { setFile(null); if (fileInputRef.current) fileInputRef.current.value = ""; }}
            file={file}
          />
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            onChange={onPickFile}
            className="hidden"
          />

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Nome completo *" full>
              <input value={form.name} onChange={set("name")} maxLength={60} required className="input" />
            </Field>
            <Field label="Apelido">
              <input value={form.nickname} onChange={set("nickname")} maxLength={30} className="input" />
            </Field>
            <Field label="Data de nascimento *">
              <input type="date" value={form.birthDate} onChange={set("birthDate")} required className="input" />
              {age != null && <p className="mt-1 text-xs text-muted">{age} anos</p>}
            </Field>
            <Field label="Número">
              <input type="number" min={0} max={999} value={form.jerseyNumber} onChange={set("jerseyNumber")} className="input" />
            </Field>
            <Field label="Modalidade *">
              <select value={form.modalityCode} onChange={set("modalityCode")} required className="input">
                <option value="">Escolher…</option>
                {modalities.map((m) => (
                  <option key={m.id} value={m.code}>{m.code} — {m.name}</option>
                ))}
              </select>
            </Field>
            <Field label="Turma *">
              <select value={form.classId} onChange={set("classId")} required className="input">
                <option value="">Escolher…</option>
                {classes.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.campus ? `${c.name} — ${c.campus}` : c.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Posição" full>
              <input value={form.position} onChange={set("position")} maxLength={40} placeholder="Ex.: Pivô, Ala, Goleira…" className="input" />
            </Field>
          </div>
        </div>

        <Field label="Bio (opcional)">
          <textarea
            value={form.bio}
            onChange={set("bio")}
            maxLength={400}
            rows={3}
            className="input resize-none"
            placeholder="Uma frase sobre o atleta, curiosidades, principais conquistas…"
          />
          <p className="mt-1 text-right text-xs text-muted">{form.bio.length}/400</p>
        </Field>

        <fieldset className="grid gap-4 rounded-2xl border border-dashed border-line p-4 sm:grid-cols-2">
          <legend className="px-2 text-xs text-muted">Contato de quem enviou (opcional)</legend>
          <Field label="Seu nome">
            <input value={form.submittedByName} onChange={set("submittedByName")} maxLength={60} className="input" />
          </Field>
          <Field label="Seu e-mail">
            <input type="email" value={form.submittedByEmail} onChange={set("submittedByEmail")} maxLength={120} className="input" />
          </Field>
        </fieldset>

        {error && (
          <p role="alert" className="rounded-xl border border-live/40 bg-live/10 px-3 py-2 text-sm text-live">
            {error}
          </p>
        )}

        {phase === "uploading" && (
          <div>
            <div className="mb-1 flex justify-between text-xs text-muted">
              <span>Enviando foto…</span>
              <span>{Math.round(progress * 100)}%</span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-elevated">
              <div
                className="h-full bg-accent transition-[width]"
                style={{ width: `${Math.max(4, Math.round(progress * 100))}%` }}
              />
            </div>
          </div>
        )}

        <div className="flex flex-wrap items-center justify-end gap-2">
          <button
            type="button"
            onClick={() => navigate(-1)}
            className="btn-ghost"
            disabled={busy}
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={busy || !!localError}
            className="btn-primary disabled:opacity-60"
          >
            {phase === "uploading" ? "Enviando foto…"
              : phase === "submitting" ? "Enviando cadastro…"
              : "Enviar para aprovação"}
          </button>
        </div>
      </form>

      <p className="mt-6 text-center text-xs text-muted">
        Ao enviar, você confirma ter autorização do atleta (ou responsável, se menor)
        para exibir foto e dados no site.
      </p>
    </section>
  );
}

function Field({ label, children, full }) {
  return (
    <label className={"block text-sm font-medium text-fg " + (full ? "sm:col-span-2" : "")}>
      {label}
      <div className="mt-1">{children}</div>
    </label>
  );
}

function PhotoPicker({ preview, onPick, onClear, file }) {
  return (
    <div>
      <div className="relative mx-auto aspect-square w-40 overflow-hidden rounded-2xl border border-dashed border-line bg-elevated md:w-full">
        {preview ? (
          <img src={preview} alt="Prévia da foto" className="h-full w-full object-cover" />
        ) : (
          <button
            type="button"
            onClick={onPick}
            className="flex h-full w-full flex-col items-center justify-center gap-2 text-muted hover:text-fg"
          >
            <UploadCloud size={28} />
            <span className="text-xs">Adicionar foto</span>
          </button>
        )}
      </div>
      <div className="mt-2 flex justify-center gap-2 text-xs">
        {preview ? (
          <>
            <button type="button" onClick={onPick} className="text-accent hover:underline">Trocar</button>
            <span className="text-muted">·</span>
            <button type="button" onClick={onClear} className="text-live hover:underline">Remover</button>
          </>
        ) : (
          <span className="text-center text-muted">
            JPG, PNG ou WebP até 2 MB. Foto quadrada fica melhor.
          </span>
        )}
      </div>
      {file && (
        <p className="mt-1 text-center text-[11px] text-muted">
          {(file.size / 1024).toFixed(0)} KB
        </p>
      )}
    </div>
  );
}
