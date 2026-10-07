import { collection, doc, limit, onSnapshot, orderBy, query } from "firebase/firestore";
import { db } from "../lib/firebase.js";
import { toDate } from "../lib/format.js";
import { sendCommand } from "./commands.js";

// Estado do servidor de mídia, publicado pelo worker a cada 20 s em `system/server`.
export function subscribeServer(cb, onError) {
  return onSnapshot(doc(db, "system", "server"), (snap) => cb(snap.exists() ? snap.data() : null), onError);
}

// Sem sinal novo há mais de 1 minuto = servidor (ou a internet da escola) fora do ar.
export function serverOnline(server) {
  const last = toDate(server?.lastSeen);
  return Boolean(last && Date.now() - last.getTime() < 60000);
}

export function subscribeEvents(n, cb, onError) {
  const q = query(collection(db, "events"), orderBy("at", "desc"), limit(n));
  return onSnapshot(q, (snap) => cb(snap.docs.map((d) => ({ id: d.id, ...d.data() }))), onError);
}

export const fetchLogs = (name, lines = 400) => sendCommand("logs", { name, lines });
export const resyncRecordings = () => sendCommand("resync", {}, { timeoutMs: 60000 });
