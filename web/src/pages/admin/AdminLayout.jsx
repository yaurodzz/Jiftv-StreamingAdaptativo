import { useCallback, useEffect, useRef, useState } from "react";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import { signOut } from "firebase/auth";
import { auth } from "../../lib/firebase.js";
import { useAuth } from "../../providers/AuthProvider.jsx";
import { useLiveStatus } from "../../providers/LiveStatusProvider.jsx";
import { ToastProvider } from "../../features/admin/ToastProvider.jsx";
import { useServer } from "../../features/admin/useServer.js";
import { subscribeAthletesAdmin } from "../../services/athletes.js";

// /admin — protegido por ProtectedRoute (login + custom claim admin).
// Cada seção é uma rota própria; o estado do servidor de mídia fica sempre visível.

const TABS = [
  { to: "/admin", label: "Visão geral", end: true },
  { to: "/admin/transmissoes", label: "Transmissões" },
  { to: "/admin/gravacoes", label: "Gravações" },
  { to: "/admin/atletas", label: "Atletas" },
  { to: "/admin/modalidades", label: "Modalidades" },
  { to: "/admin/turmas", label: "Turmas" },
  { to: "/admin/sistema", label: "Sistema" },
];

function ServerPill() {
  const { loading, mediaOnline: online } = useServer();
  if (loading) return null;
  return (
    <NavLink
      to="/admin/sistema"
      className={
        "inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium max-md:min-h-11 " +
        (online ? "border-accent/40 text-fg" : "border-live/50 text-live")
      }
      title={online ? "Servidor de mídia conectado" : "Sem sinal do servidor de mídia"}
    >
      <span className={"h-2 w-2 rounded-full " + (online ? "bg-accent" : "bg-live")} />
      {online ? "Servidor de mídia on-line" : "Servidor de mídia fora do ar"}
    </NavLink>
  );
}

export default function AdminLayout() {
  const { user } = useAuth();
  const { streams } = useLiveStatus();
  const [pending, setPending] = useState(0);
  const tabsRef = useRef(null);
  const [moreTabs, setMoreTabs] = useState(false);
  const { pathname } = useLocation();

  // No celular as abas rolam na horizontal: a borda direita esmaece enquanto houver
  // abas escondidas, e a aba ativa é trazida para a vista ao trocar de seção.
  const updateTabs = useCallback(() => {
    const el = tabsRef.current;
    if (el) setMoreTabs(el.scrollLeft < el.scrollWidth - el.clientWidth - 2);
  }, []);

  useEffect(() => {
    const el = tabsRef.current;
    if (!el) return undefined;
    updateTabs();
    el.addEventListener("scroll", updateTabs, { passive: true });
    const ro = new ResizeObserver(updateTabs);
    ro.observe(el);
    return () => {
      el.removeEventListener("scroll", updateTabs);
      ro.disconnect();
    };
  }, [updateTabs]);

  useEffect(() => {
    tabsRef.current?.querySelector('[aria-current="page"]')?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [pathname]);

  // Contador em background para o selo de "Atletas" (cadastros aguardando aprovação).
  useEffect(() => subscribeAthletesAdmin({ status: "pending" }, (l) => setPending(l.length), () => setPending(0)), []);

  return (
    <ToastProvider>
      <section className="mx-auto max-w-6xl px-4 py-5 md:py-10">
        <header className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-3xl font-semibold">Painel</h1>
            <p className="text-sm text-muted">{user?.email}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <ServerPill />
            <button onClick={() => signOut(auth)} className="btn-ghost">Sair</button>
          </div>
        </header>

        <nav
          ref={tabsRef}
          aria-label="Seções do painel"
          className={
            "max-md:no-scrollbar mb-6 flex gap-1 overflow-x-auto rounded-full border border-line bg-surface p-1 text-sm " +
            (moreTabs ? "max-md:[mask-image:linear-gradient(to_right,black_calc(100%-3rem),transparent)]" : "")
          }
        >
          {TABS.map((t) => (
            <NavLink
              key={t.to}
              to={t.to}
              end={t.end}
              className={({ isActive }) =>
                "relative inline-flex shrink-0 items-center gap-2 rounded-full px-4 py-1.5 transition max-md:min-h-11 " +
                (isActive ? "bg-accent text-white" : "text-muted hover:text-fg")
              }
            >
              {({ isActive }) => (
                <>
                  {t.label}
                  {t.to === "/admin/atletas" && pending > 0 && (
                    <span
                      className={
                        "inline-flex min-w-[1.25rem] items-center justify-center rounded-full px-1.5 py-0.5 text-[10px] font-semibold " +
                        (isActive ? "bg-white/25 text-white" : "bg-warn text-white")
                      }
                      aria-label={`${pending} pendentes`}
                    >
                      {pending}
                    </span>
                  )}
                  {t.to === "/admin/transmissoes" && streams.length > 0 && (
                    <span
                      className={
                        "inline-flex min-w-[1.25rem] items-center justify-center rounded-full px-1.5 py-0.5 text-[10px] font-semibold " +
                        (isActive ? "bg-white/25 text-white" : "bg-live text-white")
                      }
                      aria-label={`${streams.length} ao vivo`}
                    >
                      {streams.length}
                    </span>
                  )}
                </>
              )}
            </NavLink>
          ))}
        </nav>

        <Outlet />
      </section>
    </ToastProvider>
  );
}
