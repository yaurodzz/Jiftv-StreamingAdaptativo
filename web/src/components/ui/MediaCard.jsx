import { useState } from "react";
import { Link } from "react-router-dom";
import { Play } from "lucide-react";
import { cldThumb } from "../../lib/cloudinary.js";

// Card genérico (catálogo, ao vivo, agenda). Não conhece o schema do Firestore:
// recebe as props já normalizadas.
//
// Props:
//   to           destino do Link
//   title        principal (obrigatório)
//   subtitle     linha secundária (modalidade · data)
//   thumbnail    URL da imagem (Cloudinary ou servidor de mídia)
//   duration     string opcional exibida sobre a thumb (ex: "1:24:03")
//   badge        nó opcional no canto superior esquerdo (ex: selo "Ao vivo")
//   corner       nó opcional no canto superior direito (ex: espectadores, 1080p)
//   live         destaca a borda em vermelho
//   width        largura pedida ao Cloudinary (default 480)
export default function MediaCard({
  to, title, subtitle, thumbnail, duration, badge, corner, live = false, width = 480, children,
}) {
  const [broken, setBroken] = useState(false);

  return (
    <Link
      to={to}
      className={
        "group block overflow-hidden rounded-2xl border bg-surface transition-colors hover:shadow-glow focus-visible:border-accent " +
        (live ? "border-live/50 hover:border-live" : "border-line hover:border-accent/50")
      }
    >
      <div className="relative aspect-video overflow-hidden bg-black">
        {thumbnail && !broken ? (
          <img
            src={cldThumb(thumbnail, { width })}
            alt=""
            loading="lazy"
            decoding="async"
            width={width}
            height={Math.round((width * 9) / 16)}
            onError={() => setBroken(true)}
            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.02]"
          />
        ) : (
          <div className="grid h-full w-full place-items-center bg-elevated text-sm text-muted">Sem prévia</div>
        )}

        <div className="pointer-events-none absolute inset-0 grid place-items-center bg-black/0 transition-colors duration-200 group-hover:bg-black/35 group-focus-visible:bg-black/35">
          <span className="grid h-12 w-12 place-items-center rounded-full bg-accent/95 text-white opacity-0 transition-opacity duration-200 group-hover:opacity-100 group-focus-visible:opacity-100">
            <Play size={20} />
          </span>
        </div>

        {badge && <div className="absolute left-2 top-2">{badge}</div>}
        {corner && (
          <span className="absolute right-2 top-2 inline-flex items-center gap-1 rounded-md bg-black/70 px-1.5 py-0.5 text-[11px] font-medium text-white">
            {corner}
          </span>
        )}
        {duration && (
          <span className="absolute bottom-2 right-2 rounded-md bg-black/70 px-1.5 py-0.5 text-[11px] font-medium tabular-nums text-white">
            {duration}
          </span>
        )}
      </div>

      <div className="p-3">
        <h3 className="line-clamp-2 text-sm font-semibold leading-snug">{title}</h3>
        {subtitle && <p className="mt-1 text-xs text-muted">{subtitle}</p>}
        {children}
      </div>
    </Link>
  );
}

export function LiveBadge({ label = "Ao vivo" }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-md bg-live px-2 py-0.5 text-[11px] font-semibold text-white">
      <span className="h-1.5 w-1.5 rounded-full bg-white" />
      {label}
    </span>
  );
}
