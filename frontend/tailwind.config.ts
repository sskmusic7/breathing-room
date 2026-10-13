import type { Config } from "tailwindcss";

// "Kitchen Table" direction from Jay's Phase 2 wireframes (option 1a).
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
        paper: "#F7F2E9",
        card: "#FFFDF8",
        ink: "#1F2340",
        muted: "#55586B",
        line: "#E5DCCB",
        stripe: "#EFE6D4",
        butter: "#F3C64B",
        mint: "#D3EDDD",
        safe: "#1B6440",
        rust: "#9A3B1E",
      },
      fontFamily: {
        sans: ["var(--font-figtree)", "system-ui", "sans-serif"],
        serif: ["var(--font-young-serif)", "Georgia", "serif"],
      },
      borderRadius: {
        "2xl": "16px",
      },
    },
  },
  plugins: [],
};
export default config;
