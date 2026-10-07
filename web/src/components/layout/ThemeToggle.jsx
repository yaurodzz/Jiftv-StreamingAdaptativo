import { Moon, Sun } from "lucide-react";
import { useTheme } from "../../providers/ThemeProvider.jsx";

// Switch deslizante sol/lua. Onde houver View Transitions API, o novo tema
// se expande em círculo a partir do centro do botão.
export default function ThemeToggle({ className = "" }) {
  const { theme, toggle } = useTheme();
  const isDark = theme === "dark";

  const onClick = (e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    toggle({ clientX: rect.left + rect.width / 2, clientY: rect.top + rect.height / 2 });
  };

  return (
    <button
      type="button"
      role="switch"
      aria-checked={isDark}
      aria-label={isDark ? "Ativar tema claro" : "Ativar tema escuro"}
      onClick={onClick}
      className={
        "relative inline-flex h-8 w-14 items-center rounded-full border border-line " +
        "bg-elevated transition-colors " +
        className
      }
    >
      <span
        className={
          "absolute top-1/2 -translate-y-1/2 grid h-6 w-6 place-items-center rounded-full " +
          "bg-surface shadow-sm transition-transform duration-300 " +
          (isDark ? "translate-x-7" : "translate-x-1")
        }
      >
        {isDark
          ? <Moon size={13} className="text-accent" aria-hidden />
          : <Sun size={13} className="text-accent" aria-hidden />
        }
      </span>
    </button>
  );
}
