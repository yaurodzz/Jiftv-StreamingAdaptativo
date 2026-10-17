// Dados de mentira para posicionar e conferir os gráficos no OBS antes do jogo:
//   /overlay/<qualquer-nome>?demo=placar    só o placar, com o cronômetro rodando
//   /overlay/<qualquer-nome>?demo=elenco    tela de escalação das duas equipes
//   /overlay/<qualquer-nome>?demo=equipe    tela de escalação de uma equipe
// Nada é lido nem gravado no Firestore neste modo.

const names = [
  ["Ana Souza", "Goleira"], ["Bruna Lima", "Fixa"], ["Carla Mendes", "Ala"], ["Débora Nunes", "Ala"],
  ["Elisa Prado", "Pivô"], ["Fernanda Rocha", "Ala"], ["Gabriela Reis", "Fixa"], ["Helena Dias", "Goleira"],
  ["Isabela Castro", "Pivô"], ["Júlia Farias", "Ala"], ["Karen Moraes", "Fixa"], ["Larissa Pinto", "Ala"],
  ["Marina Alves", "Pivô"], ["Natália Cruz", "Ala"], ["Olívia Barros", "Goleira"], ["Paula Teixeira", "Fixa"],
];

export function demoData(kind) {
  const athletes = names.map(([name, position], index) => ({
    id: `demo-${index}`,
    name,
    position,
    jerseyNumber: index < 8 ? index + 1 : index + 3,
  }));
  const stream = {
    id: "demo",
    title: "Final do Futsal Feminino",
    modalityName: "Futsal",
    teamA: "3º Informática",
    teamB: "2º Administração",
    scoreA: 2,
    scoreB: 1,
    roster: athletes.map((a, index) => ({ athleteId: a.id, team: index < 8 ? "A" : "B" })),
    overlay: {
      scoreboard: true,
      lineup: kind === "elenco" ? "all" : kind === "equipe" ? "A" : null,
      period: "1º tempo",
      clock: { running: true, baseMs: 754000, startedAt: Date.now() },
    },
  };
  return { stream, athletesById: Object.fromEntries(athletes.map((a) => [a.id, a])) };
}
