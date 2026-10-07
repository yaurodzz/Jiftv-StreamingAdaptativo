import { useEffect, useState } from "react";

// Recebe um Timestamp Firestore, Date, número em ms ou string ISO e devolve
// uma string curta "hh:mm:ss" desde o início.
function toDate(x) {
  if (!x) return null;
  if (typeof x.toDate === "function") return x.toDate();
  if (x instanceof Date) return x;
  return new Date(x);
}

function pad(n) { return String(n).padStart(2, "0"); }

export function useUptime(start) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  const startedAt = toDate(start);
  if (!startedAt) return null;
  const s = Math.max(0, Math.floor((now - startedAt.getTime()) / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return h > 0 ? `${h}:${pad(m)}:${pad(sec)}` : `${m}:${pad(sec)}`;
}
