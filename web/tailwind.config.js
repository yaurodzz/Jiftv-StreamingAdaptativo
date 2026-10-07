/** @type {import('tailwindcss').Config} */
const withAlpha = (v) => `rgb(var(${v}) / <alpha-value>)`;

export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        // Tokens do design system JIFTv (Verde IF) via CSS vars.
        // Uso: bg-bg, text-fg, bg-surface, border-line, text-accent, etc.
        bg:       withAlpha("--bg"),
        surface:  withAlpha("--surface"),
        elevated: withAlpha("--elevated"),
        line:     withAlpha("--line"),
        fg:       withAlpha("--fg"),
        muted:    withAlpha("--muted"),
        accent:   withAlpha("--accent"),
        live:     withAlpha("--live"),
        warn:     withAlpha("--warn"),
      },
      fontFamily: {
        display: ['"Inter Variable"', '"Inter"', "ui-sans-serif", "system-ui"],
        sans:    ['"Inter Variable"', '"Inter"', "ui-sans-serif", "system-ui"],
        mono:    ["ui-monospace", '"Cascadia Mono"', "Consolas", "monospace"],
      },
      borderRadius: {
        "2xl": "1rem",
        "3xl": "1.25rem",
      },
      boxShadow: {
        // Brilho discreto (usado só no tema escuro por convenção do design system).
        glow: "0 0 0 1px rgb(var(--accent) / 0.25), 0 20px 60px -20px rgb(var(--accent) / 0.35)",
        ring: "0 0 0 2px rgb(var(--bg)), 0 0 0 4px rgb(var(--accent))",
      },
      backdropBlur: {
        xs: "2px",
      },
      keyframes: {
        "live-pulse": {
          "0%, 100%": { opacity: "1", transform: "scale(1)" },
          "50%":      { opacity: ".55", transform: "scale(0.92)" },
        },
      },
      animation: {
        "live-pulse": "live-pulse 1.4s ease-in-out infinite",
      },
    },
  },
  plugins: [],
};
