import { useCallback, useEffect, useRef, useState } from "react";
import { Clapperboard, Layers, Play, Plug, Square, Unplug } from "lucide-react";
import { env } from "../../lib/env.js";
import { connectObs, isLocalHost } from "../../lib/obsWebsocket.js";
import { subscribeStreamKey } from "../../services/streams.js";
import { overlayUrl } from "./BroadcastGraphicsCard.jsx";
import ConfirmDialog from "./ConfirmDialog.jsx";
import { useToast } from "./ToastProvider.jsx";

const ADDRESS_KEY = "jiftv-obs-endereco";
const PASSWORD_KEY = "jiftv-obs-senha"; // só na sessão do navegador (some ao fechar a aba)
const SOURCE_NAME = "JIFTv Gráficos";
// Mesmo CSS padrão da fonte "Navegador" do OBS: fundo transparente.
const SOURCE_CSS = "body { background-color: rgba(0, 0, 0, 0); margin: 0px auto; overflow: hidden; }";
const ALREADY_EXISTS = 601;

function stored(storage, key, fallback = "") {
  try { return window[storage].getItem(key) || fallback; } catch { return fallback; }
}
function store(storage, key, value) {
  try { window[storage].setItem(key, value); } catch { /* navegação privada */ }
}

// Controle remoto do OBS pelo obs-websocket (OBS 28+): trocar de cena, iniciar e parar a
// transmissão, e colocar a fonte dos gráficos na cena com um clique. A conexão sai do
// navegador direto para o OBS; por isso o painel precisa estar aberto no computador do OBS
// (veja docs/overlay-obs.md). Os gráficos em si não dependem desta conexão.
export default function ObsControlCard({ stream }) {
  const toast = useToast();
  const client = useRef(null);
  const [address, setAddress] = useState(() => stored("localStorage", ADDRESS_KEY, "localhost:4455"));
  const [password, setPassword] = useState(() => stored("sessionStorage", PASSWORD_KEY));
  const [status, setStatus] = useState("off"); // off | connecting | on
  const [error, setError] = useState("");
  const [obs, setObs] = useState({ version: "", scenes: [], scene: "", streaming: false, serviceKey: null });
  const [streamKey, setStreamKey] = useState(null);
  const [busy, setBusy] = useState(false);
  const [confirmStop, setConfirmStop] = useState(false);

  useEffect(() => subscribeStreamKey(stream.id, setStreamKey), [stream.id]);
  useEffect(() => () => client.current?.close(), []);

  const refresh = useCallback(async () => {
    const obsClient = client.current;
    if (!obsClient) return;
    const [list, output, service] = await Promise.all([
      obsClient.call("GetSceneList"),
      obsClient.call("GetStreamStatus"),
      obsClient.call("GetStreamServiceSettings").catch(() => null),
    ]);
    setObs((current) => ({
      ...current,
      // O OBS devolve as cenas de baixo para cima; a lista do programa é de cima para baixo.
      scenes: (list.scenes || []).map((s) => s.sceneName).reverse(),
      scene: list.currentProgramSceneName || "",
      streaming: Boolean(output.outputActive),
      serviceKey: service?.streamServiceSettings?.key ?? null,
    }));
  }, []);

  const connect = async (event) => {
    event?.preventDefault();
    setError("");
    setStatus("connecting");
    try {
      const obsClient = await connectObs({
        address,
        password,
        onEvent: (type, data) => {
          if (type === "CurrentProgramSceneChanged") setObs((o) => ({ ...o, scene: data.sceneName }));
          else if (type === "StreamStateChanged") setObs((o) => ({ ...o, streaming: Boolean(data.outputActive) }));
          else if (type === "SceneListChanged") refresh().catch(() => {});
        },
        onClose: () => { client.current = null; setStatus("off"); setError("A conexão com o OBS caiu."); },
      });
      client.current = obsClient;
      store("localStorage", ADDRESS_KEY, address.trim());
      store("sessionStorage", PASSWORD_KEY, password);
      setObs((o) => ({ ...o, version: obsClient.version }));
      await refresh();
      setStatus("on");
    } catch (err) {
      client.current?.close();
      client.current = null;
      setStatus("off");
      setError(err.message);
    }
  };

  const disconnect = () => {
    const obsClient = client.current;
    client.current = null;
    obsClient?.close();
    setStatus("off");
  };

  const act = async (fn, ok) => {
    if (!client.current || busy) return;
    setBusy(true);
    try {
      await fn(client.current);
      if (ok) toast.success(ok);
      await refresh();
    } catch (err) {
      toast.error(err.message || "O OBS não aceitou o comando.");
    } finally {
      setBusy(false);
    }
  };

  // Cria (ou atualiza) a fonte "Navegador" dos gráficos e garante que ela está na cena atual.
  const addGraphics = (obsClient) => (async () => {
    const video = await obsClient.call("GetVideoSettings");
    const inputSettings = { url: overlayUrl(stream), width: video.baseWidth || 1920, height: video.baseHeight || 1080, css: SOURCE_CSS };
    try {
      await obsClient.call("CreateInput", { sceneName: obs.scene, inputName: SOURCE_NAME, inputKind: "browser_source", inputSettings, sceneItemEnabled: true });
    } catch (err) {
      if (err.code !== ALREADY_EXISTS) throw err;
      await obsClient.call("SetInputSettings", { inputName: SOURCE_NAME, inputSettings, overlay: true });
      const inScene = await obsClient.call("GetSceneItemId", { sceneName: obs.scene, sourceName: SOURCE_NAME }).then(() => true, () => false);
      if (!inScene) await obsClient.call("CreateSceneItem", { sceneName: obs.scene, sourceName: SOURCE_NAME });
    }
  })();

  const useThisObs = (obsClient) => obsClient.call("SetStreamServiceSettings", {
    streamServiceType: "rtmp_custom",
    streamServiceSettings: { server: env.rtmpUrl, key: streamKey },
  });

  const keyMatches = obs.serviceKey != null && streamKey != null ? obs.serviceKey === streamKey : null;
  const blockedByBrowser = window.location.protocol === "https:" && !isLocalHost(address);

  return (
    <section className="rounded-2xl border border-line bg-surface p-5">
      <div className="flex items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 font-semibold"><Clapperboard size={17} /> Controlar o OBS</h3>
        {status === "on" && (
          <button type="button" onClick={disconnect} className="tap inline-flex items-center gap-1 text-xs text-muted hover:text-fg"><Unplug size={13} /> Desconectar</button>
        )}
      </div>

      {status !== "on" ? (
        <form onSubmit={connect} className="mt-3 space-y-3">
          <p className="text-sm text-muted">
            Abra este painel no computador do OBS. No OBS: <b className="text-fg">Ferramentas → Configurações do servidor WebSocket</b>, marque
            “Ativar servidor WebSocket” e copie a senha em “Mostrar informações de conexão”.
          </p>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
            <label>
              <span className="label">Endereço do OBS</span>
              <input className="input font-mono text-xs" value={address} onChange={(e) => setAddress(e.target.value)} placeholder="localhost:4455" autoCapitalize="off" autoCorrect="off" spellCheck={false} />
            </label>
            <label>
              <span className="label">Senha do WebSocket</span>
              <input className="input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="off" placeholder="Vazio, se o OBS não pede senha" />
            </label>
          </div>
          {blockedByBrowser && (
            <p className="rounded-xl border border-warn/40 bg-warn/10 px-3 py-2 text-xs text-warn">
              O navegador só deixa este site falar com um OBS no próprio computador (localhost). Para um OBS em outra máquina, abra o painel nela.
            </p>
          )}
          {error && <p role="alert" className="text-sm text-live">{error}</p>}
          <button type="submit" disabled={status === "connecting"} className="btn-primary disabled:opacity-60">
            <Plug size={15} /> {status === "connecting" ? "Conectando…" : "Conectar ao OBS"}
          </button>
        </form>
      ) : (
        <div className="mt-3 space-y-4">
          <dl className="space-y-1.5 text-sm">
            <Row label="OBS" value={`Conectado${obs.version ? ` · WebSocket ${obs.version}` : ""}`} tone="text-accent" />
            <Row label="Transmissão do OBS" value={obs.streaming ? "No ar" : "Parada"} tone={obs.streaming ? "text-live" : ""} />
            <Row
              label="Destino configurado"
              value={keyMatches === null ? "Não foi possível conferir" : keyMatches ? "Esta transmissão" : "Outra chave"}
              tone={keyMatches === false ? "text-warn" : keyMatches ? "text-accent" : ""}
            />
          </dl>

          {keyMatches === false && (
            <div className="rounded-xl border border-warn/40 bg-warn/10 p-3 text-sm text-warn">
              <p>Este OBS está configurado com a chave de outra transmissão (ou de outro serviço).</p>
              {!obs.streaming && streamKey && (
                <button type="button" disabled={busy} onClick={() => act(useThisObs, "OBS configurado para esta transmissão")} className="btn-ghost btn-sm mt-2 text-fg">
                  Usar este OBS nesta transmissão
                </button>
              )}
            </div>
          )}

          <div>
            <p className="label">Cenas</p>
            <div className="flex flex-wrap gap-2">
              {obs.scenes.map((name) => (
                <button
                  key={name}
                  type="button"
                  disabled={busy}
                  aria-pressed={obs.scene === name}
                  onClick={() => act((c) => c.call("SetCurrentProgramScene", { sceneName: name }))}
                  className={(obs.scene === name ? "btn-primary" : "btn-ghost") + " btn-sm max-w-full"}
                >
                  <span className="truncate">{name}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="flex flex-wrap gap-2 border-t border-line pt-4">
            <button type="button" disabled={busy || !obs.scene} onClick={() => act(addGraphics, `Gráficos adicionados à cena “${obs.scene}”`)} className="btn-ghost btn-sm">
              <Layers size={14} /> Colocar os gráficos nesta cena
            </button>
            {obs.streaming ? (
              <button type="button" disabled={busy} onClick={() => setConfirmStop(true)} className="btn-danger btn-sm"><Square size={13} /> Parar transmissão</button>
            ) : (
              <button type="button" disabled={busy || keyMatches === false} onClick={() => act((c) => c.call("StartStream"), "O OBS começou a transmitir")} className="btn-ghost btn-sm">
                <Play size={14} /> Iniciar transmissão
              </button>
            )}
          </div>
        </div>
      )}

      <ConfirmDialog
        open={confirmStop}
        title="Parar a transmissão no OBS?"
        description="O OBS para de enviar o vídeo e a gravação é finalizada. Se voltar a transmitir, começa um arquivo novo."
        confirmLabel="Parar transmissão"
        onConfirm={() => { setConfirmStop(false); act((c) => c.call("StopStream"), "O OBS parou de transmitir"); }}
        onCancel={() => setConfirmStop(false)}
      />
    </section>
  );
}

function Row({ label, value, tone = "" }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-muted">{label}</dt>
      <dd className={"text-right " + tone}>{value}</dd>
    </div>
  );
}
