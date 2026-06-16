import type { Config } from "tailwindcss";

export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        tower: {
          sidebar: "#050B14",
          bg: "#0B1220",
          card: "#111827",
          border: "#1F2937",
          primary: "#3B82F6",
          success: "#22C55E",
          warning: "#F59E0B",
          danger: "#EF4444",
          muted: "#9CA3AF"
        }
      },
      boxShadow: {
        tower: "0 18px 60px rgba(0, 0, 0, 0.28)"
      }
    }
  },
  plugins: []
} satisfies Config;
