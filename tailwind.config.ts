import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        background: "var(--background)",
        foreground: "var(--foreground)",
        navy: {
          50: "#EBEDF6",
          100: "#D6DAF0",
          200: "#AEB4DE",
          300: "#7F87C4",
          400: "#4F58A0",
          500: "#2E3676",
          600: "#1B2260",
          700: "#141A4E",
          800: "#0F153B",
          900: "#0B1440",
          950: "#070C2B",
        },
        brand: {
          50: "#EEF1FA",
          100: "#DCE3F5",
          200: "#B9C7EB",
          300: "#8FA4DD",
          400: "#5E7ACB",
          500: "#3A57B3",
          600: "#24409E",
          700: "#1D3480",
          800: "#172966",
          900: "#121F4D",
        },
        accent: {
          50: "#FBE7E5",
          100: "#F8CFC9",
          200: "#F1A199",
          300: "#E9756A",
          400: "#ED5B4C",
          500: "#E8483C",
          600: "#CC3B30",
          700: "#A82E25",
          800: "#84241D",
          900: "#641B16",
        },
      },
      boxShadow: {
        card: "0 1px 3px rgba(15, 23, 42, 0.10)",
        "card-md": "0 6px 20px rgba(15, 23, 42, 0.10)",
        // Sombras coloridas: dão relevo sem pesar o layout.
        "brilho-marca": "0 8px 24px -8px rgba(36, 64, 158, 0.45)",
        "brilho-acento": "0 8px 24px -8px rgba(232, 72, 60, 0.45)",
        "brilho-sucesso": "0 8px 24px -8px rgba(5, 150, 105, 0.45)",
      },
      backgroundImage: {
        "gradiente-marca": "var(--gradiente-marca)",
        "gradiente-acento": "var(--gradiente-acento)",
        "gradiente-sucesso": "var(--gradiente-sucesso)",
      },
      keyframes: {
        // Pulso suave pro selo de conversa que precisa de atendimento humano.
        "pulso-suave": {
          "0%, 100%": { opacity: "1" },
          "50%": { opacity: "0.55" },
        },
      },
      animation: {
        "pulso-suave": "pulso-suave 2s ease-in-out infinite",
      },
    },
  },
  plugins: [],
};
export default config;
