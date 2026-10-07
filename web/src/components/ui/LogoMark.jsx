// Marca do JIFTv: três quadrados Verde IF + um círculo (grade do IF).
// O círculo fica neutro sem transmissão e vermelho pulsante quando há partida ao vivo.
export default function LogoMark({ live = false, size = 22 }) {
  const s = size;
  const cell = (s - 2) / 2;
  return (
    <span aria-hidden className="relative inline-block" style={{ width: s, height: s }}>
      <span
        className="absolute left-0 top-0 rounded-[3px] bg-accent"
        style={{ width: cell, height: cell }}
      />
      <span
        className="absolute right-0 top-0 rounded-[3px] bg-accent"
        style={{ width: cell, height: cell }}
      />
      <span
        className="absolute bottom-0 left-0 rounded-[3px] bg-accent"
        style={{ width: cell, height: cell }}
      />
      <span
        className={
          "absolute bottom-0 right-0 rounded-full " +
          (live ? "bg-live animate-live-pulse" : "bg-muted/60")
        }
        style={{ width: cell, height: cell }}
      />
    </span>
  );
}
