import {
  addDoc, collection, deleteDoc, doc, onSnapshot, orderBy, query, serverTimestamp, where,
} from "firebase/firestore";
import { auth, db } from "../lib/firebase.js";

// Eventos de scout (coleção `scoutEvents`). Leitura pública: o perfil do atleta
// agrega no navegador. Cada evento é imutável; para corrigir, apaga-se e recria-se.
//
// Ordenamos por videoTime asc pra facilitar a linha do tempo.

export function subscribeScoutEventsForVod(vodId, cb, onError) {
  const q = query(
    collection(db, "scoutEvents"),
    where("matchId", "==", vodId),
    orderBy("videoTime", "asc"),
  );
  return onSnapshot(q, (snap) => cb(snap.docs.map((d) => ({ id: d.id, ...d.data() }))), onError);
}

// Mesmos campos que o backend anterior gravava (athleteName e modalityCode denormalizados).
export function createScoutEvent({ matchId, matchType = "vod", athlete, type, value = 1, videoTime = null, note }) {
  if (athlete?.status !== "approved") throw new Error("Atleta ainda não aprovado.");
  return addDoc(collection(db, "scoutEvents"), {
    matchId,
    matchType,
    athleteId: athlete.id,
    athleteName: athlete.name,
    modalityCode: athlete.modalityCode,
    type,
    value,
    videoTime: Number.isFinite(videoTime) ? videoTime : null,
    ...(note?.trim() ? { note: note.trim().slice(0, 120) } : {}),
    createdAt: serverTimestamp(),
    createdBy: auth.currentUser?.email || auth.currentUser?.uid || "admin",
  });
}

export function deleteScoutEvent(id) {
  return deleteDoc(doc(db, "scoutEvents", id));
}
