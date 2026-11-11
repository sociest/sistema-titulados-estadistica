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
        brand: {
          50: "#f0fdf4",
          100: "#dcfce7",
          500: "#16a34a",
          600: "#15803d",
          700: "#166534",
          800: "#14532d",
          900: "#052e16",
        },
        umsa: {
          blue: "#1e3a8a",
          gold: "#d97706",
          dark: "#0f172a",
        },
        estad: {
          navy: "#0f2d52",
          blue: "#0f3a6b",
          light: "#14477f",
          orange: "#e86a17",
          orangeDark: "#c2410c",
          bg: "#f1f5f9",
        },
      },
    },
  },
  plugins: [],
};
export default config;
