import {
  collection, doc, getDoc, increment, onSnapshot, orderBy, query, updateDoc, where,
} from "firebase/firestore";
import { db } from "../lib/firebase.js";
import { sendCommand } from "./commands.js";

// Acesso à coleção `vods` (gravações). ID determinístico AAAAMMDD-COD-HHMMSS.
// Campos: title, description, modality, modalityCode, recordedAt, durationSec, width, height,
// bytes, localFile, localThumb, localAvailable, visible, views, playbackUrl, thumbnailUrl,
// cloudinary { status, error, ... }, drive { status, fileId, progress, error, ... },
// localRemovedAt (cópia local apagada de propósito: pasta local desligada), sourceStreamId, streamSlug.
//
// As regras só liberam ao público gravações com visible == true, então a consulta
// pública PRECISA filtrar por visible (índice composto em firestore.indexes.json).

const list = (snap) => snap.docs.map((d) => ({ id: d.id, ...d.data() }));

export function subscribeVods(cb, onError) {
  const q = query(collection(db, "vods"), where("visible", "==", true), orderBy("recordedAt", "desc"));
  return onSnapshot(q, (snap) => cb(list(snap)), onError);
}

export function subscribeAllVods(cb, onError) {
  const q = query(collection(db, "vods"), orderBy("recordedAt", "desc"));
  return onSnapshot(q, (snap) => cb(list(snap)), onError);
}

export async function getVod(id) {
  const snap = await getDoc(doc(db, "vods", id));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

export function addView(id) {
  return updateDoc(doc(db, "vods", id), { views: increment(1) });
}

export function updateVod(id, { title, description, modality, visible }) {
  return updateDoc(doc(db, "vods", id), {
    title: title.trim(),
    description: (description || "").trim(),
    modality: modality || null,
    visible: Boolean(visible),
  });
}

export function setVodVisible(id, visible) {
  return updateDoc(doc(db, "vods", id), { visible });
}

// O worker do servidor de mídia percebe a mudança e envia na hora.
export function retryUpload(id) {
  return updateDoc(doc(db, "vods", id), {
    "cloudinary.status": "pending",
    "cloudinary.error": null,
    "cloudinary.attempts": 0,
    "cloudinary.nextAttemptAt": null,
  });
}

// Mesma ideia para a fila do Google Drive.
export function retryDrive(id) {
  return updateDoc(doc(db, "vods", id), {
    "drive.status": "pending",
    "drive.error": null,
    "drive.attempts": 0,
    "drive.nextAttemptAt": null,
  });
}

// Apagar o arquivo exige o servidor local: vira um pedido para o worker.
// No Drive, "excluir" manda para a lixeira do Drive (recuperável por 30 dias).
export function deleteVod(id, { cloudinary = false, drive = false } = {}) {
  return sendCommand("delete_vod", { vodId: id, cloudinary, drive }, { timeoutMs: 120000 });
}
