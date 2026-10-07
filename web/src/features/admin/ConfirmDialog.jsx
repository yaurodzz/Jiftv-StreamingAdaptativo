import { useEffect, useRef } from "react";

// Dialog de confirmação para ações destrutivas. Usa <dialog> nativo
// (foco/ESC/backdrop). O consumidor controla open + callbacks.

export default function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = "Confirmar",
  cancelLabel  = "Cancelar",
  tone = "danger",
  onConfirm,
  onCancel,
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
    if (!el) return;
    const onCancelEvent = (e) => { e.preventDefault(); onCancel?.(); };
    el.addEventListener("cancel", onCancelEvent);
    return () => el.removeEventListener("cancel", onCancelEvent);
  }, [onCancel]);

  const confirmClass =
    tone === "danger"
      ? "inline-flex items-center gap-2 rounded-full bg-live px-5 py-2.5 text-sm font-medium text-white transition-transform hover:brightness-110 active:scale-[0.98]"
      : "btn-primary";

  return (
    <dialog
      ref={ref}
      className="max-w-md rounded-2xl border border-line bg-surface p-6 text-fg shadow-2xl backdrop:bg-black/60"
      onClick={(e) => { if (e.target === ref.current) onCancel?.(); }}
    >
      <h2 className="text-lg font-semibold">{title}</h2>
      {description && (
        typeof description === "string"
          ? <p className="mt-2 text-sm text-muted">{description}</p>
          : <div className="mt-2 text-sm text-muted">{description}</div>
      )}
      <div className="mt-6 flex justify-end gap-2">
        <button type="button" onClick={onCancel} className="btn-ghost">{cancelLabel}</button>
        <button type="button" onClick={onConfirm} className={confirmClass}>{confirmLabel}</button>
      </div>
    </dialog>
  );
}
