import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Check } from "lucide-react";
import { subscribeModalities } from "../services/modalities.js";
import { subscribeClasses } from "../services/classes.js";
import { submitAthlete } from "../services/publicApi.js";
import { computeAge } from "../features/athletes/format.js";

// /atletas/novo — formulário público de submissão. Fica pendente até um admin aprovar;
// só então aparece na vitrine.
//
// Aqui não se envia foto: a pessoa informa a matrícula escolar e o worker (POST /api/atletas)
// busca a foto na API do site institucional. Se a busca não der certo, o cadastro entra sem
// foto e o admin adiciona uma pelo painel (Atletas → Editar).
//
// Validações client-side espelham as do servidor — ele segue sendo a fonte de verdade,
// mas evitamos requests inúteis.

const INITIAL = {
  name: "", nickname: "", birthDate: "",
  jerseyNumber: "", position: "", bio: "",
  modalityCode: "", classId: "", matricula: "",
  submittedByName: "", submittedByEmail: "",
};

const MATRICULA = /^[0-9A-Za-z]{4,20}$/;

export default function AthleteSubmit() {
  const navigate = useNavigate();
  const [modalities, setModalities] = useState([]);
  const [classes, setClasses] = useState([]);
  const [form, setForm] = useState(INITIAL);
  const [phase, setPhase] = useState("idle"); // idle | submitting | done
  const [error, setError] = useState("");
  const [submittedId, setSubmittedId] = useState(null);

  useEffect(() => subscribeModalities(setModalities), []);
  useEffect(() => subscribeClasses(setClasses), []);
  useEffect(() => { document.title = "Cadastrar atleta · JIFTv"; }, []);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const age = computeAge(form.birthDate);

  const localError = useMemo(() => {
    if (form.name.trim().length < 2) return "Informe o nome completo.";
    if (!MATRICULA.test(form.matricula.trim())) return "Informe a matrícula do aluno (só letras e números, de 4 a 20).";
    if (!form.birthDate) return "Informe a data de nascimento.";
    if (age == null || age < 8 || age > 80) return "Data de nascimento fora da faixa aceita.";
    if (!form.modalityCode) return "Escolha a modalidade.";
    if (!form.classId) return "Escolha a turma.";
    if (form.submittedByEmail && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(form.submittedByEmail))
      return "E-mail de contato inválido.";
    return null;
  }, [form, age]);

  const submit = async (e) => {
    e.preventDefault();
    if (localError) { setError(localError); return; }
    setError("");
    try {
      setPhase("submitting");
      const payload = {
        name: form.name.trim(),
        nickname: form.nickname.trim() || undefined,
        birthDate: form.birthDate,
        matricula: form.matricula.trim(),
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
          <div className="mt-6 flex flex-wrap justify-center gap-2">
            <Link to="/atletas" className="btn-ghost">Ver vitrine</Link>
            <button
              onClick={() => { setForm(INITIAL); setPhase("idle"); setSubmittedId(null); }}
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
    <section className="mx-auto max-w-3xl px-4 pb-8 pt-2 md:py-12">
      <nav aria-label="Trilha de navegação" className="crumbs">
        <Link to="/atletas" className="hover:text-fg">Atletas</Link>
        <span className="mx-2">/</span>
        <span className="text-fg">Novo cadastro</span>
      </nav>

      <header className="mb-6 md:mb-8">
        <h1 className="text-3xl font-semibold md:text-4xl">Cadastrar atleta</h1>
        <p className="mt-2 max-w-2xl text-muted">
          Qualquer pessoa pode enviar. O perfil só aparece na vitrine depois de aprovado por um
          administrador, geralmente no mesmo dia.
        </p>
      </header>

      <form onSubmit={submit} className="grid gap-6 rounded-3xl border border-line bg-surface p-4 sm:p-6 md:p-8" noValidate>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Nome completo *" full>
            <input value={form.name} onChange={set("name")} maxLength={60} required autoComplete="name" autoCapitalize="words" enterKeyHint="next" className="input" />
          </Field>
          <Field label="Matrícula escolar *">
            <input
              value={form.matricula}
              onChange={set("matricula")}
              maxLength={20}
              inputMode="numeric"
              autoComplete="off"
              autoCorrect="off"
              spellCheck={false}
              enterKeyHint="next"
              required
              className="input font-mono"
            />
            <p className="mt-1 text-xs font-normal text-muted">
              Usamos a matrícula para buscar a foto do perfil no cadastro da instituição. A matrícula não aparece no site.
            </p>
          </Field>
          <Field label="Apelido">
            <input value={form.nickname} onChange={set("nickname")} maxLength={30} autoComplete="off" autoCapitalize="words" enterKeyHint="next" className="input" />
          </Field>
          <Field label="Data de nascimento *">
            <input type="date" value={form.birthDate} onChange={set("birthDate")} required autoComplete="bday" className="input max-md:min-w-0 max-md:appearance-none max-md:text-left" />
            {age != null && <p className="mt-1 text-xs text-muted">{age} anos</p>}
          </Field>
          <Field label="Número">
            <input type="number" inputMode="numeric" pattern="[0-9]*" min={0} max={999} value={form.jerseyNumber} onChange={set("jerseyNumber")} autoComplete="off" enterKeyHint="next" className="input" />
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
            <input value={form.position} onChange={set("position")} maxLength={40} placeholder="Ex.: Pivô, Ala, Goleira…" autoComplete="off" autoCapitalize="sentences" enterKeyHint="next" className="input" />
          </Field>
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
            <input value={form.submittedByName} onChange={set("submittedByName")} maxLength={60} autoComplete="name" autoCapitalize="words" enterKeyHint="next" className="input" />
          </Field>
          <Field label="Seu e-mail">
            <input type="email" inputMode="email" value={form.submittedByEmail} onChange={set("submittedByEmail")} maxLength={120} autoComplete="email" autoCapitalize="none" autoCorrect="off" spellCheck={false} enterKeyHint="done" className="input" />
          </Field>
        </fieldset>

        {error && (
          <p role="alert" className="rounded-xl border border-live/40 bg-live/10 px-3 py-2 text-sm text-live">
            {error}
          </p>
        )}

        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:justify-end">
          <button
            type="button"
            onClick={() => navigate(-1)}
            className="btn-ghost max-sm:justify-center"
            disabled={busy}
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={busy || !!localError}
            className="btn-primary disabled:opacity-60 max-sm:justify-center"
          >
            {phase === "submitting" ? "Enviando cadastro…" : "Enviar para aprovação"}
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
