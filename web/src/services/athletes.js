import {
  collection, doc, getDoc, onSnapshot, orderBy, query, serverTimestamp, updateDoc, where, writeBatch,
} from "firebase/firestore";
import { auth, db } from "../lib/firebase.js";
import { env } from "../lib/env.js";

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

// Foto e matrícula passam pelo worker (ele guarda a foto e fala com o site institucional);
// o worker confere o ID token de admin.
async function worker(path, { method = "POST", body, headers } = {}) {
  const token = await auth.currentUser?.getIdToken();
  let res;
  try {
    res = await fetch(`${env.apiUrl}/api/atletas/${path}`, {
      method, body, headers: { Authorization: `Bearer ${token}`, ...headers },
    });
  } catch {
    throw new Error("Não foi possível falar com o servidor de mídia. Confira se ele está ligado e conectado à internet.");
  }
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    throw new Error(typeof data?.detail === "string" ? data.detail
      : res.status === 413 ? "A foto precisa ter no máximo 5 MB."
        : `Erro ${res.status} no servidor de mídia.`);
  }
  return data;
}

const PHOTO_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

export function validatePhotoFile(file) {
  if (!file) return "Selecione uma foto.";
  if (!PHOTO_TYPES.has(file.type)) return "Formato aceito: JPG, PNG ou WebP.";
  if (file.size > 5 * 1024 * 1024) return "A foto precisa ter no máximo 5 MB.";
  return null;
}

// Foto enviada pelo admin, para quando a busca pela matrícula não trouxe foto (ou trouxe a errada).
export const uploadAthletePhoto = (id, file) =>
  worker(`${id}/foto`, { method: "PUT", body: file, headers: { "Content-Type": file.type } });

// Busca de novo, no site institucional, a foto da matrícula guardada.
export const fetchInstitutionalPhoto = (id) => worker(`${id}/foto/institucional`);

// Atleta que joga mais de um esporte: cria a cópia dele em outra modalidade (mesmos dados, foto e
// matrícula). Cada modalidade é um perfil próprio, então ele aparece em todas na vitrine.
export const addAthleteModality = (id, modalityCode) =>
  worker(`${id}/modalidades`, {
    body: JSON.stringify({ modalityCode }), headers: { "Content-Type": "application/json" },
  });

export const setAthleteMatricula = (id, matricula) =>
  worker(`${id}/matricula`, {
    method: "PUT", body: JSON.stringify({ matricula }), headers: { "Content-Type": "application/json" },
  });

// Dados privados (matrícula escolar, nome devolvido pelo site institucional e resultado da busca
// da foto), só para o admin. Mapa { idDoAtleta: { matricula, institutionalName, photoStatus, ... } }.
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
