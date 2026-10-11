// Chamadas públicas ao worker do servidor de mídia (sem login).
// O cadastro de atleta passa pelo worker para ter validação no servidor, limite de
// envios por IP e status "pending" garantido (o Firestore não aceita escrita do visitante).

import { env } from "../lib/env.js";

export async function submitAthlete(payload) {
  let res;
  try {
    res = await fetch(`${env.apiUrl}/api/atletas`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
  } catch {
    throw new Error("Não foi possível falar com o servidor do JIFTv. Confira a internet ou tente de novo mais tarde.");
  }
  const text = await res.text();
  const data = text ? safeJson(text) : null;
  if (!res.ok) {
    const msg = typeof data?.detail === "string" ? data.detail
      : res.status >= 500 ? "O servidor do JIFTv está fora do ar no momento. Tente de novo mais tarde."
        : `Erro ${res.status} ao enviar o cadastro.`;
    throw new Error(msg);
  }
  return data; // { id, status: "pending" }
}

// Como a foto é obtida: "institucional" (pela matrícula, na API do site da instituição) ou
// "upload" (a pessoa envia a foto ao Cloudinary). Quem decide é o worker (ATLETAS_PHOTO_SOURCE).
// Retorna null se o servidor de mídia estiver fora do ar.
export async function getAthleteConfig() {
  try {
    const res = await fetch(`${env.apiUrl}/api/atletas/config`);
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

function safeJson(text) {
  try { return JSON.parse(text); } catch { return null; }
}
