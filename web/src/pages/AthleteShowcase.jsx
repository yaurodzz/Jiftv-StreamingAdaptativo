import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { subscribeApprovedAthletes } from "../services/athletes.js";
import { subscribeModalities } from "../services/modalities.js";
import { subscribeClasses } from "../services/classes.js";
import AthleteCard from "../features/athletes/AthleteCard.jsx";
import ModalityChips from "../features/catalog/ModalityChips.jsx";
import SearchBox from "../features/catalog/SearchBox.jsx";

// Vitrine pública de atletas. Card em grade estilo "figurinha profissional".
// Filtros: busca por nome + chips por modalidade + select de turma.

function normalize(s) {
  return (s || "").normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
}

export default function AthleteShowcase() {
  const [athletes, setAthletes] = useState(null); // null = carregando
  const [modalities, setModalities] = useState([]);
  const [classes, setClasses] = useState([]);
  const [q, setQ] = useState("");
  const [modality, setModality] = useState(null); // filtra por modalityName
  const [classId, setClassId] = useState("");

  useEffect(() => subscribeApprovedAthletes(setAthletes), []);
  useEffect(() => subscribeModalities(setModalities), []);
  useEffect(() => subscribeClasses(setClasses), []);
  useEffect(() => { document.title = "Atletas · JIFTv"; }, []);

  const loading = athletes === null;
  const all = athletes || [];

  const filtered = useMemo(() => {
    const nq = normalize(q);
    return all.filter((a) => {
      if (modality && (a.modalityName || a.modality) !== modality) return false;
      if (classId && a.classId !== classId) return false;
      if (!nq) return true;
      return (
        normalize(a.name).includes(nq) ||
        normalize(a.nickname).includes(nq) ||
        normalize(a.position).includes(nq)
      );
    });
  }, [all, q, modality, classId]);

  const chipItems = useMemo(() => {
    const counts = new Map();
    for (const a of all) {
      const k = a.modalityName || a.modality || "Outros";
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
    <section className="mx-auto max-w-6xl px-4 py-10">
      <header className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold md:text-4xl">Atletas dos Jogos IFSC</h1>
          <p className="mt-2 max-w-2xl text-muted">
            Perfis dos estudantes que representam suas turmas. Quer inscrever alguém?{" "}
            <Link to="/atletas/novo" className="text-accent hover:underline">
              Enviar cadastro
            </Link>.
          </p>
        </div>
      </header>

      <div className="mb-8 flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <SearchBox value={q} onChange={setQ} placeholder="Buscar por nome, apelido ou posição…" />
          <select
            value={classId}
            onChange={(e) => setClassId(e.target.value)}
            className="input max-w-[220px]"
            aria-label="Filtrar por turma"
          >
            <option value="">Todas as turmas</option>
            {classes.map((c) => (
              <option key={c.id} value={c.id}>
                {c.campus ? `${c.name} — ${c.campus}` : c.name}
              </option>
            ))}
          </select>
        </div>
        <ModalityChips items={chipItems} active={modality} onChange={setModality} />
      </div>

      {loading ? (
        <SkeletonGrid />
      ) : filtered.length === 0 ? (
        <EmptyState
          hasFilters={!!(q || modality || classId)}
          onReset={() => { setQ(""); setModality(null); setClassId(""); }}
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {filtered.map((a) => <AthleteCard key={a.id} athlete={a} />)}
        </div>
      )}
    </section>
  );
}

function SkeletonGrid() {
  return (
    <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
      {Array.from({ length: 10 }).map((_, i) => (
        <div key={i} className="overflow-hidden rounded-2xl border border-line bg-surface">
          <div className="aspect-[4/5] animate-pulse bg-elevated" />
          <div className="space-y-2 p-3">
            <div className="h-3 w-2/3 animate-pulse rounded bg-elevated" />
            <div className="h-3 w-1/3 animate-pulse rounded bg-elevated" />
          </div>
        </div>
      ))}
    </div>
  );
}

function EmptyState({ hasFilters, onReset }) {
  return (
    <div className="rounded-2xl border border-dashed border-line bg-surface px-6 py-14 text-center">
      <p className="text-lg font-semibold">
        {hasFilters ? "Nenhum atleta com esse filtro" : "Nenhum atleta cadastrado ainda"}
      </p>
      <p className="mt-1 text-sm text-muted">
        {hasFilters
          ? "Tente remover algum filtro."
          : "Assim que os primeiros cadastros forem aprovados, aparecem aqui."}
      </p>
      {hasFilters ? (
        <button onClick={onReset} className="btn-ghost mt-4">Limpar filtros</button>
      ) : (
        <Link to="/atletas/novo" className="btn-primary mt-4 inline-flex">Enviar cadastro</Link>
      )}
    </div>
  );
}
