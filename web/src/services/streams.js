import {
  collection, doc, limit, onSnapshot, orderBy, query, serverTimestamp,
  Timestamp, updateDoc, where, writeBatch,
} from "firebase/firestore";
import { db } from "../lib/firebase.js";
import { generateSlug, generateStreamKey } from "../lib/streamKey.js";

// Acesso à coleção `streams` (pública, sem a chave do OBS) e `streamKeys` (só admin).
// Campos controlados pelo worker do servidor de mídia: isLive, startedAt, endedAt,
// viewers, peakViewers, input, qualitiesActive. O painel nunca escreve isLive.

const list = (snap) => snap.docs.map((d) => ({ id: d.id, ...d.data() }));

export function subscribeLiveStreams(cb, onError) {
  const q = query(collection(db, "streams"), where("isLive", "==", true));
  return onSnapshot(q, (snap) => cb(list(snap)), onError);
}

export function subscribeAllStreams(cb, onError) {
  const q = query(collection(db, "streams"), orderBy("createdAt", "desc"));
  return onSnapshot(q, (snap) => cb(list(snap)), onError);
}

export function subscribeStreamBySlug(slug, cb, onError) {
  const q = query(collection(db, "streams"), where("slug", "==", slug), limit(1));
  return onSnapshot(q, (snap) => cb(snap.empty ? null : list(snap)[0]), onError);
}

export function subscribeStream(id, cb, onError) {
  return onSnapshot(doc(db, "streams", id), (snap) => cb(snap.exists() ? { id: snap.id, ...snap.data() } : null), onError);
}

export function subscribeStreamKey(id, cb, onError) {
  return onSnapshot(doc(db, "streamKeys", id), (snap) => cb(snap.exists() ? snap.data().streamKey : null), onError);
}

// Campos editáveis no formulário do painel.
function editableFields(data, modality) {
  return {
    title: data.title.trim(),
    description: (data.description || "").trim(),
    location: (data.location || "").trim(),
    teamA: (data.teamA || "").trim(),
    teamB: (data.teamB || "").trim(),
    listed: Boolean(data.listed),
    scheduledFor: data.scheduledFor ? Timestamp.fromDate(new Date(data.scheduledFor)) : null,
    modalityId: modality?.id || null,
    modalityCode: modality?.code || null,
    modalityName: modality?.name || null,
    modality: modality?.name || null, // campo legado, mantido por compatibilidade
  };
}

export async function createStream(data, modality) {
  const ref = doc(collection(db, "streams"));
  const batch = writeBatch(db);
  batch.set(ref, {
    ...editableFields(data, modality),
    slug: generateSlug(data.title),
    scoreA: 0,
    scoreB: 0,
    keyActive: true,
    isLive: false,
    viewers: 0,
    peakViewers: 0,
    createdAt: serverTimestamp(),
  });
  batch.set(doc(db, "streamKeys", ref.id), { streamKey: generateStreamKey(), updatedAt: serverTimestamp() });
  await batch.commit();
  return ref.id;
}

export function updateStream(id, data, modality) {
  return updateDoc(doc(db, "streams", id), editableFields(data, modality));
}

export function setScore(id, scoreA, scoreB) {
  return updateDoc(doc(db, "streams", id), { scoreA, scoreB });
}

// Bloquear a chave também encerra a transmissão: o worker derruba o OBS em segundos
// (senão o OBS reconectaria sozinho).
export function setKeyActive(id, active) {
  return updateDoc(doc(db, "streams", id), { keyActive: active });
}

export async function rotateKey(id) {
  const batch = writeBatch(db);
  batch.set(doc(db, "streamKeys", id), { streamKey: generateStreamKey(), updatedAt: serverTimestamp() });
  await batch.commit();
}

export async function deleteStream(id) {
  const batch = writeBatch(db);
  batch.delete(doc(db, "streams", id));
  batch.delete(doc(db, "streamKeys", id));
  await batch.commit();
}
