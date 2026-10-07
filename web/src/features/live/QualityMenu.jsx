import { useEffect, useRef, useState } from "react";
import { Settings2, Check } from "lucide-react";

// Menu "Automático" + níveis do manifesto. Aparece no canto inferior direito
// do player. Fecha ao clicar fora ou com Esc.
export default function QualityMenu({ levels, currentId, auto, onSelect }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e) => { if (!ref.current?.contains(e.target)) setOpen(false); };
    const onKey = (e) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const currentLabel = auto
    ? "Auto"
    : (levels.find((l) => l.id === currentId)?.label || "—");

  // Ordena por altura desc para exibição consistente.
  const sorted = [...levels].sort((a, b) => (b.height || 0) - (a.height || 0));

  return (
    <div ref={ref} className="pointer-events-auto relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Qualidade do vídeo"
        className="glass inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium text-fg hover:border-accent/60"
      >
        <Settings2 size={13} />
        {currentLabel}
      </button>

      {open && (
        <div
          role="menu"
          className="absolute bottom-full right-0 mb-2 min-w-[160px] overflow-hidden rounded-xl border border-line bg-surface/95 backdrop-blur"
        >
          <button
            role="menuitemradio"
            aria-checked={auto}
            onClick={() => { onSelect(-1); setOpen(false); }}
            className="flex w-full items-center justify-between px-3 py-2 text-sm hover:bg-elevated"
          >
            <span>Automático</span>
            {auto && <Check size={14} className="text-accent" />}
          </button>
          <div className="h-px bg-line" />
          {sorted.map((l) => (
            <button
              key={l.id}
              role="menuitemradio"
              aria-checked={!auto && currentId === l.id}
              onClick={() => { onSelect(l.id); setOpen(false); }}
              className="flex w-full items-center justify-between px-3 py-2 text-sm hover:bg-elevated"
            >
              <span>{l.label}</span>
              {!auto && currentId === l.id && <Check size={14} className="text-accent" />}
            </button>
          ))}
          {sorted.length === 0 && (
            <p className="px-3 py-2 text-xs text-muted">Sem informações de qualidade.</p>
          )}
        </div>
      )}
    </div>
  );
}
