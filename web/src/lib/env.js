// Leitura centralizada das variáveis de ambiente do site.
// Todas seguem o prefixo VITE_ e são apenas lidas, nunca logadas.

const mediaUrl = (import.meta.env.VITE_MEDIA_URL || "http://localhost:8080").replace(/\/+$/, "");

export const env = {
  // Servidor de mídia (nginx-rtmp): HLS, DASH, miniaturas ao vivo e gravações locais.
  mediaUrl,
  hlsBase:  (import.meta.env.VITE_HLS_BASE  || `${mediaUrl}/hls`).replace(/\/+$/, ""),
  dashBase: (import.meta.env.VITE_DASH_BASE || `${mediaUrl}/dash`).replace(/\/+$/, ""),
  // URL RTMP para o operador copiar no OBS/Larix (não é usada pelo navegador).
  rtmpUrl:  import.meta.env.VITE_RTMP_URL || "rtmp://localhost:1935/live",

  // Cloudinary: usado só pelo cadastro público de atleta (upload direto do navegador).
  // O preset é UNSIGNED e restrito à pasta jiftv/athletes/pending; ver docs/cloudinary-preset.md.
  cloudinary: {
    cloudName:    import.meta.env.VITE_CLOUDINARY_CLOUD_NAME    || "",
    uploadPreset: import.meta.env.VITE_CLOUDINARY_UPLOAD_PRESET || "",
  },
};
