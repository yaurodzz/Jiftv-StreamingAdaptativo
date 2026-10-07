import { Link } from "react-router-dom";
import LogoMark from "../ui/LogoMark.jsx";

export default function Footer() {
  return (
    <footer className="mt-24 border-t border-line bg-surface/60">
      <div className="mx-auto flex max-w-6xl flex-col items-start justify-between gap-6 px-4 py-8 md:flex-row md:items-center">
        <div className="flex items-center gap-2.5">
          <LogoMark />
          <span className="font-semibold">JIFTv</span>
          <span className="text-sm text-muted">Jogos Interescolares IFSC · streaming adaptativo</span>
        </div>
        <nav aria-label="Rodapé" className="flex items-center gap-5 text-sm text-muted">
          <Link to="/live" className="hover:text-fg">Ao vivo</Link>
          <Link to="/catalogo" className="hover:text-fg">Catálogo</Link>
          <Link to="/atletas" className="hover:text-fg">Atletas</Link>
          <Link to="/admin" className="hover:text-fg">Painel</Link>
        </nav>
        <p className="text-xs text-muted">
          © {new Date().getFullYear()} IFSC
        </p>
      </div>
    </footer>
  );
}
