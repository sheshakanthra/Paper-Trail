/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        paper:   { DEFAULT: "#f3efe6", 2: "#ece7db", card: "#faf7ef" },
        ink:     { DEFAULT: "#1c1a15", soft: "#57524a", faint: "#8d8779" },
        rule:    { DEFAULT: "#d8d1c0", dark: "#b9b09a" },
        stamp:   "#b3372c",
        office:  "#1f4e79",
        resolved:"#2e6b45",
        fileamber:"#a06b1e",
      },
      fontFamily: {
        serif: ["Fraunces", "Georgia", "serif"],
        sans:  ["'IBM Plex Sans'", "system-ui", "sans-serif"],
        mono:  ["'IBM Plex Mono'", "ui-monospace", "monospace"],
      },
      borderRadius: { none: "0" },
    },
  },
  plugins: [],
};
