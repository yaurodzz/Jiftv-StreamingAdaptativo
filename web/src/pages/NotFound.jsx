import { Link } from "react-router-dom";

export default function NotFound() {
  return (
    <section className="mx-auto grid min-h-[60vh] max-w-md place-items-center px-4 py-20 text-center">
      <div>
        <p className="text-sm font-medium text-accent">Erro 404</p>
        <h1 className="mt-2 text-3xl font-semibold">Página não encontrada</h1>
        <p className="mt-3 text-muted">
          O endereço que você seguiu não existe ou foi removido.
        </p>
        <div className="mt-6 flex justify-center gap-3">
          <Link to="/live" className="btn-primary">Ir para o ao vivo</Link>
          <Link to="/catalogo" className="btn-ghost">Ver gravações</Link>
        </div>
      </div>
    </section>
  );
}
