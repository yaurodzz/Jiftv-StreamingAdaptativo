import {
  collection, doc, getDoc, onSnapshot, orderBy, query, serverTimestamp, updateDoc, where, writeBatch,
} from "firebase/firestore";
import { auth, db } from "../lib/firebase.js";

// Acesso à coleção `athletes`. As Firestore rules só liberam leitura de docs
// com status="approved" — então a query com esse where roda sem privilégio.
// Perfis pendentes/rejeitados só aparecem no painel (custom claim admin).

const list = (snap) => snap.docs.map((d) => ({ id: d.id, ...d.data() }));

export function subscribeApprovedAthletes(cb, onError) {
  const q = query(
    collection(db, "athletes"),
    where("status", "==", "approved"),
    orderBy("name"),
  );
  return onSnapshot(q, (snap) => cb(list(snap)), onError);
}

export async function getAthlete(id) {
  const snap = await getDoc(doc(db, "athletes", id));
  if (!snap.exists()) return null;
  const data = { id: snap.id, ...snap.data() };
  // Rules já filtram, mas defesa em profundidade: nunca expor não-aprovados.
  if (data.status !== "approved") return null;
  return data;
}

// Eventos de scout de um atleta específico. Coleção pequena o suficiente para
// agregar no cliente sem denormalização por atleta.
export function subscribeAthleteScout(athleteId, cb, onError) {
  const q = query(collection(db, "scoutEvents"), where("athleteId", "==", athleteId));
  return onSnapshot(q, (snap) => cb(list(snap)), onError);
}

// ------------------------------------------------------------------ painel (moderação)
// Filtro por status opcional: "pending" | "approved" | "rejected" | undefined (todos).
export function subscribeAthletesAdmin({ status } = {}, cb, onError) {
  const constraints = [];
  if (status) constraints.push(where("status", "==", status));
  // Pendentes ordenados por data (mais antigos primeiro — fila FIFO).
  // Para "approved" ou tudo, ordenar por nome fica mais útil.
  constraints.push(status === "pending" ? orderBy("submittedAt", "asc") : orderBy("name"));
  return onSnapshot(query(collection(db, "athletes"), ...constraints), (snap) => cb(list(snap)), onError);
}

const adminName = () => auth.currentUser?.email || auth.currentUser?.uid || "admin";

export function approveAthlete(id) {
  return updateDoc(doc(db, "athletes", id), {
    status: "approved",
    approvedAt: serverTimestamp(),
    approvedBy: adminName(),
    rejectionReason: null,
  });
}

// Rejeitar mantém o documento (com o motivo) para auditoria.
export function rejectAthlete(id, reason) {
  return updateDoc(doc(db, "athletes", id), {
    status: "rejected",
    rejectedAt: serverTimestamp(),
    rejectedBy: adminName(),
    rejectionReason: reason?.trim() ? reason.trim().slice(0, 200) : null,
  });
}

// Correção de dados pelo admin (mesmos limites do cadastro público).
export function updateAthlete(id, data) {
  const clean = (v, max) => (v?.trim() ? v.trim().slice(0, max) : null);
  return updateDoc(doc(db, "athletes", id), {
    name: data.name.trim().slice(0, 60),
    nickname: clean(data.nickname, 30),
    position: clean(data.position, 40),
    bio: clean(data.bio, 400),
    jerseyNumber: data.jerseyNumber === "" || data.jerseyNumber == null ? null : Math.max(0, Math.min(999, Number(data.jerseyNumber))),
  });
}

// Dados privados (matrícula escolar e nome devolvido pelo site institucional), só para o admin.
// Mapa { idDoAtleta: { matricula, institutionalName, ... } }.
export function subscribeAthletePrivate(cb, onError) {
  return onSnapshot(
    collection(db, "athletePrivate"),
    (snap) => cb(Object.fromEntries(snap.docs.map((d) => [d.id, d.data()]))),
    onError,
  );
}

// Remoção definitiva: só para spam ou duplicata. Apaga também os dados privados.
// (A foto guardada no servidor ou no Cloudinary não é apagada por aqui.)
export async function deleteAthlete(id) {
  const batch = writeBatch(db);
  batch.delete(doc(db, "athletes", id));
  batch.delete(doc(db, "athletePrivate", id));
  await batch.commit();
}
