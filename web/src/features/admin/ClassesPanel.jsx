import { useEffect, useState } from "react";
import { createClass, deleteClass, subscribeClasses } from "../../services/classes.js";
import { useToast } from "./ToastProvider.jsx";
import ConfirmDialog from "./ConfirmDialog.jsx";

// CRUD de turmas. Não faz denormalização: os cards de atleta guardam className
// no momento da submissão, então renomear uma turma aqui não retroage.

export default function ClassesPanel() {
  const toast = useToast();
  const [list, setList] = useState([]);
  const [name, setName] = useState("");
  const [campus, setCampus] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [confirm, setConfirm] = useState(null);

  useEffect(() => subscribeClasses(setList), []);

  const canSubmit = name.trim().length > 0 && !submitting;

  const add = async (e) => {
    e.preventDefault();
    if (!canSubmit) return;
    setSubmitting(true);
    try {
      await createClass({ name, campus });
      toast.success(`Turma ${name.trim()} adicionada`);
      setName(""); setCampus("");
    } catch (err) {
      toast.error(err.message || "Não foi possível adicionar.");
    } finally {
      setSubmitting(false);
    }
  };

  const confirmRemove = async () => {
    if (!confirm) return;
    const c = confirm;
    setConfirm(null);
    try {
      await deleteClass(c.id);
      toast.success(`Turma ${c.name} removida`);
    } catch (err) {
      toast.error(err.message || "Não foi possível remover.");
    }
  };

  return (
    <div className="card p-6">
      <div className="mb-4 flex items-baseline justify-between">
        <h2 className="text-lg font-semibold">Turmas</h2>
        <span className="text-xs text-muted">{list.length}</span>
      </div>

      <form onSubmit={add} className="grid grid-cols-[1fr_1fr_auto] gap-2 max-sm:grid-cols-2 max-sm:[&>button]:col-span-2 max-sm:[&>button]:justify-center">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Ex.: 3B-INFO"
          className="input"
          aria-label="Nome da turma"
          maxLength={60}
        />
        <input
          value={campus}
          onChange={(e) => setCampus(e.target.value)}
          placeholder="Câmpus (opcional)"
          className="input"
          aria-label="Câmpus"
          maxLength={80}
        />
        <button type="submit" disabled={!canSubmit} className="btn-primary disabled:opacity-60">
          Adicionar
        </button>
      </form>
      <p className="mt-2 text-xs text-muted">
        Renomear uma turma aqui não altera perfis já cadastrados: a turma fica gravada no atleta no momento do envio.
      </p>

      {list.length === 0 ? (
        <p className="mt-6 rounded-xl border border-dashed border-line px-4 py-6 text-center text-sm text-muted">
          Nenhuma turma cadastrada.
        </p>
      ) : (
        <ul className="mt-4 space-y-2">
          {list.map((c) => (
            <li key={c.id} className="flex items-center justify-between rounded-xl border border-line px-3 py-2">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{c.name}</p>
                {c.campus && <p className="text-xs text-muted">{c.campus}</p>}
              </div>
              <button
                onClick={() => setConfirm(c)}
                className="tap text-sm text-live hover:underline"
                aria-label={`Remover ${c.name}`}
              >
                Remover
              </button>
            </li>
          ))}
        </ul>
      )}

      <ConfirmDialog
        open={!!confirm}
        title={confirm ? `Remover turma "${confirm.name}"?` : ""}
        description="Atletas já cadastrados mantêm o nome da turma gravado, mas o formulário público deixa de oferecê-la."
        confirmLabel="Remover"
        onConfirm={confirmRemove}
        onCancel={() => setConfirm(null)}
      />
    </div>
  );
}
