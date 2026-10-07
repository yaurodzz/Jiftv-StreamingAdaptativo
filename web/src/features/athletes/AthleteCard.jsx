import { useState } from "react";
import { Link } from "react-router-dom";
import { cldAvatar } from "../../lib/cloudinary.js";
import { computeAge, classLine } from "./format.js";

// Card "figurinha" do atleta. Retrato de topo, badge de número flutuando,
// modalidade em maiúsculas no cabeçalho, nome/posição/turma abaixo.
// Foto pedida como 400×400 (quadrado com foco no rosto).

export default function AthleteCard({ athlete }) {
  const age = computeAge(athlete.birthDate);
  const cls = classLine(athlete);
  const [broken, setBroken] = useState(false);

  return (
    <Link
      to={`/atletas/${athlete.id}`}
      className="group relative flex flex-col overflow-hidden rounded-2xl border border-line bg-surface transition-colors hover:border-accent/60 focus-visible:border-accent"
    >
      <div className="relative aspect-[4/5] overflow-hidden bg-elevated">
        {athlete.photoUrl && !broken ? (
          <img
            src={cldAvatar(athlete.photoUrl, { size: 500 })}
            alt=""
            loading="lazy"
            decoding="async"
            width={500}
            height={500}
            onError={() => setBroken(true)}
            className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.03]"
          />
        ) : (
          <div className="grid h-full w-full place-items-center text-4xl font-bold text-muted">
            {(athlete.name || "?").charAt(0)}
          </div>
        )}

        {/* Gradiente inferior para leitura do texto sobreposto. */}
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-2/5 bg-gradient-to-t from-black/85 via-black/40 to-transparent" />

        {/* Modalidade no topo. */}
        <div className="absolute inset-x-3 top-3 flex items-start justify-between">
          <span className="rounded-md bg-black/50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-white backdrop-blur-sm">
            {athlete.modalityCode || athlete.modalityName}
          </span>
          {athlete.jerseyNumber != null && (
            <span className="grid h-9 min-w-9 place-items-center rounded-full bg-accent px-1.5 text-sm font-bold text-white shadow-md">
              {athlete.jerseyNumber}
            </span>
          )}
        </div>

        {/* Nome/posição por cima da foto. */}
        <div className="absolute inset-x-3 bottom-3 text-white">
          <p className="line-clamp-2 text-base font-semibold leading-tight drop-shadow">
            {athlete.name}
          </p>
          {athlete.position && (
            <p className="mt-0.5 text-xs text-white/80">{athlete.position}</p>
          )}
        </div>
      </div>

      <div className="flex items-baseline justify-between gap-2 px-3 py-2.5 text-xs">
        <span className="truncate text-muted">{cls || athlete.modalityName}</span>
        {age != null && <span className="tabular-nums text-fg">{age} anos</span>}
      </div>
    </Link>
  );
}
