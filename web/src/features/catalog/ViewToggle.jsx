import { LayoutGrid, Rows3 } from "lucide-react";

// Alterna entre trilhas horizontais e grade completa.
export default function ViewToggle({ value, onChange }) {
  return (
    <div
      role="tablist"
      aria-label="Modo de visualização"
      className="inline-flex overflow-hidden rounded-full border border-line bg-surface p-0.5 text-sm"
    >
      <Btn
        active={value === "rows"}
        onClick={() => onChange("rows")}
        label="Trilhas"
        icon={<Rows3 size={14} />}
      />
      <Btn
        active={value === "grid"}
        onClick={() => onChange("grid")}
        label="Grade"
        icon={<LayoutGrid size={14} />}
      />
    </div>
  );
}

function Btn({ active, onClick, label, icon }) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={
        "inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 transition-colors " +
        (active ? "bg-elevated text-fg" : "text-muted hover:text-fg")
      }
    >
      {icon}
      {label}
    </button>
  );
}
