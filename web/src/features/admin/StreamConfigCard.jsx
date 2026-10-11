import { useEffect, useState } from "react";
import { env } from "../../lib/env.js";
import { rotateKey, setKeyActive, subscribeStreamKey } from "../../services/streams.js";
import { useToast } from "./ToastProvider.jsx";
import ConfirmDialog from "./ConfirmDialog.jsx";
import { useClipboard } from "./useClipboard.js";

// Configuração do OBS de uma transmissão:
// - URL RTMP (fixa, vem do .env): o "servidor" que o OBS/Larix precisa
// - Stream Key (mascarada; copiar / mostrar / gerar nova). Fica em `streamKeys`, só o admin lê.
// - Chave ativa/bloqueada: bloquear derruba o OBS (o worker age em segundos)
export default function StreamConfigCard({ stream }) {
  const toast = useToast();
  const [streamKey, setStreamKey] = useState(null);
  const [revealed, setRevealed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [confirmRotate, setConfirmRotate] = useState(false);

  const rtmp = useClipboard();
  const keyClip = useClipboard();

  useEffect(() => subscribeStreamKey(stream.id, setStreamKey), [stream.id]);

  const rotate = async () => {
    setConfirmRotate(false);
    setBusy(true);
    try {
      await rotateKey(stream.id);
      toast.success("Nova chave gerada. Atualize o OBS.");
      setRevealed(true);
    } catch (err) {
      toast.error(err.message || "Não foi possível gerar nova chave.");
    } finally {
      setBusy(false);
    }
  };

  const toggleKey = async () => {
    setBusy(true);
    try {
      await setKeyActive(stream.id, stream.keyActive === false);
      toast.success(stream.keyActive === false ? "Chave liberada: o OBS já pode transmitir" : "Chave bloqueada");
    } catch (err) {
      toast.error(err.message || "Não foi possível alterar a chave.");
    } finally {
      setBusy(false);
    }
  };

  const active = stream.keyActive !== false;
  const masked = streamKey ? (revealed ? streamKey : "•".repeat(streamKey.length)) : "…";

  return (
    <section className="rounded-2xl border border-accent/30 bg-surface p-5">
      <h2 className="text-base font-semibold">Configurar o OBS</h2>
      <ol className="mt-3 list-decimal space-y-3 pl-5 text-sm text-muted">
        <li>
          No OBS, abra <b className="text-fg">Configurações → Transmissão</b> e escolha o serviço <b className="text-fg">Personalizado</b>.
        </li>
        <li>
          <span className="text-fg">Servidor</span>
          <div className="mt-1 flex gap-2">
            <input readOnly value={env.rtmpUrl} className="input font-mono text-xs" aria-label="Servidor RTMP" onFocus={(e) => e.target.select()} />
            <button type="button" onClick={() => rtmp.copy(env.rtmpUrl).then((ok) => ok && toast.info("Servidor copiado"))} className="btn-ghost btn-sm shrink-0">
              {rtmp.copied ? "Copiado" : "Copiar"}
            </button>
          </div>
        </li>
        <li>
          <span className="text-fg">Chave de transmissão</span>
          <div className="mt-1 flex gap-2">
            <input readOnly value={masked} className="input font-mono text-xs" aria-label="Chave da transmissão" onFocus={(e) => revealed && e.target.select()} />
            <button type="button" onClick={() => setRevealed((v) => !v)} className="btn-ghost btn-sm shrink-0" aria-pressed={revealed}>
              {revealed ? "Ocultar" : "Mostrar"}
            </button>
            <button type="button" disabled={!streamKey} onClick={() => keyClip.copy(streamKey).then((ok) => ok && toast.info("Chave copiada"))} className="btn-ghost btn-sm shrink-0">
              {keyClip.copied ? "Copiado" : "Copiar"}
            </button>
          </div>
          <p className="mt-1 text-xs">Nunca compartilhe a chave: quem tiver ela consegue transmitir.</p>
        </li>
        <li>
          Em <b className="text-fg">Saída</b>: intervalo de quadro-chave de <b className="text-fg">2 s</b>, controle de taxa <b className="text-fg">CBR</b> e áudio <b className="text-fg">AAC</b>.
        </li>
      </ol>

      <details className="mt-4 rounded-xl border border-line bg-elevated/40 p-3 text-sm">
        <summary className="cursor-pointer font-medium text-fg">Larix Broadcaster (celular)</summary>
        <p className="mt-2 text-muted">
          Conexões → Nova → URL: <code className="break-all font-mono text-xs">{env.rtmpUrl}/{revealed && streamKey ? streamKey : "<chave>"}</code>
        </p>
      </details>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4">
        <label className="inline-flex cursor-pointer items-center gap-3 text-sm">
          <button
            type="button"
            role="switch"
            aria-checked={active}
            disabled={busy}
            onClick={toggleKey}
            className={"relative h-6 w-11 rounded-full transition-colors disabled:opacity-50 before:absolute before:-inset-2.5 md:before:hidden " + (active ? "bg-accent" : "bg-elevated border border-line")}
          >
            <span className={"absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform " + (active ? "translate-x-5" : "translate-x-0.5")} />
          </button>
          <span>{active ? "Chave ativa" : "Chave bloqueada"}</span>
        </label>
        <button type="button" onClick={() => setConfirmRotate(true)} disabled={busy} className="tap text-sm text-accent hover:underline disabled:opacity-50">
          Gerar nova chave
        </button>
      </div>

      <ConfirmDialog
        open={confirmRotate}
        title="Gerar nova chave?"
        description="A chave atual deixa de funcionar. Se o OBS estiver no ar, ele continua até desconectar, mas para voltar vai precisar da chave nova."
        confirmLabel="Gerar nova chave"
        tone="primary"
        onConfirm={rotate}
        onCancel={() => setConfirmRotate(false)}
      />
    </section>
  );
}
