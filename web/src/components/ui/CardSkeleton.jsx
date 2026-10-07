// Esqueleto no mesmo formato do MediaCard. Sem animação por padrão para
// respeitar prefers-reduced-motion sem lógica extra.
export default function CardSkeleton() {
  return (
    <div className="overflow-hidden rounded-2xl border border-line bg-surface">
      <div className="aspect-video bg-elevated" />
      <div className="space-y-2 p-3">
        <div className="h-3.5 w-4/5 rounded bg-elevated" />
        <div className="h-3 w-2/5 rounded bg-elevated" />
      </div>
    </div>
  );
}
