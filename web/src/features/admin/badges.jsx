import { AlertTriangle, Cloud, HardDrive, Loader2, Lock, Clock } from "lucide-react";
import { toDate } from "../../lib/format.js";

// Situação da transmissão: ao vivo (worker), bloqueada (painel), encerrada ou agendada.
export function streamStatus(s) {
  if (s.isLive) return "live";
  if (s.keyActive === false) return "blocked";
  const ended = toDate(s.endedAt);
  const scheduled = toDate(s.scheduledFor);
  if (ended && (!scheduled || scheduled < ended)) return "ended";
  return "scheduled";
}

const STREAM = {
  live:      { label: "Ao vivo",    cls: "bg-live/10 text-live" },
  scheduled: { label: "Agendada",   cls: "bg-accent/10 text-accent" },
  ended:     { label: "Encerrada",  cls: "border border-line text-muted" },
  blocked:   { label: "Bloqueada",  cls: "bg-warn/10 text-warn" },
};

export function StreamBadge({ stream }) {
  const st = streamStatus(stream);
  const info = STREAM[st];
  return (
    <span className={`badge ${info.cls}`}>
      {st === "live" && <span className="h-1.5 w-1.5 animate-live-pulse rounded-full bg-live" />}
      {st === "blocked" && <Lock size={11} />}
      {info.label}
    </span>
  );
}

const CLOUD = {
  uploaded:  { label: "No Cloudinary", cls: "bg-accent/10 text-accent", icon: Cloud },
  uploading: { label: "Enviando…",     cls: "bg-elevated text-fg",      icon: Loader2, spin: true },
  pending:   { label: "Na fila",       cls: "bg-elevated text-muted",   icon: Clock },
  failed:    { label: "Falhou",        cls: "bg-live/10 text-live",     icon: AlertTriangle },
  disabled:  { label: "Só local",      cls: "border border-line text-muted", icon: HardDrive },
};

const DRIVE = {
  uploaded:  { label: "No Drive",          cls: "bg-accent/10 text-accent", icon: Cloud },
  uploading: { label: "Enviando ao Drive", cls: "bg-elevated text-fg",      icon: Loader2, spin: true },
  pending:   { label: "Fila do Drive",     cls: "bg-elevated text-muted",   icon: Clock },
  failed:    { label: "Drive falhou",      cls: "bg-live/10 text-live",     icon: AlertTriangle },
};

// Situação no Google Drive. Sem selo quando o Drive está desligado para a gravação.
export function DriveBadge({ vod }) {
  const info = DRIVE[vod.drive?.status];
  if (!info) return null;
  const Icon = info.icon;
  const pct = vod.drive.status === "uploading" && vod.drive.progress ? ` ${vod.drive.progress}%` : "";
  return (
    <span className={`badge ${info.cls}`} title={vod.drive.error || undefined}>
      <Icon size={12} className={info.spin ? "animate-spin" : undefined} />
      {info.label}{pct}
    </span>
  );
}

export function CloudBadge({ vod }) {
  const status = vod.cloudinary?.status || (vod.playbackUrl ? "uploaded" : "disabled");
  const info = CLOUD[status] || CLOUD.pending;
  const Icon = info.icon;
  return (
    <span className={`badge ${info.cls}`} title={vod.cloudinary?.error || undefined}>
      <Icon size={12} className={info.spin ? "animate-spin" : undefined} />
      {info.label}
    </span>
  );
}
