import type { Config } from "tailwindcss";

// Design tokens live as CSS custom properties in app/globals.css, not here,
// so they can be overridden per category. Use them via arbitrary values,
// e.g. `border-[color:var(--border)]`.
const config: Config = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  plugins: [],
};
export default config;
