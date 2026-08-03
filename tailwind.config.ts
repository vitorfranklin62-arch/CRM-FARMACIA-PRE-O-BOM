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
        // Tokens da identidade visual do site público (Farmácia Preço Bom).
        // Namespaced sob "site" pra não colidir com as cores do CRM acima.
        site: {
          "azul-marinho": "#001976",
          "azul-profundo": "#00114F",
          "vermelho-marca": "#FE0000",
          "vermelho-off": "#C40E0E",
          "amarelo-etiqueta": "#FFD100",
          nuvem: "#F2F4F9",
          grafite: "#14181A",
          branco: "#FFFFFF",
          whatsapp: "#25D366",
        },
      },
      boxShadow: {
        card: "0 1px 3px rgba(15, 23, 42, 0.10)",
        "card-md": "0 6px 20px rgba(15, 23, 42, 0.10)",
      },
      fontFamily: {
        display: ["var(--font-archivo)", "system-ui", "sans-serif"],
        site: ["var(--font-instrument-sans)", "system-ui", "sans-serif"],
      },
    },
  },
  plugins: [],
};
export default config;
