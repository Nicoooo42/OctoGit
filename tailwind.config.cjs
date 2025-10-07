module.exports = {
  darkMode: "class",
  content: [
    "./frontend/index.html",
    "./frontend/src/**/*.{ts,tsx}"
  ],
  theme: {
    extend: {
      colors: {
        "slate-850": "#111827",
        accent: {
          cyan: "#22d3ee"
        }
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "-apple-system", "BlinkMacSystemFont", "Segoe UI", "sans-serif"]
      }
    }
  },
  plugins: []
};
