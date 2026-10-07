// Upload direto do browser para o Cloudinary, usando um preset UNSIGNED.
// O browser nunca vê a API secret — o preset é o "contrato" que permite envios
// anônimos restritos a uma pasta/formato/tamanho.
//
// Erros retornados como Error com mensagem legível para exibir ao usuário.

import { env } from "./env.js";

const MAX_BYTES = 2 * 1024 * 1024; // 2 MB (bate com o limite do preset)
const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

export function validatePhotoFile(file) {
  if (!file) return "Selecione uma foto.";
  if (!ALLOWED_TYPES.has(file.type)) return "Formato aceito: JPG, PNG ou WebP.";
  if (file.size > MAX_BYTES) return "A foto precisa ter no máximo 2 MB.";
  return null;
}

export async function uploadAthletePhoto(file, { onProgress } = {}) {
  const { cloudName, uploadPreset } = env.cloudinary;
  if (!cloudName || !uploadPreset) {
    throw new Error("Cloudinary não configurado. Avise a coordenação.");
  }
  const err = validatePhotoFile(file);
  if (err) throw new Error(err);

  const form = new FormData();
  form.append("file", file);
  form.append("upload_preset", uploadPreset);

  // XHR permite acompanhar progresso (fetch ainda não expõe upload progress no browser).
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", `https://api.cloudinary.com/v1_1/${cloudName}/image/upload`);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && onProgress) onProgress(e.loaded / e.total);
    };
    xhr.onerror = () => reject(new Error("Falha de rede ao enviar a foto."));
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          const data = JSON.parse(xhr.responseText);
          if (!data.secure_url) return reject(new Error("Resposta inválida do Cloudinary."));
          resolve(data.secure_url);
        } catch {
          reject(new Error("Não foi possível ler a resposta do Cloudinary."));
        }
      } else {
        let msg = `Erro ${xhr.status} ao enviar a foto.`;
        try { msg = JSON.parse(xhr.responseText)?.error?.message || msg; } catch {}
        reject(new Error(msg));
      }
    };
    xhr.send(form);
  });
}
