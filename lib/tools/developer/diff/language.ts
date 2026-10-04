/** Languages the diff tools can color, by highlight.js id. */
export const LANGUAGES = [
  { id: "javascript", label: "JavaScript" },
  { id: "typescript", label: "TypeScript" },
  { id: "json", label: "JSON" },
  { id: "css", label: "CSS" },
  { id: "xml", label: "HTML / XML" },
  { id: "python", label: "Python" },
  { id: "go", label: "Go" },
  { id: "sql", label: "SQL" },
  { id: "yaml", label: "YAML" },
  { id: "bash", label: "Bash" },
  { id: "markdown", label: "Markdown" },
] as const;

export type LanguageId = (typeof LANGUAGES)[number]["id"];

const BY_EXTENSION: Record<string, LanguageId> = {
  js: "javascript",
  mjs: "javascript",
  cjs: "javascript",
  jsx: "javascript",
  ts: "typescript",
  tsx: "typescript",
  mts: "typescript",
  cts: "typescript",
  json: "json",
  css: "css",
  scss: "css",
  less: "css",
  html: "xml",
  htm: "xml",
  xml: "xml",
  svg: "xml",
  vue: "xml",
  py: "python",
  go: "go",
  sql: "sql",
  yml: "yaml",
  yaml: "yaml",
  sh: "bash",
  bash: "bash",
  zsh: "bash",
  md: "markdown",
  markdown: "markdown",
};

const BY_NAME: Record<string, LanguageId> = {
  ".bashrc": "bash",
  ".zshrc": "bash",
  ".bash_profile": "bash",
  ".profile": "bash",
};

/** The language to color a file in, from its name. Null means plain text. */
export function languageForFile(path: string): LanguageId | null {
  const name = (path.split("/").pop() ?? "").toLowerCase();
  if (BY_NAME[name]) return BY_NAME[name];
  const dot = name.lastIndexOf(".");
  // No extension, or a dotfile like ".env" whose whole name is the "extension".
  if (dot <= 0) return null;
  return BY_EXTENSION[name.slice(dot + 1)] ?? null;
}
