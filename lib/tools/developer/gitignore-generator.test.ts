import { describe, expect, it } from "vitest";
import { TEMPLATE_CONTENT } from "./gitignore-data/content";
import { STACK_PRESETS, TEMPLATES } from "./gitignore-data/manifest";
import { filterTemplates, mergeGitignore, mergeSections, mergeTemplates, orderTemplateIds, templatesFromText } from "./gitignore-generator";

describe("template data", () => {
  it("has content for every manifest entry, and nothing else", () => {
    expect(Object.keys(TEMPLATE_CONTENT).sort()).toEqual(TEMPLATES.map((t) => t.id).sort());
    for (const t of TEMPLATES) expect(TEMPLATE_CONTENT[t.id].trim(), t.id).not.toBe("");
  });

  it("only uses known templates in presets", () => {
    const ids = new Set(TEMPLATES.map((t) => t.id));
    for (const preset of STACK_PRESETS) for (const id of preset.templates) expect(ids.has(id), `${preset.id}: ${id}`).toBe(true);
  });

  it("gives every name and alias to one template only", () => {
    const seen = new Map<string, string>();
    for (const t of TEMPLATES) {
      for (const name of [t.id, t.label, ...(t.aliases ?? [])]) {
        const key = name.toLowerCase().replace(/\+/g, "p").replace(/[^a-z0-9]/g, "");
        const owner = seen.get(key);
        if (owner && owner !== t.id) throw new Error(`"${name}" is used by ${owner} and ${t.id}`);
        seen.set(key, t.id);
      }
    }
  });
});

describe("mergeSections", () => {
  it("puts a header above each section", () => {
    const { text } = mergeSections([
      { label: "A", content: "a.txt\n" },
      { label: "B", content: "b.txt\n" },
    ]);
    expect(text).toBe("# ---- A ----\na.txt\n\n# ---- B ----\nb.txt\n");
  });

  it("drops patterns an earlier section already has, keeping the first", () => {
    const result = mergeSections([
      { label: "A", content: "# Logs\n*.log\nnode_modules/\n" },
      { label: "B", content: "# Logs\n*.log\n.idea/\n" },
    ]);
    expect(result.text).toBe("# ---- A ----\n# Logs\n*.log\nnode_modules/\n\n# ---- B ----\n# Logs\n.idea/\n");
    expect(result.duplicates).toBe(1);
  });

  it("keeps repeated blank lines and comments, which aren't patterns", () => {
    const { text, duplicates } = mergeSections([
      { label: "A", content: "# Build\nout/\n\nx\n" },
      { label: "B", content: "# Build\nbuild/\n\ny\n" },
    ]);
    expect(text).toContain("# ---- B ----\n# Build\nbuild/\n\ny\n");
    expect(duplicates).toBe(0);
  });

  it("drops duplicates within one section too", () => {
    expect(mergeSections([{ label: "A", content: "x\nx\n" }])).toEqual({ text: "# ---- A ----\nx\n", duplicates: 1 });
  });

  it("collapses the blank lines left behind and trims each section's ends", () => {
    const { text } = mergeSections([
      { label: "A", content: "x\n" },
      { label: "B", content: "\n\ny\n\nx\n\nz\n\n\n" },
    ]);
    expect(text).toBe("# ---- A ----\nx\n\n# ---- B ----\ny\n\nz\n");
  });

  it("reads CRLF line endings but keeps a carriage return inside a pattern", () => {
    const { text } = mergeSections([{ label: "A", content: "a\r\nIcon[\r]\r\n" }]);
    expect(text).toBe("# ---- A ----\na\nIcon[\r]\n");
  });

  it("is empty with no sections", () => {
    expect(mergeSections([])).toEqual({ text: "", duplicates: 0 });
  });
});

describe("mergeTemplates", () => {
  it("merges real templates in category order with labelled headers", () => {
    const text = mergeTemplates(["macos", "vscode", "node"]);
    const headers = text.split("\n").filter((line) => line.startsWith("# ---- "));
    expect(headers).toEqual(["# ---- Node ----", "# ---- VS Code ----", "# ---- macOS ----"]);
    expect(text).toContain("node_modules/");
    expect(text).toContain(".DS_Store");
    expect(text.endsWith("\n")).toBe(true);
  });

  it("removes patterns two templates share", () => {
    // Both ignore npm and Yarn debug logs.
    const { text, duplicates } = mergeGitignore(["node", "nextjs"]);
    expect(duplicates).toBeGreaterThan(0);
    expect(text.split("\n").filter((line) => line === "npm-debug.log*")).toHaveLength(1);
  });

  it("ignores unknown and repeated ids", () => {
    expect(mergeTemplates(["go", "nope", "go"])).toBe(mergeTemplates(["go"]));
    expect(mergeTemplates([])).toBe("");
  });
});

describe("orderTemplateIds", () => {
  it("sorts by category then manifest order and drops unknowns", () => {
    expect(orderTemplateIds(["macos", "jetbrains", "x", "python", "python"])).toEqual(["python", "jetbrains", "macos"]);
  });
});

describe("templatesFromText", () => {
  it("reads ids, labels and aliases in any case", () => {
    expect(templatesFromText("node, vscode, macos")).toEqual(["node", "vscode", "macos"]);
    expect(templatesFromText("Python + PyCharm + macOS")).toEqual(["python", "jetbrains", "macos"]);
    expect(templatesFromText("C++\nVisual Studio Code\n.NET")).toEqual(["cpp", "dotnet", "vscode"]);
  });

  it("falls back to single words", () => {
    expect(templatesFromText("golang rust")).toEqual(["go", "rust"]);
  });

  it("reads back the section headers of a generated file", () => {
    expect(templatesFromText(mergeTemplates(["rust", "vim"]))).toEqual(["rust", "vim"]);
  });

  it("finds nothing in unrelated text", () => {
    expect(templatesFromText("hello there")).toEqual([]);
    expect(templatesFromText("")).toEqual([]);
  });
});

describe("filterTemplates", () => {
  it("matches labels and aliases, ignoring case and punctuation", () => {
    expect(filterTemplates("pych").map((t) => t.id)).toEqual(["jetbrains"]);
    expect(filterTemplates("next").map((t) => t.id)).toEqual(["nextjs"]);
    expect(filterTemplates("  ").length).toBe(TEMPLATES.length);
  });
});
