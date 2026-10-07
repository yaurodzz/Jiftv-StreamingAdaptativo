import { Radio, Wifi, WifiOff, Loader2 } from "lucide-react";

const STATE = {
  connecting:    { icon: Loader2, label: "Conectando",    tone: "text-muted",   spin: true },
  live:          { icon: Radio,   label: "Ao vivo",        tone: "text-live" },
  reconnecting:  { icon: WifiOff, label: "Aguardando sinal", tone: "text-live" },
  nosignal:      { icon: WifiOff, label: "Sem sinal",      tone: "text-muted" },
};

// Overlay glass no canto superior esquerdo do player, com estado, resolução,
// modo (Automático/Manual) e latência quando disponível.
export default function StatusOverlay({ state, height, auto, latency, visible }) {
  const info = STATE[state] || STATE.connecting;
  const Icon = info.icon;

  return (
    <div
      aria-live="polite"
      className={
        "pointer-events-none absolute left-3 top-3 z-10 flex items-center gap-2 rounded-full " +
        "glass border px-3 py-1.5 text-xs text-fg transition-opacity duration-300 " +
        (visible ? "opacity-100" : "opacity-0")
      }
    >
      <span className={"inline-flex items-center gap-1.5 " + info.tone}>
        <Icon size={13} className={info.spin ? "animate-spin" : undefined} />
        <span className="font-medium">{info.label}</span>
      </span>

      {height ? (
        <>
          <span className="text-muted">·</span>
          <span className="font-medium">{height >= 2160 ? "4K" : `${height}p`}</span>
          <span className="text-muted">{auto ? "auto" : "manual"}</span>
        </>
      ) : null}

      {typeof latency === "number" ? (
        <>
          <span className="text-muted">·</span>
          <span className="inline-flex items-center gap-1 text-muted">
            <Wifi size={11} />
            {latency.toFixed(1)}s
          </span>
        </>
      ) : null}
    </div>
  );
}
