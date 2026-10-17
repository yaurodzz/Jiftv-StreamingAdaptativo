import { useEffect, useState } from "react";
import { getAthlete } from "../../services/athletes.js";

// Elenco da transmissão. `streams/{id}.roster` guarda só quem joga e de que lado:
//   [{ athleteId, team: "A" | "B" }]
// Nome, foto e número vêm sempre do perfil do atleta (coleção `athletes`), então uma foto
// trocada no painel aparece no elenco sem ninguém precisar salvar a transmissão de novo, e
// um atleta rejeitado depois some sozinho da página pública.

export const ROSTER_MAX = 60;

// Normaliza o que vem do Firestore ou do formulário: sem repetidos, time válido, tamanho limitado.
export function cleanRoster(raw) {
  const seen = new Set();
  const out = [];
  for (const entry of Array.isArray(raw) ? raw : []) {
    const athleteId = typeof entry?.athleteId === "string" ? entry.athleteId : "";
    if (!athleteId || seen.has(athleteId)) continue;
    seen.add(athleteId);
    out.push({ athleteId, team: entry.team === "B" ? "B" : "A" });
    if (out.length >= ROSTER_MAX) break;
  }
  return out;
}

export const hasTeams = (stream) => Boolean(stream?.teamA || stream?.teamB);

// Como numa súmula: pelo número da camisa (quem não tem número vai para o fim) e depois pelo nome.
export function byJersey(a, b) {
  const na = a.jerseyNumber ?? Infinity;
  const nb = b.jerseyNumber ?? Infinity;
  return na - nb || (a.name || "").localeCompare(b.name || "", "pt-BR");
}

// Junta o elenco com os perfis: [{ key, name, players: [atleta…] }], sem os times vazios.
// Sem equipes na transmissão, vira uma lista única (name = null).
export function rosterTeams(stream, athletesById) {
  const roster = cleanRoster(stream?.roster);
  const players = (team) => roster
    .filter((e) => !team || e.team === team)
    .map((e) => athletesById[e.athleteId])
    .filter(Boolean)
    .sort(byJersey);
  const teams = hasTeams(stream)
    ? [
      { key: "A", name: stream.teamA || "Equipe A", players: players("A") },
      { key: "B", name: stream.teamB || "Equipe B", players: players("B") },
    ]
    : [{ key: "all", name: null, players: players(null) }];
  return teams.filter((t) => t.players.length > 0);
}

// Perfis do elenco para a página pública: { idDoAtleta: atleta }. Lê cada perfil uma vez
// (não fica ouvindo) e só de novo quando a lista de atletas muda. Quem não está aprovado
// volta null (as regras do Firestore negam a leitura) e fica de fora.
export function useRosterAthletes(roster) {
  const ids = cleanRoster(roster).map((e) => e.athleteId).sort().join(",");
  const [byId, setById] = useState({});

  useEffect(() => {
    if (!ids) { setById({}); return undefined; }
    let alive = true;
    Promise.all(ids.split(",").map((id) => getAthlete(id).catch(() => null))).then((list) => {
      if (alive) setById(Object.fromEntries(list.filter(Boolean).map((a) => [a.id, a])));
    });
    return () => { alive = false; };
  }, [ids]);

  return byId;
}
