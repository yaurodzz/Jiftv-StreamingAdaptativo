import { useState } from "react";
import { Navigate, useLocation, useNavigate } from "react-router-dom";
import { signInWithEmailAndPassword } from "firebase/auth";
import { auth, usingEmulators } from "../lib/firebase.js";
import { useAuth } from "../providers/AuthProvider.jsx";

// Login isolado do dashboard. Redireciona para `from` (ou /admin) após entrar.
// A lógica de auth continua sendo o Firebase existente — nenhum comportamento novo.
export default function AdminLogin() {
  const { user, loading } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const from = location.state?.from?.pathname || "/admin";

  if (loading) return null;
  if (user) return <Navigate to={from} replace />;

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      await signInWithEmailAndPassword(auth, email, password);
      navigate(from, { replace: true });
    } catch (err) {
      const code = err?.code || "";
      setError(
        code === "auth/invalid-credential" || code === "auth/wrong-password" || code === "auth/user-not-found"
          ? "E-mail ou senha incorretos."
            : code === "auth/too-many-requests"
          ? "Muitas tentativas. Aguarde alguns minutos e tente de novo."
          : code === "auth/network-request-failed"
          ? "Sem conexão com o Firebase. Confira a internet."
          : "Não foi possível entrar. Tente novamente.",
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <section className="mx-auto grid min-h-[70vh] max-w-md place-items-center px-4 py-8 md:py-16">
      <form onSubmit={submit} className="card w-full p-6" noValidate>
        <h1 className="text-2xl font-semibold">Entrar no painel</h1>
        <p className="mt-1 text-sm text-muted">Acesso restrito à equipe do JIFTv.</p>

        <label className="mt-6 block text-sm font-medium text-fg">
          E-mail
          <input
            type="email"
            inputMode="email"
            autoComplete="email"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            enterKeyHint="next"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="input mt-1"
          />
        </label>

        <label className="mt-4 block text-sm font-medium text-fg">
          Senha
          <input
            type="password"
            autoComplete="current-password"
            enterKeyHint="go"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="input mt-1"
          />
        </label>

        {error && (
          <p role="alert" className="mt-4 rounded-lg border border-live/40 bg-live/10 px-3 py-2 text-sm text-live">
            {error}
          </p>
        )}

        <button type="submit" disabled={submitting} className="btn-primary mt-6 w-full justify-center disabled:opacity-60">
          {submitting ? "Entrando…" : "Entrar"}
        </button>

        {usingEmulators && (
          <p className="mt-4 text-xs text-muted">
            Modo de desenvolvimento (emuladores do Firebase). O usuário de teste está em
            <code className="mx-1 font-mono">DEV_ADMIN_EMAIL</code> no arquivo <code className="font-mono">.env</code>.
          </p>
        )}
      </form>
    </section>
  );
}
