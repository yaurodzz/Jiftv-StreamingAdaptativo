import { useEffect, useMemo, useState } from "react";
import { subscribeVods } from "../services/vods.js";
import { subscribeModalities } from "../services/modalities.js";
import MediaCard from "../components/ui/MediaCard.jsx";
import CardSkeleton from "../components/ui/CardSkeleton.jsx";
import Row, { RowItem } from "../components/ui/Row.jsx";
import ModalityChips from "../features/catalog/ModalityChips.jsx";
import SearchBox from "../features/catalog/SearchBox.jsx";
import ViewToggle from "../features/catalog/ViewToggle.jsx";
import { vodDuration, vodSubtitle } from "../lib/format.js";
import { isPlayable, vodThumb } from "../lib/media.js";

function normalize(s) {
  return (s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

function useCatalogData() {
  const [vods, setVods] = useState(null);         // null = carregando
  const [modalities, setModalities] = useState([]);
  // Só entram no catálogo gravações que dá para assistir (local ou Cloudinary).
  useEffect(() => subscribeVods((list) => setVods(list.filter(isPlayable)), () => setVods([])), []);
  useEffect(() => subscribeModalities(setModalities), []);
  return { vods, modalities };
}

function toVodCardProps(v) {
  return {
    to: `/partidas/${v.id}`,
    title: v.title || "Sem título",
    subtitle: vodSubtitle(v),
    thumbnail: vodThumb(v),
    duration: vodDuration(v),
  };
}

// Chave estável para o "grupo" de uma gravação. Prioriza `modality` textual
// (schema atual), depois `modalityName`, senão "Outros".
function groupKey(v) {
  return v.modality || v.modalityName || "Outros";
}

export default function Catalog() {
  const { vods, modalities } = useCatalogData();
  const [q, setQ] = useState("");
  const [modality, setModality] = useState(null);
  const [view, setView] = useState("rows");

  useEffect(() => { document.title = "Catálogo · JIFTv"; }, []);

  const loading = vods === null;
  const all = vods || [];

  // Filtro por texto + modalidade.
  const filtered = useMemo(() => {
    const nq = normalize(q);
    return all.filter((v) => {
      if (modality && groupKey(v) !== modality) return false;
      if (!nq) return true;
      return normalize(`${v.title} ${v.teamA || ""} ${v.teamB || ""} ${v.description || ""}`).includes(nq);
    });
  }, [all, q, modality]);

  // Agrupamento por modalidade, com ordem: cadastradas (mesmo vazias) → extras.
  const groups = useMemo(() => {
    const byKey = new Map();
    for (const v of filtered) {
      const key = groupKey(v);
      const list = byKey.get(key) || [];
      list.push(v);
      byKey.set(key, list);
    }
    const ordered = [];
    const seen = new Set();
    for (const m of modalities) {
      const list = byKey.get(m.name) || [];
      ordered.push({ name: m.name, code: m.code, items: list });
      seen.add(m.name);
    }
    for (const [key, list] of byKey) {
      if (!seen.has(key)) ordered.push({ name: key, items: list });
    }
    return ordered;
  }, [filtered, modalities]);

  const chipItems = useMemo(() => {
    const counts = new Map();
    for (const v of all) {
      const k = groupKey(v);
      counts.set(k, (counts.get(k) || 0) + 1);
    }
    const items = [];
    const seen = new Set();
    for (const m of modalities) {
      items.push({ name: m.name, count: counts.get(m.name) || 0 });
      seen.add(m.name);
    }
    for (const [k, c] of counts) if (!seen.has(k)) items.push({ name: k, count: c });
    return items.sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
  }, [all, modalities]);

  return (
    <section className="mx-auto max-w-6xl px-4 py-6 md:py-10">
      <header className="mb-6 md:mb-8">
        <h1 className="text-3xl font-semibold md:text-4xl">Catálogo de gravações</h1>
        <p className="mt-2 max-w-2xl text-muted">
          Todas as partidas dos Jogos IFSC, gravadas do início ao fim e organizadas por modalidade.
        </p>
      </header>

      <div className="mb-6 flex flex-col gap-4 md:mb-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <SearchBox value={q} onChange={setQ} />
          <ViewToggle value={view} onChange={setView} />
        </div>
        <ModalityChips items={chipItems} active={modality} onChange={setModality} />
      </div>

      {loading ? (
        <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => <CardSkeleton key={i} />)}
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState q={q} modality={modality} onReset={() => { setQ(""); setModality(null); }} />
      ) : view === "grid" ? (
        <GridView items={filtered} />
      ) : (
        <RowsView groups={groups} />
      )}
    </section>
  );
}

function RowsView({ groups }) {
  const visible = groups.filter((g) => g.items.length > 0);
  if (visible.length === 0) {
    return <p className="text-muted">Nenhuma gravação corresponde ao filtro atual.</p>;
  }
  return (
    <div className="space-y-10">
      {visible.map((g) => (
        <Row key={g.name} title={g.name} count={g.items.length}>
          {g.items.map((v) => (
            <RowItem key={v.id}>
              <MediaCard {...toVodCardProps(v)} />
            </RowItem>
          ))}
        </Row>
      ))}
    </div>
  );
}

function GridView({ items }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
      {items.map((v) => (
        <MediaCard key={v.id} {...toVodCardProps(v)} />
      ))}
    </div>
  );
}

function EmptyState({ q, modality, onReset }) {
  return (
    <div className="rounded-2xl border border-dashed border-line bg-surface px-6 py-14 text-center">
      <p className="text-lg font-semibold">Nada encontrado</p>
      <p className="mt-1 text-sm text-muted">
        {q
          ? <>Nenhuma gravação com "{q}"{modality ? ` em ${modality}` : ""}.</>
          : <>Nenhuma gravação {modality ? `em ${modality}` : "ainda"}.</>}
      </p>
      {(q || modality) && (
        <button onClick={onReset} className="btn-ghost mt-4">Limpar filtros</button>
      )}
    </div>
  );
}
