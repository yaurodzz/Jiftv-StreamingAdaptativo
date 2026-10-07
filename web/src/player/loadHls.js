// Loader dinâmico de hls.js. Fora do bundle inicial: só carrega quando o player HLS
// realmente precisa (as páginas com player são lazy, então também saem do chunk principal).
let cached = null;
export function loadHls() {
  if (!cached) cached = import("hls.js").then((m) => m.default);
  return cached;
}
