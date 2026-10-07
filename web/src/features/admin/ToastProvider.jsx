import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";

// Notificações não-bloqueantes. Convenção: mesmo verbo do botão.
// Botão "Gerar chave" → toast "Chave gerada". Botão "Remover" → toast "Modalidade removida".

const ToastContext = createContext(null);

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const idRef = useRef(0);

  const dismiss = useCallback((id) => {
    setToasts((list) => list.filter((t) => t.id !== id));
  }, []);

  const push = useCallback((toast) => {
    const id = ++idRef.current;
    setToasts((list) => [...list, { id, tone: "success", timeout: 3500, ...toast }]);
    return id;
  }, []);

  const api = useRef({
    success: (message) => push({ tone: "success", message }),
    error:   (message) => push({ tone: "error",   message, timeout: 6000 }),
    info:    (message) => push({ tone: "info",    message }),
  }).current;

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div
        aria-live="polite"
        aria-atomic="true"
        className="pointer-events-none fixed inset-x-0 bottom-4 z-50 flex flex-col items-center gap-2 px-4"
      >
        {toasts.map((t) => (
          <ToastItem key={t.id} toast={t} onDismiss={() => dismiss(t.id)} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

function ToastItem({ toast, onDismiss }) {
  useEffect(() => {
    if (!toast.timeout) return;
    const t = setTimeout(onDismiss, toast.timeout);
    return () => clearTimeout(t);
  }, [toast.timeout, onDismiss]);

  const tone =
    toast.tone === "error"
      ? "border-live/40 bg-live/10 text-live"
      : toast.tone === "info"
      ? "border-line bg-elevated text-fg"
      : "border-accent/40 bg-accent/10 text-fg";

  return (
    <div
      role="status"
      className={`glass pointer-events-auto max-w-md rounded-xl border px-4 py-3 text-sm shadow-lg ${tone}`}
    >
      {toast.message}
    </div>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast fora de <ToastProvider>");
  return ctx;
}
