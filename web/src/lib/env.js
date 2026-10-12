// Leitura centralizada das variáveis de ambiente do site.
// Todas seguem o prefixo VITE_ e são apenas lidas, nunca logadas.

const mediaUrl = (import.meta.env.VITE_MEDIA_URL || "http://localhost:8080").replace(/\/+$/, "");

export const env = {
  // Servidor de mídia (nginx-rtmp): HLS, DASH, miniaturas ao vivo e gravações locais.
  mediaUrl,
  hlsBase:  (import.meta.env.VITE_HLS_BASE  || `${mediaUrl}/hls`).replace(/\/+$/, ""),
  dashBase: (import.meta.env.VITE_DASH_BASE || `${mediaUrl}/dash`).replace(/\/+$/, ""),
  // Worker (/api/*: espectadores, cadastro de atletas). Em produção é api.jiftv.org; sem a variável,
  // usa o próprio servidor de mídia, que também encaminha /api/ ao worker.
  apiUrl:   (import.meta.env.VITE_API_URL || mediaUrl).replace(/\/+$/, ""),
  // URL RTMP para o operador copiar no OBS/Larix (não é usada pelo navegador).
  rtmpUrl:  import.meta.env.VITE_RTMP_URL || "rtmp://localhost:1935/live",
};
