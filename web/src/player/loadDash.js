// Loader dinâmico de dash.js (versão 4: a API usada no adapter é a da v4).
let cached = null;
export function loadDash() {
  if (!cached) cached = import("dashjs").then((m) => m.default ?? m);
  return cached;
}
