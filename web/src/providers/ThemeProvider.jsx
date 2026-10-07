import { createContext, useCallback, useContext, useEffect, useState } from "react";

const STORAGE_KEY = "jiftv-theme";
const ThemeContext = createContext(null);

function readInitial() {
  if (typeof window === "undefined") return "light";
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved === "dark" || saved === "light") return saved;
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function apply(theme) {
  const root = document.documentElement;
  root.classList.toggle("dark", theme === "dark");
}

export function ThemeProvider({ children }) {
  const [theme, setTheme] = useState(readInitial);

  useEffect(() => { apply(theme); }, [theme]);

  // Segue o sistema até o usuário escolher manualmente.
  useEffect(() => {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const listener = (e) => {
      if (!localStorage.getItem(STORAGE_KEY)) setTheme(e.matches ? "dark" : "light");
    };
    mq.addEventListener?.("change", listener);
    return () => mq.removeEventListener?.("change", listener);
  }, []);

  const toggle = useCallback((origin) => {
    const next = theme === "dark" ? "light" : "dark";

    // View Transitions API: expande o novo tema em círculo a partir do botão.
    const supports = document.startViewTransition && origin && !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (!supports) {
      localStorage.setItem(STORAGE_KEY, next);
      setTheme(next);
      return;
    }

    const { clientX: x, clientY: y } = origin;
    const endRadius = Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y));
    document.documentElement.style.setProperty("--vt-x", `${x}px`);
    document.documentElement.style.setProperty("--vt-y", `${y}px`);
    document.documentElement.style.setProperty("--vt-r", `${endRadius}px`);

    const transition = document.startViewTransition(() => {
      localStorage.setItem(STORAGE_KEY, next);
      setTheme(next);
    });

    transition.ready.then(() => {
      document.documentElement.animate(
        {
          clipPath: [
            `circle(0 at ${x}px ${y}px)`,
            `circle(${endRadius}px at ${x}px ${y}px)`,
          ],
        },
        { duration: 420, easing: "ease-out", pseudoElement: "::view-transition-new(root)" },
      );
    });
  }, [theme]);

  return (
    <ThemeContext.Provider value={{ theme, toggle }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme deve estar dentro de <ThemeProvider>");
  return ctx;
}
