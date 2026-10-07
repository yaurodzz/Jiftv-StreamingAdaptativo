import { Layers } from "lucide-react";
import { formatKbps } from "../../lib/format.js";

// Painel "Streaming adaptativo": mostra o que o player está fazendo agora
// (útil para demonstrar a troca de qualidade conforme a conexão).
export default function StreamStats({ stats }) {
  const rows = [
    ["Protocolo", stats?.protocol || "–"],
    ["Resolução atual", stats?.height ? `${stats.width}×${stats.height}` : "–"],
    ["Bitrate da qualidade", formatKbps(stats?.bitrate)],
    ["Banda estimada", formatKbps(stats?.bandwidth)],
    ["Buffer", stats?.buffer > 0 ? `${stats.buffer.toFixed(1).replace(".", ",")} s` : "–"],
    ["Modo", stats ? (stats.auto ? "Automático" : "Manual") : "–"],
  ];
  return (
    <section className="rounded-2xl border border-line bg-surface p-4">
      <h2 className="flex items-center gap-2 text-sm font-semibold">
        <Layers size={15} className="text-accent" /> Streaming adaptativo
      </h2>
      <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
        {rows.map(([k, v]) => (
          <div key={k} className="contents">
            <dt className="text-muted">{k}</dt>
            <dd className="text-right tabular-nums">{v}</dd>
          </div>
        ))}
      </dl>
      <p className="mt-3 text-xs text-muted">
        No modo automático o player troca de qualidade conforme a velocidade da sua conexão.
      </p>
    </section>
  );
}
