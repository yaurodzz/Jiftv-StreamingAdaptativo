import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { subscribeLiveStreams } from "../services/streams.js";

// Uma única subscription para toda a árvore React: transmissões no ar agora.
// `streams` traz só as listadas no site; `stream` é a principal (a mais antiga no ar).
const LiveStatusContext = createContext({ streams: [], stream: null, loading: true });

export function LiveStatusProvider({ children }) {
  const [state, setState] = useState({ all: [], loading: true });

  useEffect(() => subscribeLiveStreams(
    (all) => setState({ all, loading: false }),
    (err) => {
      console.error("[LiveStatusProvider]", err);
      setState((s) => ({ ...s, loading: false }));
    },
  ), []);

  const value = useMemo(() => {
    const streams = state.all
      .filter((s) => s.listed !== false)
      .sort((a, b) => (a.startedAt?.seconds || 0) - (b.startedAt?.seconds || 0));
    return { streams, stream: streams[0] || null, loading: state.loading };
  }, [state]);

  return <LiveStatusContext.Provider value={value}>{children}</LiveStatusContext.Provider>;
}

export function useLiveStatus() {
  return useContext(LiveStatusContext);
}
