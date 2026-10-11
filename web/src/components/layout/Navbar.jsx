import { useEffect, useState } from "react";
import { Link, NavLink } from "react-router-dom";
import { LogIn } from "lucide-react";
import LogoMark from "../ui/LogoMark.jsx";
import ThemeToggle from "./ThemeToggle.jsx";
import LiveIndicator from "./LiveIndicator.jsx";
import { useLiveStatus } from "../../providers/LiveStatusProvider.jsx";
import { useAuth } from "../../providers/AuthProvider.jsx";
import { NAV_LINKS } from "./navLinks.js";

function DesktopLink({ to, label }) {
  return (
    <NavLink
      to={to}
      className={({ isActive }) =>
        "relative px-1 py-2 text-sm text-muted transition-colors hover:text-fg " +
        (isActive ? "text-fg" : "")
      }
    >
      {({ isActive }) => (
        <>
          {label}
          <span
            className={
              "absolute -bottom-0.5 left-0 h-0.5 w-full origin-left rounded-full bg-accent transition-transform duration-300 " +
              (isActive ? "scale-x-100" : "scale-x-0")
            }
          />
        </>
      )}
    </NavLink>
  );
}

// Cabeçalho. De `md` para cima traz a navegação; no celular os destinos ficam na barra
// inferior (BottomNav) e aqui sobram a marca, o tema e a entrada do painel.
export default function Navbar() {
  const [scrolled, setScrolled] = useState(false);
  const { stream } = useLiveStatus();
  const { isAdmin } = useAuth();

  // Header vira vidro fosco ao rolar.
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header
      className={
        "sticky top-0 z-40 border-b pt-safe transition-colors " +
        (scrolled ? "glass border-line" : "border-transparent bg-bg")
      }
    >
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3 max-md:py-2">
        <Link to="/live" className="flex items-center gap-2.5 max-md:min-h-11" aria-label="Ir para a página inicial">
          <LogoMark live={!!stream} />
          <span className="text-lg font-semibold tracking-tight">JIFTv</span>
        </Link>

        <nav aria-label="Principal" className="hidden items-center gap-6 md:flex">
          {NAV_LINKS.map((l) => <DesktopLink key={l.to} {...l} />)}
        </nav>

        <div className="hidden items-center gap-3 md:flex">
          <LiveIndicator />
          <ThemeToggle />
          <Link to="/admin" className="rounded-full border border-line px-3 py-1.5 text-xs font-medium text-muted hover:text-fg">
            {isAdmin ? "Painel" : "Entrar"}
          </Link>
        </div>

        <div className="flex items-center gap-1 md:hidden">
          <ThemeToggle />
          {/* Quem já é admin tem a aba "Painel" na barra inferior. */}
          {!isAdmin && (
            <Link to="/admin" className="icon-btn -mr-2" aria-label="Entrar no painel">
              <LogIn size={18} />
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}
