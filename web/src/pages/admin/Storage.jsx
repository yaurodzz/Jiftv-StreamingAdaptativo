import { useCallback, useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { ChevronRight, Cloud, CornerLeftUp, Folder, FolderPlus, HardDrive, Loader2 } from "lucide-react";
import {
  connectDrive, createFolder, disconnectDrive, getStorage, listFolders, saveStorage,
} from "../../services/storage.js";
import { useToast } from "../../features/admin/ToastProvider.jsx";
import ConfirmDialog from "../../features/admin/ConfirmDialog.jsx";
import FormDialog from "../../features/admin/FormDialog.jsx";
import { formatBytes } from "../../lib/format.js";

// Painel > Armazenamento: liga e desliga cada destino das gravações e escolhe a pasta local.
// Quem aplica é o worker (PUT /api/armazenamento); esta tela só mostra o estado e pede.

export default function StoragePage() {
  const toast = useToast();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState(null); // "local-off" | "disconnect"
  const [picking, setPicking] = useState(false);
  const [folderName, setFolderName] = useState("");

  useEffect(() => { document.title = "Armazenamento · Painel JIFTv"; }, []);

  const load = useCallback(async () => {
    try {
      setData(await getStorage());
      setError("");
    } catch (err) {
      setError(err.message);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // Com envio ou mudança de pasta em andamento, atualiza mais vezes.
  const working = Boolean(
    data?.local?.moving?.ativo || data?.drive?.queue?.uploading || data?.drive?.queue?.pending
    || data?.cloudinary?.queue?.uploading || data?.cloudinary?.queue?.pending,
  );
  useEffect(() => {
    const t = setInterval(load, working ? 5000 : 30000);
    return () => clearInterval(t);
  }, [load, working]);

  // Volta do Google depois de autorizar: /admin/armazenamento?drive=ok (ou erro).
  useEffect(() => {
    const result = params.get("drive");
    if (!result) return;
    if (result === "ok") toast.success("Google Drive conectado. Ligue o destino para começar a enviar.");
    else toast.error(params.get("motivo") || "Não foi possível conectar o Google Drive.");
    navigate("/admin/armazenamento", { replace: true });
  }, [params, navigate, toast]);

  useEffect(() => { if (data) setFolderName(data.config.drive.folderName); }, [data?.config?.drive?.folderName]);

  const save = async (change, ok) => {
    const cfg = data.config;
    const next = {
      local: { ...cfg.local, ...change.local },
      drive: { ...cfg.drive, ...change.drive },
      cloudinary: { ...cfg.cloudinary, ...change.cloudinary },
    };
    setBusy(true);
    try {
      setData(await saveStorage(next));
      if (ok) toast.success(ok);
      return true;
    } catch (err) {
      toast.error(err.message);
      return false;
    } finally {
      setBusy(false);
    }
  };

  const connect = async () => {
    setBusy(true);
    try {
      const { url } = await connectDrive(`${window.location.origin}/admin/armazenamento`);
      window.location.assign(url);
    } catch (err) {
      toast.error(err.message);
      setBusy(false);
    }
  };

  const disconnect = async () => {
    setConfirm(null);
    setBusy(true);
    try {
      setData(await disconnectDrive());
      toast.success("Google Drive desconectado");
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  };

  if (!data) {
    return error ? (
      <div className="rounded-2xl border border-live/40 bg-live/10 px-4 py-6 text-sm text-live">
        <p>{error}</p>
        <button type="button" className="btn-ghost mt-3" onClick={load}>Tentar de novo</button>
      </div>
    ) : (
      <p role="status" className="text-sm text-muted">Carregando…</p>
    );
  }

  const { config, local, drive, cloudinary } = data;
  const clouds = [drive.active && "Google Drive", cloudinary.active && "Cloudinary"].filter(Boolean);
  const disk = local.disk;
  const diskPct = disk ? Math.round(((disk.total - disk.free) / disk.total) * 100) : null;
  const drivePct = drive.limit ? Math.round((drive.usage / drive.limit) * 100) : null;
  const moving = local.moving;

  return (
    <div className="space-y-6">
      <p className="rounded-2xl border border-line bg-surface px-4 py-3 text-sm text-muted">
        {config.local.enabled ? (
          <>Cada gravação nova fica <b className="text-fg">no computador</b>{clouds.length > 0 && <> e é enviada para <b className="text-fg">{clouds.join(" e ")}</b></>}.</>
        ) : (
          <>Cada gravação nova é enviada para <b className="text-fg">{clouds.join(" e ") || "…"}</b> e <b className="text-fg">apagada do computador</b> assim que o envio é confirmado.</>
        )}
      </p>
      {error && <p className="rounded-xl border border-warn/40 bg-warn/10 px-3 py-2 text-sm text-warn">{error}</p>}

      {/* ---------------- Pasta local ---------------- */}
      <section className="card p-5">
        <CardHeader
          icon={HardDrive} title="Pasta local (computador do servidor)"
          checked={config.local.enabled} disabled={busy} label="Guardar as gravações no computador"
          onChange={(on) => (on ? save({ local: { enabled: true } }, "Pasta local ligada") : setConfirm("local-off"))}
        />
        <p className="mt-1 text-sm text-muted">
          {config.local.enabled
            ? "As gravações ficam guardadas nesta pasta, mesmo depois de enviadas para a nuvem."
            : "Desligada: a pasta guarda o vídeo só até o envio para a nuvem ser confirmado. Depois ele é apagado do computador."}
        </p>

        <div className="mt-4">
          <span className="label">Pasta das gravações</span>
          <div className="flex flex-wrap items-center gap-2">
            <code className="min-w-0 flex-1 break-all rounded-lg bg-elevated px-3 py-2 font-mono text-xs">{local.folder}</code>
            <button type="button" className="btn-ghost" disabled={busy || data.live || moving.ativo} onClick={() => setPicking(true)}>
              <Folder size={15} /> Escolher pasta
            </button>
            {config.local.path !== null && (
              <button type="button" className="btn-ghost" disabled={busy || data.live || moving.ativo}
                      onClick={() => save({ local: { path: null } }, "Gravações de volta na pasta padrão")}>
                Usar a padrão
              </button>
            )}
          </div>
          {data.live && <p className="mt-2 text-xs text-warn">Há uma transmissão sendo gravada: a pasta só pode ser trocada quando ela terminar.</p>}
          {moving.ativo && (
            <p className="mt-2 flex items-center gap-2 text-xs text-muted" role="status">
              <Loader2 size={13} className="animate-spin" /> Levando os vídeos para a pasta nova: {moving.feitos} de {moving.total} arquivos.
            </p>
          )}
          {!moving.ativo && moving.erro && (
            <p className="mt-2 text-xs text-live">Nem tudo foi levado para a pasta nova ({moving.erro}). O que faltou continua na pasta anterior.</p>
          )}
        </div>

        <dl className="mt-4 space-y-1.5 text-sm">
          <Row k="Gravações no computador" v={`${local.count} · ${formatBytes(local.bytes)}`} />
          <Row k="Espaço livre no disco" v={disk ? `${formatBytes(disk.free)} de ${formatBytes(disk.total)}` : "–"} />
        </dl>
        {disk && <Bar pct={diskPct} />}
        <p className="mt-3 text-xs text-muted">
          O painel escolhe pastas dentro de <code className="font-mono">{local.root}</code>. Para liberar outro disco ou pasta,
          defina <code className="font-mono">PASTAS_DO_PC</code> no .env do servidor e rode <code className="font-mono">docker compose up -d</code>.
        </p>
      </section>

      {/* ---------------- Google Drive ---------------- */}
      <section className="card p-5">
        <CardHeader
          icon={Cloud} title="Google Drive"
          checked={config.drive.enabled} disabled={busy || !drive.connected} label="Enviar as gravações ao Google Drive"
          onChange={(on) => save({ drive: { enabled: on } }, on ? "Google Drive ligado: as gravações do computador entram na fila" : "Google Drive desligado")}
        />
        {!drive.configured ? (
          <p className="mt-2 text-sm text-muted">
            Falta o cliente OAuth do Google no .env do servidor (<code className="font-mono">GOOGLE_OAUTH_CLIENT_ID</code> e
            <code className="mx-1 font-mono">GOOGLE_OAUTH_CLIENT_SECRET</code>). O passo a passo está em
            <code className="mx-1 font-mono">docs/armazenamento.md</code>. URI de redirecionamento a cadastrar no Google:
            <code className="mt-1 block break-all rounded-lg bg-elevated px-2 py-1.5 font-mono text-xs">{drive.redirectUri}</code>
          </p>
        ) : !drive.connected ? (
          <div className="mt-2">
            <p className="text-sm text-muted">
              Autorize a conta do Google que vai guardar os vídeos. O JIFTv só enxerga os arquivos que ele mesmo criar nesse Drive.
            </p>
            {drive.error && <p className="mt-2 text-sm text-live">{drive.error}</p>}
            <button type="button" className="btn-primary mt-3 disabled:opacity-60" disabled={busy} onClick={connect}>Conectar Google Drive</button>
          </div>
        ) : (
          <>
            <p className="mt-1 text-sm text-muted">
              Os vídeos tocam no site pelo servidor de mídia, que busca o arquivo no Drive. Por isso só tocam com o servidor ligado.
            </p>
            <dl className="mt-4 space-y-1.5 text-sm">
              <Row k="Conta" v={drive.email || drive.name || "autorizada"} />
              <Row k="Espaço usado" v={drive.limit ? `${formatBytes(drive.usage)} de ${formatBytes(drive.limit)}` : formatBytes(drive.usage)} />
              <Row k="Fila" v={queueText(drive.queue)} />
            </dl>
            {drivePct !== null && <Bar pct={drivePct} />}
            {drive.error && <p className="mt-2 text-sm text-live">{drive.error}</p>}
            <form className="mt-4" onSubmit={(e) => { e.preventDefault(); save({ drive: { folderName } }, "Pasta do Drive alterada: os próximos vídeos vão para ela"); }}>
              <label className="label" htmlFor="drive-folder">Pasta no Drive (cada transmissão vira uma subpasta)</label>
              <div className="flex flex-wrap gap-2">
                <input id="drive-folder" className="input min-w-0 flex-1" value={folderName} maxLength={80} required onChange={(e) => setFolderName(e.target.value)} />
                <button type="submit" className="btn-ghost disabled:opacity-50" disabled={busy || folderName.trim() === config.drive.folderName || !folderName.trim()}>Salvar</button>
              </div>
            </form>
            <button type="button" className="btn-danger btn-sm mt-4" disabled={busy} onClick={() => setConfirm("disconnect")}>Desconectar conta</button>
          </>
        )}
      </section>

      {/* ---------------- Cloudinary ---------------- */}
      <section className="card p-5">
        <CardHeader
          icon={Cloud} title="Cloudinary"
          checked={config.cloudinary.enabled} disabled={busy} label="Enviar as gravações ao Cloudinary"
          onChange={(on) => save({ cloudinary: { enabled: on } }, on ? "Cloudinary ligado" : "Cloudinary desligado")}
        />
        {cloudinary.configured ? (
          <dl className="mt-3 space-y-1.5 text-sm">
            <Row k="Conta (cloud name)" v={cloudinary.cloudName} />
            <Row k="Fila" v={queueText(cloudinary.queue)} />
          </dl>
        ) : (
          <p className="mt-2 text-sm text-muted">
            Sem credenciais: nada é enviado, mesmo com a chave ligada. Para usar, preencha
            <code className="mx-1 font-mono">CLOUDINARY_URL</code> no .env do servidor e reinicie.
          </p>
        )}
        <p className="mt-3 text-xs text-muted">
          No plano gratuito, cada vídeo pode ter no máximo 100 MB. Vídeos maiores falham no envio e continuam onde estavam.
        </p>
      </section>

      <ConfirmDialog
        open={confirm === "local-off"}
        title="Desligar a pasta local?"
        description={
          <>
            <p>
              Cada gravação será <b>apagada do computador</b> assim que estiver confirmada em {clouds.join(" ou ") || "um destino na nuvem"}.
              Isso vale também para {local.count === 1 ? "a gravação que está" : `as ${local.count} gravações que estão`} na pasta agora ({formatBytes(local.bytes)}).
            </p>
            <p className="mt-2">Vídeos que ainda não chegaram à nuvem nunca são apagados.</p>
          </>
        }
        confirmLabel="Desligar e liberar o disco"
        onCancel={() => setConfirm(null)}
        onConfirm={async () => { setConfirm(null); await save({ local: { enabled: false } }, "Pasta local desligada"); }}
      />
      <ConfirmDialog
        open={confirm === "disconnect"}
        title="Desconectar o Google Drive?"
        description="Os vídeos continuam no Drive, mas deixam de tocar no site até uma conta ser conectada de novo. Novas gravações não serão enviadas."
        confirmLabel="Desconectar"
        onCancel={() => setConfirm(null)}
        onConfirm={disconnect}
      />
      <FolderDialog
        open={picking}
        start={config.local.path}
        onClose={() => setPicking(false)}
        onPick={async (path) => { if (await save({ local: { path } }, "Pasta local alterada. Os vídeos estão sendo levados para ela.")) setPicking(false); }}
      />
    </div>
  );
}

function queueText(queue = {}) {
  const parts = [
    queue.uploaded && `${queue.uploaded} enviada(s)`,
    queue.uploading && `${queue.uploading} enviando`,
    queue.pending && `${queue.pending} na fila`,
    queue.failed && `${queue.failed} com falha`,
  ].filter(Boolean);
  return parts.length ? parts.join(" · ") : "vazia";
}

function CardHeader({ icon: Icon, title, checked, disabled, label, onChange }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <h2 className="flex min-w-0 items-center gap-2 font-semibold"><Icon size={18} className="shrink-0 text-muted" /> {title}</h2>
      <Switch checked={checked} disabled={disabled} label={label} onChange={onChange} />
    </div>
  );
}

// Chave liga/desliga. No celular a área de toque tem 44px de altura sem mudar o desenho.
function Switch({ checked, disabled, label, onChange }) {
  return (
    <button
      type="button" role="switch" aria-checked={checked} aria-label={label} title={label} disabled={disabled}
      onClick={() => onChange(!checked)}
      className="inline-flex shrink-0 items-center gap-2 text-xs font-medium text-muted disabled:opacity-50 max-md:min-h-11"
    >
      <span aria-hidden="true">{checked ? "Ligado" : "Desligado"}</span>
      <span className={"relative h-6 w-11 rounded-full transition-colors " + (checked ? "bg-accent" : "bg-line")}>
        <span className={"absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform " + (checked ? "translate-x-5" : "")} />
      </span>
    </button>
  );
}

function Bar({ pct }) {
  return (
    <div className="mt-3 h-2 overflow-hidden rounded-full bg-elevated">
      <div className={"h-full rounded-full " + (pct > 90 ? "bg-live" : "bg-accent")} style={{ width: `${Math.min(100, pct)}%` }} />
    </div>
  );
}

function Row({ k, v }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-muted">{k}</dt>
      <dd className="min-w-0 break-words text-right">{v}</dd>
    </div>
  );
}

// Navegador de pastas do computador do servidor (só dentro de PASTAS_DO_PC).
function FolderDialog({ open, start, onClose, onPick }) {
  const [dir, setDir] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [newName, setNewName] = useState("");

  const go = useCallback(async (fn) => {
    setLoading(true);
    setError("");
    try {
      setDir(await fn());
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    setNewName("");
    // Começa na pasta atual; se ela não existir mais, cai na raiz liberada.
    go(() => listFolders(start || "").catch(() => listFolders("")));
  }, [open, start, go]);

  const create = () => {
    const nome = newName.trim();
    if (!nome || !dir) return;
    go(() => createFolder(dir.caminho, nome)).then(() => setNewName(""));
  };

  return (
    <FormDialog open={open} title="Escolher a pasta das gravações" submitLabel="Usar esta pasta" submitDisabled={!dir || loading}
                onClose={onClose} onSubmit={() => dir && onPick(dir.caminho)} wide>
      <div className="space-y-3">
        <div>
          <span className="label">Pasta selecionada</span>
          <code className="block break-all rounded-lg bg-elevated px-3 py-2 font-mono text-xs">{dir?.noPc || "…"}</code>
        </div>
        {error && <p className="rounded-xl border border-live/40 bg-live/10 px-3 py-2 text-sm text-live">{error}</p>}
        <ul className="max-h-64 divide-y divide-line overflow-y-auto rounded-xl border border-line" aria-busy={loading}>
          {dir?.pai !== null && dir && (
            <li>
              <button type="button" className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm text-muted hover:bg-elevated max-md:min-h-11"
                      onClick={() => go(() => listFolders(dir.pai))}>
                <CornerLeftUp size={15} /> Voltar um nível
              </button>
            </li>
          )}
          {dir?.pastas.map((nome) => (
            <li key={nome}>
              <button type="button" className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm hover:bg-elevated max-md:min-h-11"
                      onClick={() => go(() => listFolders(dir.caminho ? `${dir.caminho}/${nome}` : nome))}>
                <Folder size={15} className="shrink-0 text-muted" />
                <span className="min-w-0 flex-1 truncate">{nome}</span>
                <ChevronRight size={15} className="shrink-0 text-muted" />
              </button>
            </li>
          ))}
          {dir && dir.pastas.length === 0 && <li className="px-3 py-3 text-sm text-muted">Nenhuma pasta aqui dentro.</li>}
          {!dir && !error && <li className="px-3 py-3 text-sm text-muted">Carregando…</li>}
        </ul>
        <div>
          <label className="label" htmlFor="new-folder">Criar uma pasta aqui</label>
          <div className="flex gap-2">
            <input id="new-folder" className="input min-w-0 flex-1" value={newName} maxLength={80} placeholder="Nome da pasta"
                   onChange={(e) => setNewName(e.target.value)}
                   onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); create(); } }} />
            <button type="button" className="btn-ghost disabled:opacity-50" disabled={!newName.trim() || loading} onClick={create}>
              <FolderPlus size={15} /> Criar
            </button>
          </div>
        </div>
        <p className="text-xs text-muted">
          Os vídeos que já estão na pasta atual são levados para a pasta escolhida. As gravações novas passam a cair nela na hora.
        </p>
      </div>
    </FormDialog>
  );
}
