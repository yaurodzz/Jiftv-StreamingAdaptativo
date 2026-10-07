import {
  addDoc, collection, deleteDoc, doc, getDocs, limit, onSnapshot, orderBy, query,
  serverTimestamp, updateDoc, where,
} from "firebase/firestore";
import { db } from "../lib/firebase.js";

export function subscribeModalities(cb, onError) {
  return onSnapshot(
    query(collection(db, "modalities"), orderBy("name")),
    (snap) => cb(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
    onError,
  );
}

// O código de 3 letras compõe o ID das gravações (AAAAMMDD-COD-HHMMSS): precisa ser único.
export async function createModality({ name, code }) {
  const upper = code.toUpperCase();
  const dup = await getDocs(query(collection(db, "modalities"), where("code", "==", upper), limit(1)));
  if (!dup.empty) throw new Error(`O código ${upper} já está em uso.`);
  await addDoc(collection(db, "modalities"), { name: name.trim(), code: upper, createdAt: serverTimestamp() });
}

export function deleteModality(id) {
  return deleteDoc(doc(db, "modalities", id));
}

// Busca única por código de 3 letras (usada no scout para carregar scoutTypes).
// Retorna null se não achar — não jogamos exceção pra facilitar a UI.
export async function getModalityByCode(code) {
  if (!code) return null;
  const snap = await getDocs(query(collection(db, "modalities"), where("code", "==", code), limit(1)));
  if (snap.empty) return null;
  const d = snap.docs[0];
  return { id: d.id, ...d.data() };
}

// Tipos de evento do scout de cada modalidade: [{ code, label, weight }].
// Assim cada esporte tem seu vocabulário próprio sem redeploy.
const SCOUT_CODE = /^[a-z][a-z0-9_]{1,23}$/;
export function updateScoutTypes(id, scoutTypes) {
  const clean = scoutTypes.slice(0, 30).map((t) => {
    if (!SCOUT_CODE.test(t.code)) throw new Error(`Código inválido: ${t.code}`);
    return { code: t.code, label: t.label.trim().slice(0, 40), weight: Number(t.weight) || 1 };
  });
  return updateDoc(doc(db, "modalities", id), { scoutTypes: clean });
}
