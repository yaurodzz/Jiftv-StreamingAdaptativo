// Chips de filtro por modalidade, com contagem. "Todas" limpa o filtro.
export default function ModalityChips({ items, active, onChange }) {
  return (
    <div
      className="no-scrollbar flex flex-wrap gap-2 max-md:-mx-4 max-md:flex-nowrap max-md:overflow-x-auto max-md:px-4"
      role="tablist"
      aria-label="Filtrar por modalidade"
    >
      <Chip
        label="Todas"
        count={items.reduce((sum, m) => sum + m.count, 0)}
        active={!active}
        onClick={() => onChange(null)}
      />
      {items.map((m) => (
        <Chip
          key={m.name}
          label={m.name}
          count={m.count}
          active={active === m.name}
          onClick={() => onChange(m.name)}
        />
      ))}
    </div>
  );
}

function Chip({ label, count, active, onClick }) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={
        "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm transition-colors " +
        "max-md:min-h-11 max-md:shrink-0 max-md:whitespace-nowrap max-md:px-4 " +
        (active
          ? "border-accent bg-accent text-white"
          : "border-line bg-surface text-fg hover:border-accent/50")
      }
    >
      {label}
      <span
        className={
          "rounded-full px-1.5 text-[11px] font-medium " +
          (active ? "bg-white/20 text-white" : "bg-elevated text-muted")
        }
      >
        {count}
      </span>
    </button>
  );
}
