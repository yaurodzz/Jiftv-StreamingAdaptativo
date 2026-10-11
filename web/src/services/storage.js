// Painel > Armazenamento: onde as gravações ficam (pasta local, Google Drive, Cloudinary).
// Diferente do resto do painel, aqui a conversa é direta com o worker (api.jiftv.org), porque
// envolve o disco do servidor e a autorização do Google. O worker confere o ID token de admin.

import { auth } from "../lib/firebase.js";
import { env } from "../lib/env.js";

async function call(path, { method = "GET", body } = {}) {
  const token = await auth.currentUser?.getIdToken();
  let res;
  try {
    res = await fetch(`${env.apiUrl}/api${path}`, {
      method,
      headers: { Authorization: `Bearer ${token}`, ...(body ? { "Content-Type": "application/json" } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new Error("Não foi possível falar com o servidor de mídia. Confira se ele está ligado e conectado à internet.");
  }
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    throw new Error(typeof data?.detail === "string" ? data.detail : `Erro ${res.status} no servidor de mídia.`);
  }
  return data;
}

// { config: { local{enabled,path}, drive{enabled,folderName}, cloudinary{enabled} }, live, local{...}, drive{...}, cloudinary{...} }
export const getStorage = () => call("/armazenamento");
export const saveStorage = (config) => call("/armazenamento", { method: "PUT", body: config });

// Pastas do computador do servidor (dentro de PASTAS_DO_PC): { caminho, pai, pastas[], noPc }
export const listFolders = (caminho = "") => call(`/armazenamento/pastas?caminho=${encodeURIComponent(caminho)}`);
export const createFolder = (caminho, nome) => call("/armazenamento/pastas", { method: "POST", body: { caminho, nome } });

// Devolve { url }: o endereço do Google onde a conta dona do Drive autoriza o JIFTv.
export const connectDrive = (voltar) => call("/drive/conectar", { method: "POST", body: { voltar } });
export const disconnectDrive = () => call("/drive/desconectar", { method: "POST" });
