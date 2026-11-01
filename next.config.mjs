/** Tools that moved category. Old URLs keep working, and search engines carry their ranking over. */
const MOVED_TOOLS = [
  { id: "text-diff-checker", from: "developer", to: "text" },
  { id: "markdown-html-converter", from: "developer", to: "text" },
  { id: "json-jsonl-converter", from: "developer", to: "data" },
];

/** @type {import('next').NextConfig} */
const nextConfig = {
  webpack(config, { isServer }) {
    // `import text from "./file?raw"` gives the file's text, as Vite (and so Vitest) does natively.
    config.module.rules.push({ resourceQuery: /raw/, type: "asset/source" });
    // qpdf-wasm (Protect PDF) reaches for Node's fs, path and crypto only when running under Node; the browser build doesn't need them.
    if (!isServer) config.resolve.fallback = { ...config.resolve.fallback, fs: false, path: false, crypto: false };
    return config;
  },
  async redirects() {
    return MOVED_TOOLS.map(({ id, from, to }) => ({
      source: `/tools/${from}/${id}`,
      destination: `/tools/${to}/${id}`,
      permanent: true,
    }));
  },
};

export default nextConfig;
