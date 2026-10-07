// Fallback minimalista para o Suspense enquanto uma rota é carregada.
export default function RouteFallback() {
  return (
    <div
      role="status"
      aria-live="polite"
      className="mx-auto grid min-h-[40vh] max-w-md place-items-center px-4 text-sm text-muted"
    >
      Carregando…
    </div>
  );
}
