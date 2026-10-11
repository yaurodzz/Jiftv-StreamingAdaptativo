import { Link, useLocation } from "react-router-dom";
import { Film, LayoutDashboard, Radio, Users } from "lucide-react";
import { useLiveStatus } from "../../providers/LiveStatusProvider.jsx";
import { useAuth } from "../../providers/AuthProvider.jsx";
import { NAV_LINKS } from "./navLinks.js";

// Barra de navegação do celular (abaixo de `md`), fixa no pé da tela para o polegar.
// Substitui o menu hambúrguer. A aba "Painel" só aparece para quem é admin.
// `match` lista os prefixos de rota que acendem cada aba (a gravação pertence ao catálogo).
const EXTRA = {
  "/live":     { icon: Radio, match: ["/live"] },
  "/catalogo": { icon: Film,  match: ["/catalogo", "/partidas"] },
  "/atletas":  { icon: Users, match: ["/atletas"] },
};
const ADMIN_TAB = { to: "/admin", label: "Painel", icon: LayoutDashboard, match: ["/admin", "/scout"] };

export default function BottomNav() {
  const { pathname } = useLocation();
  const { stream } = useLiveStatus();
  const { isAdmin } = useAuth();

  const tabs = NAV_LINKS.map((l) => ({ ...l, ...EXTRA[l.to] }));
  if (isAdmin) tabs.push(ADMIN_TAB);

  return (
    <nav
      aria-label="Principal"
      className="glass fixed inset-x-0 bottom-0 z-40 border-t pb-safe md:hidden"
    >
      <ul className="mx-auto flex max-w-md px-safe">
        {tabs.map(({ to, label, icon: Icon, match }) => {
          const active = match.some((m) => pathname === m || pathname.startsWith(m + "/"));
          const live = to === "/live" && Boolean(stream);
          return (
            <li key={to} className="flex-1">
              <Link
                to={to}
                aria-current={active ? "page" : undefined}
                className={
                  "flex h-14 flex-col items-center justify-center gap-0.5 text-[11px] transition-colors " +
                  (active ? "font-semibold text-accent" : "font-medium text-muted")
                }
              >
                <span className="relative">
                  <Icon size={22} strokeWidth={active ? 2.25 : 1.75} aria-hidden="true" />
                  {live && (
                    <span className="absolute -right-1.5 -top-0.5 flex h-2 w-2">
                      <span className="absolute inline-flex h-full w-full animate-live-pulse rounded-full bg-live opacity-70" />
                      <span className="relative inline-flex h-2 w-2 rounded-full bg-live" />
                    </span>
                  )}
                </span>
                <span>
                  {label}
                  {live && <span className="sr-only"> (transmissão no ar)</span>}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
