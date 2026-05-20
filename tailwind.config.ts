import type { Config } from "tailwindcss";

export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#18202b",
        muted: "#667085",
        line: "#d9dee8",
        panel: "#f7f8fb",
        sage: "#2f7d5c",
        amber: "#b7791f",
        danger: "#b42318",
        signal: "#315ea8",
        violet: "#7f56d9"
      },
      boxShadow: {
        crisp: "0 1px 2px rgba(16, 24, 40, 0.08)"
      }
    }
  },
  plugins: []
} satisfies Config;
