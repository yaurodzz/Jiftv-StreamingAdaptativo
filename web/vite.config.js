import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: { host: true, port: 5173 },
  build: {
    // hls.js e dash.js são grandes, mas só carregam nas páginas com player (import dinâmico).
    chunkSizeWarningLimit: 900,
    rollupOptions: {
      output: {
        // Firebase em um pedaço próprio: muda pouco e fica no cache do navegador.
        manualChunks: { firebase: ["firebase/app", "firebase/auth", "firebase/firestore"] },
      },
    },
  },
});
