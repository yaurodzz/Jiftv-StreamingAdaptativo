import { addDoc, collection, onSnapshot, serverTimestamp } from "firebase/firestore";
import { auth, db } from "../lib/firebase.js";

// Pedidos do painel para o worker do servidor de mídia (coleção `commands`).
// O painel roda na nuvem e não alcança o servidor da escola diretamente: ele grava o
// pedido no Firestore e espera o worker responder no mesmo documento.

export async function sendCommand(type, payload = {}, { timeoutMs = 30000 } = {}) {
  const ref = await addDoc(collection(db, "commands"), {
    type,
    payload,
    status: "pending",
    createdAt: serverTimestamp(),
    createdBy: auth.currentUser?.email || null,
  });

  return new Promise((resolve, reject) => {
    let unsub = () => {};
    const timer = setTimeout(() => {
      unsub();
      reject(new Error("O servidor de mídia não respondeu. Confira se ele está ligado e conectado à internet."));
    }, timeoutMs);

    unsub = onSnapshot(ref, (snap) => {
      const data = snap.data();
      if (!data || (data.status !== "done" && data.status !== "error")) return;
      clearTimeout(timer);
      unsub();
      if (data.status === "done") resolve(data.result ?? null);
      else reject(new Error(data.error || "O servidor de mídia não conseguiu concluir o pedido."));
    }, (err) => {
      clearTimeout(timer);
      reject(err);
    });
  });
}
