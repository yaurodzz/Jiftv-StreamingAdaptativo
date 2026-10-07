import { Link, Navigate, useLocation } from "react-router-dom";
import { signOut } from "firebase/auth";
import { auth } from "../../lib/firebase.js";
import { useAuth } from "../../providers/AuthProvider.jsx";

// Painel: exige login E o custom claim { admin: true }.
export default function ProtectedRoute({ children }) {
  const { user, isAdmin, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div role="status" className="mx-auto max-w-md px-4 py-24 text-center text-muted">
        Verificando sessão…
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/admin/login" state={{ from: location }} replace />;
  }

  if (!isAdmin) {
    return (
      <section className="mx-auto max-w-md px-4 py-24 text-center">
        <h1 className="text-2xl font-semibold">Sua conta ainda não tem acesso ao painel</h1>
        <p className="mt-3 text-sm text-muted">
          Peça a quem cuida do servidor para liberar o e-mail <span className="text-fg">{user.email}</span> com:
        </p>
        <code className="mt-3 block rounded-xl border border-line bg-surface px-3 py-2 font-mono text-xs">
          docker compose exec api python -m app.cli admin {user.email}
        </code>
        <p className="mt-3 text-xs text-muted">Depois disso, saia e entre de novo.</p>
        <div className="mt-6 flex justify-center gap-3">
          <button type="button" onClick={() => signOut(auth)} className="btn-ghost">Sair</button>
          <Link to="/live" className="btn-primary">Ir para o ao vivo</Link>
        </div>
      </section>
    );
  }

  return children;
}
