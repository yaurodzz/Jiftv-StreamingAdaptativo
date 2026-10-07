import { createContext, useContext, useEffect, useState } from "react";
import { onIdTokenChanged } from "firebase/auth";
import { auth } from "../lib/firebase.js";

// Usuário logado + se ele tem o custom claim { admin: true }.
// O claim é definido pelo worker: docker compose exec api python -m app.cli admin <email>
const AuthContext = createContext({ user: null, isAdmin: false, loading: true });

export function AuthProvider({ children }) {
  const [state, setState] = useState({ user: null, isAdmin: false, loading: true });

  useEffect(
    () => onIdTokenChanged(auth, async (user) => {
      if (!user) {
        setState({ user: null, isAdmin: false, loading: false });
        return;
      }
      const token = await user.getIdTokenResult();
      setState({ user, isAdmin: token.claims.admin === true, loading: false });
    }),
    [],
  );

  return <AuthContext.Provider value={state}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}

// ID token atual, para abrir gravações ocultas no servidor de mídia (?token=...).
export async function currentIdToken() {
  return auth.currentUser ? auth.currentUser.getIdToken() : null;
}
