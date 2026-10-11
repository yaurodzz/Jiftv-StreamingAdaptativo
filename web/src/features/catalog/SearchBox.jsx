import { Search, X } from "lucide-react";

export default function SearchBox({ value, onChange, placeholder = "Buscar por título" }) {
  return (
    <div className="relative w-full max-w-sm">
      <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted">
        <Search size={16} />
      </span>
      <input
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        aria-label="Buscar gravações por título"
        enterKeyHint="search"
        autoComplete="off"
        autoCapitalize="none"
        className="input h-10 pl-9 pr-8 max-md:pr-11"
      />
      {value && (
        <button
          type="button"
          onClick={() => onChange("")}
          aria-label="Limpar busca"
          className="absolute right-2 top-1/2 grid -translate-y-1/2 h-6 w-6 place-items-center rounded-full text-muted hover:bg-elevated max-md:right-0 max-md:h-11 max-md:w-11"
        >
          <X size={13} />
        </button>
      )}
    </div>
  );
}
