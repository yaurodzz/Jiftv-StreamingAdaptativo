import { useEffect, useMemo, useState } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { subscribeStreamBySlug } from "../services/streams.js";
import { readOverlay } from "../services/overlay.js";
import { useServerOffset } from "../lib/serverClock.js";
import { hasTeams, useRosterAthletes } from "../features/live/roster.js";
import ScoreBug from "../features/overlay/ScoreBug.jsx";
import LineupScreen from "../features/overlay/LineupScreen.jsx";
import { demoData } from "../features/overlay/demo.js";

// /overlay/:slug → gráficos da transmissão para o OBS (fonte "Navegador", 1920×1080).
// Fundo transparente, sem a casca do site. Tudo chega ao vivo pelo documento da transmissão
// (placar, cronômetro, escalação no ar), então quem controla é o painel, de qualquer rede.
// O desenho é feito num palco fixo de 1920×1080 e encolhido para caber em fontes menores.

const STAGE = { width: 1920, height: 1080 };

const styles = `
  .ovl-bug { opacity: 0; transform: translateX(-40px); transition: opacity .45s ease, transform .45s cubic-bezier(.2,.8,.2,1); }
  .ovl-bug-on { opacity: 1; transform: none; }
  .ovl-pop { display: inline-block; animation: ovl-pop .5s cubic-bezier(.2,1.4,.4,1); }
  @keyframes ovl-pop { from { transform: scale(1.7); opacity: 0; } to { transform: scale(1); opacity: 1; } }
  .ovl-lineup { opacity: 0; transition: opacity .5s ease; }
  .ovl-lineup-on { opacity: 1; }
  .ovl-card { animation: ovl-card .5s cubic-bezier(.2,.8,.2,1) both; }
  @keyframes ovl-card { from { opacity: 0; transform: translateY(36px); } to { opacity: 1; transform: none; } }
`;

function useStageScale() {
  const measure = () => Math.min(window.innerWidth / STAGE.width, window.innerHeight / STAGE.height);
  const [scale, setScale] = useState(measure);
  useEffect(() => {
    const onResize = () => setScale(measure());
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);
  return scale;
}

export default function Overlay() {
  const { slug } = useParams();
  const [params] = useSearchParams();
  const demoKind = params.get("demo");
  const demo = useMemo(() => (demoKind ? demoData(demoKind) : null), [demoKind]);
  const [live, setLive] = useState(null);
  const scale = useStageScale();
  const offset = useServerOffset();

  useEffect(() => {
    if (demo) return undefined;
    return subscribeStreamBySlug(slug, setLive, () => setLive(null));
  }, [slug, demo]);

  // A página do site pinta o fundo; aqui ele precisa ser transparente para o vídeo aparecer.
  useEffect(() => {
    const targets = [document.documentElement, document.body];
    const previous = targets.map((el) => el.style.background);
    targets.forEach((el) => { el.style.background = "transparent"; });
    document.title = "Gráficos da transmissão · JIFTv";
    return () => targets.forEach((el, i) => { el.style.background = previous[i]; });
  }, []);

  const stream = demo ? demo.stream : live;
  const fetched = useRosterAthletes(demo ? null : stream?.roster);
  const athletesById = demo ? demo.athletesById : fetched;
  const overlay = readOverlay(stream);

  return (
    <div className={"fixed inset-0 overflow-hidden " + (params.get("fundo") ? "bg-[repeating-conic-gradient(#64748b_0_25%,#94a3b8_0_50%)] bg-[length:80px_80px]" : "")}>
      <style>{styles}</style>
      {stream && (
        <div
          className="absolute left-1/2 top-1/2 font-sans"
          style={{ width: STAGE.width, height: STAGE.height, transform: `translate(-50%, -50%) scale(${scale})` }}
        >
          <ScoreBug stream={stream} overlay={overlay} offset={demo ? 0 : offset} visible={overlay.scoreboard && hasTeams(stream) && !overlay.lineup} />
          <LineupScreen stream={stream} athletesById={athletesById} mode={overlay.lineup} />
        </div>
      )}
    </div>
  );
}
