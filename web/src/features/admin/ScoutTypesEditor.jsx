import { useEffect, useState } from "react";
import { updateScoutTypes } from "../../services/modalities.js";
import { useToast } from "./ToastProvider.jsx";

// Editor dos tipos de scout de uma modalidade.
// Cada tipo é { code (snake_case), label, weight }. Weight é opcional (default 1)
// e serve para futuras agregações ponderadas (ex.: rating).
// Salva o array inteiro no documento da modalidade (só o painel pode escrever).

const CODE_RE = /^[a-z][a-z0-9_]{1,23}$/;

function normalizeCode(raw) {
  return raw
    .normalize("NFD").replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 24);
}

export default function ScoutTypesEditor({ modality, onClose }) {
  const toast = useToast();
  const [rows, setRows] = useState(() =>
    Array.isArray(modality.scoutTypes) && modality.scoutTypes.length > 0
      ? modality.scoutTypes.map((t) => ({ ...t, weight: t.weight ?? 1 }))
      : [],
  );
  const [saving, setSaving] = useState(false);

  // Sync quando a modalidade recebida muda (após snapshot novo).
  useEffect(() => {
    setRows(
      Array.isArray(modality.scoutTypes) && modality.scoutTypes.length > 0
        ? modality.scoutTypes.map((t) => ({ ...t, weight: t.weight ?? 1 }))
        : [],
    );
  }, [modality.id, modality.scoutTypes]);

  const updateRow = (i, patch) =>
    setRows((rs) => rs.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));

  const removeRow = (i) => setRows((rs) => rs.filter((_, idx) => idx !== i));

  const addRow = () =>
    setRows((rs) => [...rs, { code: "", label: "", weight: 1 }]);

  const codes = rows.map((r) => r.code);
  const hasDup = codes.some((c, i) => c && codes.indexOf(c) !== i);
  const allValid =
    rows.every((r) => CODE_RE.test(r.code) && r.label.trim().length > 0 && Number.isFinite(+r.weight)) &&
    !hasDup;

  const save = async () => {
    if (!allValid || saving) return;
    setSaving(true);
    try {
      const payload = rows.map((r) => ({
        code: r.code,
        label: r.label.trim(),
        weight: Number(r.weight) || 1,
      }));
      await updateScoutTypes(modality.id, payload);
      toast.success("Tipos de scout salvos");
      onClose?.();
    } catch (err) {
      toast.error(err.message || "Não foi possível salvar.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mt-2 rounded-xl border border-line bg-elevated/40 p-3">
      <div className="mb-2 flex items-baseline justify-between">
        <p className="text-xs font-medium text-muted">
          Tipos de eventos que aparecem no scout ao vivo/VOD desta modalidade.
        </p>
        <button onClick={addRow} className="text-xs text-accent hover:underline">
          + adicionar
        </button>
      </div>

      {rows.length === 0 ? (
        <p className="rounded-lg border border-dashed border-line px-3 py-4 text-center text-xs text-muted">
          Nenhum tipo cadastrado.
        </p>
      ) : (
        <ul className="space-y-1.5">
          {rows.map((r, i) => {
            const codeValid = CODE_RE.test(r.code);
            const dup = r.code && codes.indexOf(r.code) !== i;
            return (
              <li key={i} className="grid grid-cols-[minmax(0,7rem)_minmax(0,1fr)_4rem_auto] gap-1.5">
                <input
                  value={r.code}
                  onChange={(e) => updateRow(i, { code: normalizeCode(e.target.value) })}
                  onBlur={(e) => updateRow(i, { code: normalizeCode(e.target.value) })}
                  placeholder="ponto"
                  className={
                    "input font-mono text-xs " +
                    (r.code && (!codeValid || dup) ? "!border-live" : "")
                  }
                  aria-label="Código"
                />
                <input
                  value={r.label}
                  onChange={(e) => updateRow(i, { label: e.target.value })}
                  placeholder="Ponto"
                  className="input text-xs"
                  aria-label="Rótulo"
                  maxLength={40}
                />
                <input
                  type="number"
                  step="0.5"
                  value={r.weight}
                  onChange={(e) => updateRow(i, { weight: e.target.value })}
                  className="input text-center text-xs"
                  aria-label="Peso"
                />
                <button
                  onClick={() => removeRow(i)}
                  className="rounded-md px-2 text-xs text-live hover:bg-live/10"
                  aria-label="Remover linha"
                >
                  ×
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {hasDup && <p className="mt-2 text-xs text-live">Há códigos duplicados.</p>}

      <div className="mt-3 flex justify-end gap-2">
        <button onClick={onClose} className="btn-ghost text-xs">Fechar</button>
        <button
          onClick={save}
          disabled={!allValid || saving}
          className="btn-primary text-xs disabled:opacity-60"
        >
          {saving ? "Salvando…" : "Salvar"}
        </button>
      </div>
    </div>
  );
}
