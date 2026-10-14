import type { Config } from "tailwindcss";

// Jay's Phase 2 final, 5a: "Clear Sky, muted background, subtle corners".
const config: Config = {
  darkMode: "class",
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        paper: "#F2F4FB",
        card: "#FFFFFF",
        ink: "#121833",
        action: "#2445B5",
        muted: "#495170",
        line: "#DDE2F0",
        stripe: "#E7EBF7",
        butter: "#FFD45C",
        mint: "#DCF2E4",
        safe: "#155E3B",
        rust: "#9A3B1E",
      },
      fontFamily: {
        sans: ["var(--font-atkinson)", "system-ui", "sans-serif"],
        serif: ["var(--font-bricolage)", "system-ui", "sans-serif"],
      },
      borderRadius: {
        "2xl": "6px",
      },
    },
  },
  plugins: [],
};
export default config;
