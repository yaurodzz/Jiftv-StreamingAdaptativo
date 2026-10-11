import { useEffect, useRef } from "react";
import { X } from "lucide-react";

// Janela de formulário com <dialog> nativo (foco, Esc e fundo), no mesmo estilo do ConfirmDialog.
export default function FormDialog({
  open, title, onClose, onSubmit, submitLabel, submitting, submitDisabled = false, danger = false, children, wide = false,
}) {
  const ref = useRef(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (open && !el.open) el.showModal();
    if (!open && el.open) el.close();
  }, [open]);

  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    const onCancel = (e) => { e.preventDefault(); onClose?.(); };
    el.addEventListener("cancel", onCancel);
    return () => el.removeEventListener("cancel", onCancel);
  }, [onClose]);

  return (
    <dialog
      ref={ref}
      className={
        "w-[calc(100%-2rem)] rounded-2xl border border-line bg-surface p-0 text-fg shadow-2xl backdrop:bg-black/60 " +
        (wide ? "max-w-2xl" : "max-w-lg")
      }
      onClick={(e) => { if (e.target === ref.current) onClose?.(); }}
    >
      {open && (
        <form
          onSubmit={(e) => { e.preventDefault(); onSubmit?.(); }}
          className="flex max-h-[calc(100vh-4rem)] flex-col supports-[height:100dvh]:max-h-[calc(100dvh-4rem)]"
        >
          <header className="flex items-center justify-between gap-3 px-4 pt-4 sm:px-6 sm:pt-5">
            <h2 className="text-lg font-semibold">{title}</h2>
            <button type="button" onClick={onClose} className="icon-btn" aria-label="Fechar">
              <X size={16} />
            </button>
          </header>
          <div className="overflow-y-auto px-4 py-4 sm:px-6">{children}</div>
          <footer className="flex justify-end gap-2 border-t border-line px-4 py-4 sm:px-6 max-sm:[&>*]:flex-1 max-sm:[&>*]:justify-center">
            <button type="button" onClick={onClose} className="btn-ghost">Cancelar</button>
            <button
              type="submit"
              disabled={submitting || submitDisabled}
              className={(danger
                ? "inline-flex items-center gap-2 rounded-full bg-live px-5 py-2.5 text-sm font-medium text-white hover:brightness-110 max-md:min-h-11"
                : "btn-primary") + " disabled:opacity-60"}
            >
              {submitting && !danger ? "Salvando…" : submitLabel}
            </button>
          </footer>
        </form>
      )}
    </dialog>
  );
}
