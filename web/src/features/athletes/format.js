// Helpers de apresentação para atletas. Sem dependência de React.

// Idade a partir de "YYYY-MM-DD". Retorna número inteiro ou null se inválido.
export function computeAge(birthDate) {
  if (!birthDate || typeof birthDate !== "string") return null;
  const parts = birthDate.split("-").map(Number);
  if (parts.length !== 3 || parts.some(Number.isNaN)) return null;
  const [y, m, d] = parts;
  const today = new Date();
  let age = today.getFullYear() - y;
  const mDiff = (today.getMonth() + 1) - m;
  if (mDiff < 0 || (mDiff === 0 && today.getDate() < d)) age--;
  return age >= 0 && age < 120 ? age : null;
}

// Subtítulo padrão do card: turma · câmpus (ambos opcionais).
export function classLine(athlete) {
  const parts = [];
  if (athlete.className)  parts.push(athlete.className);
  if (athlete.classCampus) parts.push(athlete.classCampus);
  return parts.join(" · ");
}

// Agrega scoutEvents em um mapa { code: { label, total } } para exibir StatBlocks.
// `scoutTypes` opcional (vem da modalidade) fornece rótulos e ordena; se ausente,
// usa o próprio `code` como label.
export function aggregateScout(events, scoutTypes = []) {
  const totals = new Map();
  for (const ev of events) {
    const prev = totals.get(ev.type) || 0;
    totals.set(ev.type, prev + (Number(ev.value) || 0));
  }
  if (scoutTypes.length) {
    return scoutTypes.map((t) => ({
      code: t.code,
      label: t.label || t.code,
      total: totals.get(t.code) || 0,
    }));
  }
  return [...totals.entries()].map(([code, total]) => ({ code, label: code, total }));
}
