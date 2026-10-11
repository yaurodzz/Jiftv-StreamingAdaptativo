// Monta as URLs do servidor de mídia a partir do nome público (slug) da transmissão.
// O formato é o mesmo do nginx.conf: não alterar sem conferir o servidor.
//   HLS  -> {hlsBase}/{slug}.m3u8              (playlist mestre com todas as qualidades)
//   DASH -> {dashBase}/{slug}/manifest.mpd     (todas as qualidades num manifesto)
import { env } from "./env.js";
import { cldAvatar } from "./cloudinary.js";

const encodePath = (rel) => rel.split("/").map(encodeURIComponent).join("/");

export function liveUrl(slug, protocol = "hls") {
  return protocol === "dash"
    ? `${env.dashBase}/${encodeURIComponent(slug)}/manifest.mpd`
    : `${env.hlsBase}/${encodeURIComponent(slug)}.m3u8`;
}

// Miniatura ao vivo, atualizada pelo FFmpeg a cada 5 s. `v` força o navegador a buscar a nova.
export function liveThumb(slug, v = 0) {
  return `${env.mediaUrl}/thumbs/${encodeURIComponent(slug)}.jpg?v=${v}`;
}

// Arquivo do acervo local (gravacoes/videos/...). Gravações ocultas exigem o ID token do admin.
export function recordingUrl(rel, token) {
  const url = `${env.mediaUrl}/arquivos/${encodePath(rel)}`;
  return token ? `${url}?token=${encodeURIComponent(token)}` : url;
}

// Endereço de reprodução de uma gravação: Cloudinary quando enviada, senão o servidor local.
export function vodSource(vod, token) {
  if (vod?.playbackUrl) return vod.playbackUrl;
  if (vod?.localFile && vod?.localAvailable !== false) return recordingUrl(vod.localFile, vod.visible ? null : token);
  return null;
}

export function vodThumb(vod, token) {
  if (vod?.thumbnailUrl) return vod.thumbnailUrl;
  if (vod?.localThumb) return recordingUrl(vod.localThumb, vod.visible ? null : token);
  return null;
}

// Foto do atleta: Cloudinary (photoUrl, com recorte no rosto) ou a pasta local do servidor
// de mídia (photoPath), usada quando a foto vem do site institucional e o Cloudinary está desligado.
export function athletePhoto(athlete, size = 400) {
  if (athlete?.photoUrl) return cldAvatar(athlete.photoUrl, { size });
  if (athlete?.photoPath) return `${env.mediaUrl}/${athlete.photoPath}`;
  return null;
}

export function isPlayable(vod) {
  return Boolean(vod?.playbackUrl || (vod?.localFile && vod?.localAvailable !== false));
}

export const audienceUrl = () => `${env.apiUrl}/api/audiencia`;
export const timeUrl = () => `${env.mediaUrl}/time`;
