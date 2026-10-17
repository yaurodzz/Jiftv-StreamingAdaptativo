import { clockMs, clockVisible, formatClock } from "../../services/overlay.js";
import { useNow } from "../../lib/serverClock.js";

// Placar do canto do vídeo, no estilo das transmissões esportivas:
//   JIFTv | EQUIPE A  2 | 1  EQUIPE B | 12:34 1º tempo
// As cores são fixas (não seguem o tema do site): o fundo é o vídeo do jogo.
export default function ScoreBug({ stream, overlay, offset, visible }) {
  const running = overlay.clock.running;
  const now = useNow(offset, running && visible);
  const showClock = clockVisible(overlay.clock);

  return (
    <div
      className={"ovl-bug absolute left-16 top-14 flex h-[72px] items-stretch overflow-hidden rounded-xl shadow-[0_12px_40px_rgba(0,0,0,0.45)] " + (visible ? "ovl-bug-on" : "")}
      aria-hidden={!visible}
    >
      <div className="grid place-items-center bg-[#2F9E41] px-5 text-[26px] font-extrabold tracking-tight text-white">JIFTv</div>
      <Team name={stream.teamA || "Equipe A"} />
      <Score value={stream.scoreA ?? 0} />
      <div className="w-[3px] bg-[#0B1220]" />
      <Score value={stream.scoreB ?? 0} />
      <Team name={stream.teamB || "Equipe B"} />
      {(showClock || overlay.period) && (
        <div className="flex min-w-[124px] flex-col items-center justify-center bg-[#16233D] px-5 leading-none text-white">
          {showClock && <span className="text-[32px] font-bold tabular-nums">{formatClock(clockMs(overlay.clock, now))}</span>}
          {overlay.period && (
            <span className={"whitespace-nowrap font-semibold uppercase tracking-wider text-[#7FE08F] " + (showClock ? "mt-1 text-[15px]" : "text-[22px]")}>
              {overlay.period}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

function Team({ name }) {
  return (
    <div className="flex max-w-[340px] items-center bg-[#0B1220]/95 px-6 text-white">
      <span className="truncate text-[30px] font-bold uppercase tracking-tight">{name}</span>
    </div>
  );
}

// A `key` reinicia a animação a cada ponto marcado.
function Score({ value }) {
  return (
    <div className="grid w-[84px] place-items-center bg-white text-[#0B1220]">
      <span key={value} className="ovl-pop text-[46px] font-extrabold tabular-nums leading-none">{value}</span>
    </div>
  );
}
