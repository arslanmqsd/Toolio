import { TEMPLATE_CONTENT } from "./gitignore-data/content";
import { TEMPLATE_CATEGORIES, TEMPLATES, type TemplateMeta } from "./gitignore-data/manifest";

export interface MergeResult {
  text: string;
  /** Pattern lines dropped because an earlier line already had them. */
  duplicates: number;
}

const byId = new Map(TEMPLATES.map((t) => [t.id, t]));
const categoryRank = new Map(TEMPLATE_CATEGORIES.map((c, i) => [c.id, i]));
const manifestRank = new Map(TEMPLATES.map((t, i) => [t.id, i]));

/** Known ids only, once each, in display order: by category, then as listed in the manifest. */
export function orderTemplateIds(ids: string[]): string[] {
  return [...new Set(ids)]
    .filter((id) => byId.has(id))
    .sort((a, b) => categoryRank.get(byId.get(a)!.category)! - categoryRank.get(byId.get(b)!.category)! || manifestRank.get(a)! - manifestRank.get(b)!);
}

/** The selected templates as one .gitignore, each under a "# ---- Label ----" header. */
export function mergeTemplates(templateIds: string[]): string {
  return mergeGitignore(templateIds).text;
}

export function mergeGitignore(templateIds: string[]): MergeResult {
  return mergeSections(orderTemplateIds(templateIds).map((id) => ({ label: byId.get(id)!.label, content: TEMPLATE_CONTENT[id] })));
}

/**
 * Joins sections under headers. A pattern line that appeared earlier is dropped, keeping the first;
 * comments and blank lines aren't patterns, so they stay to keep each section readable.
 */
export function mergeSections(sections: { label: string; content: string }[]): MergeResult {
  const seen = new Set<string>();
  let duplicates = 0;
  const blocks = sections.map(({ label, content }) => {
    const lines: string[] = [];
    // Only line breaks are split on; a lone "\r" can be part of a pattern (macOS's "Icon\r").
    for (const line of content.split(/\r?\n/)) {
      const isPattern = line.trim() !== "" && !line.startsWith("#");
      if (isPattern) {
        if (seen.has(line)) {
          duplicates++;
          continue;
        }
        seen.add(line);
      }
      // One blank line at most between groups, where dropped lines could leave several.
      if (line.trim() === "" && (lines.length === 0 || lines[lines.length - 1] === "")) continue;
      lines.push(line.trim() === "" ? "" : line);
    }
    while (lines[lines.length - 1] === "") lines.pop();
    return [`# ---- ${label} ----`, ...lines].join("\n");
  });
  return { text: blocks.length ? blocks.join("\n\n") + "\n" : "", duplicates };
}

/** Lower case letters and digits only, "+" as "p", so "C++" is "cpp" and ".NET" is "net". */
function normalize(name: string): string {
  return name.toLowerCase().replace(/\+/g, "p").replace(/[^a-z0-9]/g, "");
}

const byName = new Map<string, string>();
for (const t of TEMPLATES) for (const name of [t.id, t.label, ...(t.aliases ?? [])]) byName.set(normalize(name), t.id);

const SECTION_HEADER = /^# ---- (.+) ----$/gm;

/**
 * Template ids named in free text: "node, vscode, macos", "Python + PyCharm + macOS", one per line,
 * or a .gitignore this tool made (read from its section headers alone).
 */
export function templatesFromText(text: string): string[] {
  const headers = [...text.matchAll(SECTION_HEADER)].map((m) => m[1]);
  // "+" separates names only with spaces round it, so "C++" stays whole.
  const names = headers.length ? headers : text.split(/\s+\+\s+|\s+and\s+|[,;|&\n]/i);
  const ids: string[] = [];
  for (const name of names) {
    const whole = byName.get(normalize(name));
    if (whole) ids.push(whole);
    else for (const word of name.split(/\s+/)) {
      const id = byName.get(normalize(word));
      if (id) ids.push(id);
    }
  }
  return orderTemplateIds(ids);
}

/** Templates whose name, id or alias contains the query, ignoring case and punctuation. */
export function filterTemplates(query: string): TemplateMeta[] {
  const q = normalize(query);
  if (!q) return TEMPLATES;
  return TEMPLATES.filter((t) => [t.id, t.label, ...(t.aliases ?? [])].some((name) => normalize(name).includes(q)));
}
