import { useMemo, useState } from "react";
import { Users } from "lucide-react";
import { setRoster } from "../../services/streams.js";
import Roster from "../live/Roster.jsx";
import { cleanRoster } from "../live/roster.js";
import FormDialog from "./FormDialog.jsx";
import RosterEditor, { useApprovedAthletes } from "./RosterEditor.jsx";
import { useToast } from "./ToastProvider.jsx";

// Cartão "Elenco" da página da transmissão no painel: mostra quem está escalado e abre o editor.
// O elenco salvo aparece na hora abaixo do vídeo, na página pública.
export default function StreamRosterCard({ stream }) {
  const toast = useToast();
  const athletes = useApprovedAthletes();
  const [draft, setDraft] = useState(null); // null = editor fechado
  const [saving, setSaving] = useState(false);

  const roster = useMemo(() => cleanRoster(stream.roster), [stream.roster]);
  const byId = useMemo(() => Object.fromEntries((athletes || []).map((a) => [a.id, a])), [athletes]);
  const missing = athletes ? roster.filter((e) => !byId[e.athleteId]).length : 0;

  const save = async () => {
    setSaving(true);
    try {
      await setRoster(stream.id, draft);
      toast.success("Elenco salvo");
      setDraft(null);
    } catch (err) {
      toast.error(err.message || "Não foi possível salvar o elenco.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="rounded-2xl border border-line bg-surface p-5">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h3 className="font-semibold">Elenco <span className="text-sm font-normal text-muted">{roster.length}</span></h3>
        <button type="button" onClick={() => setDraft(roster)} className="btn-ghost btn-sm">
          <Users size={14} /> {roster.length ? "Editar elenco" : "Montar elenco"}
        </button>
      </div>

      {roster.length === 0 ? (
        <p className="text-sm text-muted">
          Nenhum atleta escalado. O elenco aparece abaixo do vídeo, na página pública, com a foto, o nome e o número de cada atleta.
        </p>
      ) : athletes === null ? (
        <p role="status" className="text-sm text-muted">Carregando…</p>
      ) : (
        <>
          <Roster stream={stream} athletesById={byId} link={false} heading={false} />
          {missing > 0 && (
            <p className="mt-3 text-xs text-warn">
              {missing === 1 ? "1 atleta do elenco não está mais aprovado e não aparece no site." : `${missing} atletas do elenco não estão mais aprovados e não aparecem no site.`}
            </p>
          )}
        </>
      )}

      <FormDialog
        open={draft !== null}
        title="Elenco da transmissão"
        submitLabel="Salvar elenco"
        submitting={saving}
        onClose={() => setDraft(null)}
        onSubmit={save}
        wide
      >
        <RosterEditor
          value={draft || []}
          onChange={setDraft}
          teamA={stream.teamA}
          teamB={stream.teamB}
          modalityCode={stream.modalityCode}
          athletes={athletes}
        />
      </FormDialog>
    </section>
  );
}
