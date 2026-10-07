// Formatação compartilhada (datas do Firestore, durações, tamanhos).

export function toDate(ts) {
  if (!ts) return null;
  if (typeof ts.toDate === "function") return ts.toDate();
  const d = ts instanceof Date ? ts : new Date(ts);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function formatDate(ts) {
  const d = toDate(ts);
  return d ? d.toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric" }) : "";
}

export function formatDateTime(ts) {
  const d = toDate(ts);
  if (!d) return "";
  const dia = d.toLocaleDateString("pt-BR", { weekday: "short", day: "2-digit", month: "short" });
  return `${dia} · ${d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}`;
}

export function formatTime(ts) {
  const d = toDate(ts);
  return d ? d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }) : "";
}

export function formatRelative(ts) {
  const d = toDate(ts);
  if (!d) return "";
  const s = (Date.now() - d.getTime()) / 1000;
  if (s < 0) return formatDateTime(ts);
  if (s < 60) return "agora mesmo";
  if (s < 3600) return `há ${Math.floor(s / 60)} min`;
  if (s < 86400) return `há ${Math.floor(s / 3600)} h`;
  if (s < 7 * 86400) return `há ${Math.floor(s / 86400)} dia${s >= 2 * 86400 ? "s" : ""}`;
  return formatDate(ts);
}

// Recebe segundos e devolve "H:MM:SS" ou "M:SS". Retorna null se inválido.
export function formatDuration(seconds) {
  const s = Number(seconds);
  if (!Number.isFinite(s) || s <= 0) return null;
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = Math.floor(s % 60);
  const pad = (n) => String(n).padStart(2, "0");
  return h > 0 ? `${h}:${pad(m)}:${pad(sec)}` : `${m}:${pad(sec)}`;
}

export function formatBytes(b) {
  if (!b) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.min(units.length - 1, Math.floor(Math.log(b) / Math.log(1024)));
  return `${(b / 1024 ** i).toLocaleString("pt-BR", { maximumFractionDigits: i >= 3 ? 1 : 0 })} ${units[i]}`;
}

export function formatKbps(bps) {
  return bps ? `${Math.round(bps / 1000).toLocaleString("pt-BR")} kbps` : "–";
}

export function formatMbps(bps) {
  return bps ? `${(bps / 1e6).toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })} Mbps` : "–";
}

export function formatNumber(n) {
  return (n || 0).toLocaleString("pt-BR");
}

// Duração de uma gravação: campo do worker ou payload do Cloudinary (modelo anterior).
export function vodDuration(vod) {
  return formatDuration(vod?.durationSec ?? vod?.cloudinary?.duration ?? vod?.duration);
}

export function vodSubtitle(vod) {
  const parts = [];
  if (vod?.modality) parts.push(vod.modality);
  const d = formatDate(vod?.recordedAt);
  if (d) parts.push(d);
  return parts.join(" · ");
}

export function qualityLabel(height) {
  if (!height) return "";
  return height >= 2160 ? "4K" : `${height}p`;
}
