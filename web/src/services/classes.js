import { addDoc, collection, deleteDoc, doc, onSnapshot, orderBy, query, serverTimestamp } from "firebase/firestore";
import { db } from "../lib/firebase.js";

export function subscribeClasses(cb, onError) {
  return onSnapshot(
    query(collection(db, "classes"), orderBy("name")),
    (snap) => cb(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
    onError,
  );
}

export function createClass({ name, campus }) {
  return addDoc(collection(db, "classes"), {
    name: name.trim().slice(0, 60),
    campus: campus?.trim() ? campus.trim().slice(0, 80) : null,
    createdAt: serverTimestamp(),
  });
}

export function deleteClass(id) {
  return deleteDoc(doc(db, "classes", id));
}
