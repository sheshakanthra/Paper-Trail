/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        ink:      "#05070B",
        base:     "#0D1117",
        surface:  "#151A23",
        raised:   "#202938",
        line:     "rgba(255,255,255,0.08)",
        amber:    { DEFAULT: "#F6A623", soft: "#FF8C42" },
        cyan:     { DEFAULT: "#35D6FF" },
        emerald2: "#2FD6A6",
        rose2:    "#FF5A6A",
      },
      fontFamily: {
        display: ["'Clash Display'", "'Satoshi'", "system-ui", "sans-serif"],
        sans:    ["'Satoshi'", "'General Sans'", "system-ui", "sans-serif"],
        mono:    ["'JetBrains Mono'", "ui-monospace", "monospace"],
      },
      boxShadow: {
        glass:   "0 1px 0 0 rgba(255,255,255,0.06) inset, 0 24px 60px -34px rgba(0,0,0,0.9)",
        raised:  "0 1px 0 0 rgba(255,255,255,0.08) inset, 0 30px 70px -30px rgba(0,0,0,0.95)",
        glow:    "0 0 0 1px rgba(246,166,35,0.25), 0 8px 30px -8px rgba(246,166,35,0.45)",
        glowcy:  "0 0 24px -4px rgba(53,214,255,0.5)",
      },
      backdropBlur: { xs: "2px" },
      keyframes: {
        shimmer: { "100%": { transform: "translateX(100%)" } },
        floaty:  { "0%,100%": { transform: "translate(0,0) scale(1)" }, "50%": { transform: "translate(2%,-3%) scale(1.06)" } },
        dashmove:{ to: { "stroke-dashoffset": "-16" } },
        sonar:   { "0%": { transform: "scale(.75)", opacity: ".7" }, "100%": { transform: "scale(2.5)", opacity: "0" } },
        gridpan: { to: { "background-position": "40px 40px" } },
      },
      animation: {
        shimmer:  "shimmer 1.6s infinite",
        floaty:   "floaty 18s ease-in-out infinite",
        dashmove: "dashmove .9s linear infinite",
        sonar:    "sonar 1.9s ease-out infinite",
      },
    },
  },
  plugins: [],
};
