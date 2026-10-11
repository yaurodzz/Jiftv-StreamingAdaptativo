import { useEffect, useMemo, useState } from "react";
import { createModality, deleteModality, subscribeModalities } from "../../services/modalities.js";
import { subscribeAllVods } from "../../services/vods.js";
import { useToast } from "../../features/admin/ToastProvider.jsx";
import ConfirmDialog from "../../features/admin/ConfirmDialog.jsx";
import ScoutTypesEditor from "../../features/admin/ScoutTypesEditor.jsx";

// Modalidades: listagem com contagem de gravações vinculadas, criação com código único
// de 3 letras (usado no ID das gravações) e remoção com confirmação.
export default function Modalities() {
  const toast = useToast();
  const [list, setList] = useState([]);
  const [vods, setVods] = useState([]);
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [confirm, setConfirm] = useState(null); // { modality, vodCount }
  const [expanded, setExpanded] = useState(null); // id da modalidade com editor de scout aberto

  useEffect(() => { document.title = "Modalidades · Painel JIFTv"; }, []);
  useEffect(() => subscribeModalities(setList), []);
  useEffect(() => subscribeAllVods(setVods), []);

  const countByCode = useMemo(() => {
    const map = new Map();
    for (const v of vods) {
      const key = v.modalityCode || v.modality;
      if (key) map.set(key, (map.get(key) || 0) + 1);
    }
    return map;
  }, [vods]);

  const suggestedCode = useMemo(
    () => name.normalize("NFD").replace(/\p{Diacritic}/gu, "").replace(/[^a-zA-Z]/g, "").slice(0, 3).toUpperCase(),
    [name],
  );

  const finalCode = (code || suggestedCode).toUpperCase();
  const canSubmit = name.trim().length > 0 && /^[A-Z]{3}$/.test(finalCode) && !submitting;

  const add = async (e) => {
    e.preventDefault();
    if (!canSubmit) return;
    setSubmitting(true);
    try {
      await createModality({ name, code: finalCode });
      toast.success(`Modalidade ${finalCode} adicionada`);
      setName(""); setCode("");
    } catch (err) {
      toast.error(err.message || "Não foi possível adicionar a modalidade.");
    } finally {
      setSubmitting(false);
    }
  };

  const confirmRemove = async () => {
    if (!confirm) return;
    const { modality } = confirm;
    setConfirm(null);
    try {
      await deleteModality(modality.id);
      toast.success(`Modalidade ${modality.code || modality.name} removida`);
    } catch (err) {
      toast.error(err.message || "Não foi possível remover.");
    }
  };

  return (
    <div className="card p-6">
      <div className="mb-4 flex items-baseline justify-between">
        <h2 className="text-lg font-semibold">Modalidades</h2>
        <span className="text-xs text-muted">{list.length}</span>
      </div>

      <form onSubmit={add} className="grid grid-cols-[1fr_96px_auto] gap-2 max-sm:grid-cols-[1fr_96px] max-sm:[&>button]:col-span-2 max-sm:[&>button]:justify-center">
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex.: Futsal" className="input" aria-label="Nome da modalidade" />
        <input
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z]/g, "").slice(0, 3))}
          placeholder={suggestedCode || "FUT"}
          maxLength={3}
          className="input text-center font-mono uppercase tracking-wider"
          aria-label="Código de 3 letras"
        />
        <button type="submit" disabled={!canSubmit} className="btn-primary disabled:opacity-60">Adicionar</button>
      </form>
      <p className="mt-2 text-xs text-muted">
        Código de 3 letras usado no ID das gravações (ex.: <code className="font-mono">20261007-FUT-143000</code>).
        Não mude o código depois de haver gravações.
      </p>

      {list.length === 0 ? (
        <p className="mt-6 rounded-xl border border-dashed border-line px-4 py-6 text-center text-sm text-muted">
          Nenhuma modalidade cadastrada. Comece por Futsal, Vôlei, Basquete…
        </p>
      ) : (
        <ul className="mt-4 space-y-2">
          {list.map((m) => {
            const count = countByCode.get(m.code) || countByCode.get(m.name) || 0;
            const isOpen = expanded === m.id;
            const scoutCount = Array.isArray(m.scoutTypes) ? m.scoutTypes.length : 0;
            return (
              <li key={m.id} className="rounded-xl border border-line px-3 py-2">
                <div className="flex flex-wrap items-center justify-between gap-x-3">
                  <div className="flex items-center gap-3">
                    <code className="rounded-md bg-elevated px-2 py-0.5 font-mono text-xs text-fg">{m.code || "—"}</code>
                    <span className="text-sm">{m.name}</span>
                    {count > 0 && <span className="text-xs text-muted">· {count} {count === 1 ? "gravação" : "gravações"}</span>}
                  </div>
                  <div className="flex items-center gap-3">
                    <button onClick={() => setExpanded(isOpen ? null : m.id)} className="tap text-xs text-muted hover:text-fg" aria-expanded={isOpen}>
                      Scout ({scoutCount}) {isOpen ? "▴" : "▾"}
                    </button>
                    <button onClick={() => setConfirm({ modality: m, vodCount: count })} className="tap text-sm text-live hover:underline" aria-label={`Remover ${m.name}`}>
                      Remover
                    </button>
                  </div>
                </div>
                {isOpen && <ScoutTypesEditor modality={m} onClose={() => setExpanded(null)} />}
              </li>
            );
          })}
        </ul>
      )}

      <ConfirmDialog
        open={!!confirm}
        title={confirm ? `Remover ${confirm.modality.name}?` : ""}
        description={
          confirm?.vodCount
            ? `Existem ${confirm.vodCount} gravação(ões) desta modalidade. Elas continuam no catálogo.`
            : "Esta ação não pode ser desfeita."
        }
        confirmLabel="Remover"
        onConfirm={confirmRemove}
        onCancel={() => setConfirm(null)}
      />
    </div>
  );
}
