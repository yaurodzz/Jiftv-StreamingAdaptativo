// Bloco reutilizável de estatística: valor grande + rótulo pequeno.
// Reservado para a próxima fase (atletas/scout). Usar em grid para agrupar métricas.
//
// Props:
// - value:   número ou string já formatada
// - label:   descrição curta ("Pontos", "Rebotes")
// - hint:    opcional, contexto abaixo do rótulo ("média por partida")
// - tone:    "default" (fg) | "accent" (destaque Verde IF)

export default function StatBlock({ value, label, hint, tone = "default" }) {
  const valueClass =
    tone === "accent"
      ? "text-accent"
      : "text-fg";

  return (
    <div className="rounded-2xl border border-line bg-surface p-4">
      <p className={`text-3xl font-semibold tabular-nums ${valueClass}`}>
        {value ?? "—"}
      </p>
      <p className="mt-1 text-sm font-medium text-fg">{label}</p>
      {hint && <p className="mt-0.5 text-xs text-muted">{hint}</p>}
    </div>
  );
}
