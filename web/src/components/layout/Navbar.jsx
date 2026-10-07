import { useEffect, useState } from "react";
import { Link, NavLink, useLocation } from "react-router-dom";
import { Menu, X } from "lucide-react";
import LogoMark from "../ui/LogoMark.jsx";
import ThemeToggle from "./ThemeToggle.jsx";
import LiveIndicator from "./LiveIndicator.jsx";
import { useLiveStatus } from "../../providers/LiveStatusProvider.jsx";
import { useAuth } from "../../providers/AuthProvider.jsx";

const NAV_LINKS = [
  { to: "/live",     label: "Ao vivo" },
  { to: "/catalogo", label: "Catálogo" },
  { to: "/atletas",  label: "Atletas" },
];

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

export default function Navbar() {
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);
  const location = useLocation();
  const { stream } = useLiveStatus();
  const { isAdmin } = useAuth();

  // Header vira vidro fosco ao rolar.
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // Menu mobile fecha ao trocar de rota e com Esc.
  useEffect(() => { setOpen(false); }, [location.pathname]);
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("keydown", onKey);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  return (
    <header
      className={
        "sticky top-0 z-40 border-b transition-colors " +
        (scrolled ? "glass border-line" : "border-transparent bg-bg")
      }
    >
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3">
        <Link to="/live" className="flex items-center gap-2.5" aria-label="Ir para a página inicial">
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

        <button
          type="button"
          onClick={() => setOpen(true)}
          className="md:hidden inline-flex h-10 w-10 items-center justify-center rounded-full border border-line text-fg"
          aria-label="Abrir menu"
          aria-expanded={open}
          aria-controls="menu-mobile"
        >
          <Menu size={18} />
        </button>
      </div>

      {/* Menu mobile em painel de vidro. */}
      {open && (
        <div
          id="menu-mobile"
          role="dialog"
          aria-modal="true"
          aria-label="Menu"
          className="fixed inset-0 z-50 md:hidden"
        >
          <div
            className="absolute inset-0 bg-bg/60 backdrop-blur-xs"
            onClick={() => setOpen(false)}
          />
          <div className="glass absolute inset-x-3 top-3 rounded-2xl border p-4 shadow-lg">
            <div className="mb-4 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <LogoMark live={!!stream} />
                <span className="font-semibold">JIFTv</span>
              </div>
              <button
                onClick={() => setOpen(false)}
                className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-line"
                aria-label="Fechar menu"
              >
                <X size={16} />
              </button>
            </div>
            <ul className="flex flex-col">
              {NAV_LINKS.map((l) => (
                <li key={l.to}>
                  <NavLink
                    to={l.to}
                    className={({ isActive }) =>
                      "block rounded-xl px-3 py-3 text-base " +
                      (isActive ? "bg-elevated text-fg" : "text-muted hover:bg-elevated hover:text-fg")
                    }
                  >
                    {l.label}
                  </NavLink>
                </li>
              ))}
              <li>
                <NavLink
                  to="/admin"
                  className="block rounded-xl px-3 py-3 text-base text-muted hover:bg-elevated hover:text-fg"
                >
                  {isAdmin ? "Painel" : "Entrar"}
                </NavLink>
              </li>
            </ul>
            <div className="mt-4 flex items-center justify-between border-t border-line pt-4">
              <LiveIndicator />
              <ThemeToggle />
            </div>
          </div>
        </div>
      )}
    </header>
  );
}
