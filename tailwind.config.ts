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
      },
    },
  },
  plugins: [],
};
export default config;
