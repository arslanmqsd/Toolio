import { describe, expect, it } from "vitest";
import { allTools, getToolById, sendTargets } from "@/registry";

const ids = (tools: { id: string }[]) => tools.map((tool) => tool.id).sort();

describe("sendTargets", () => {
  it("lists other tools that consume the output type", () => {
    expect(ids(sendTargets(getToolById("jwt-decoder")!, "json"))).toEqual(["json-csv-converter", "json-formatter", "json-jsonl-converter", "json-path-tester", "json-to-types", "yaml-json-converter"]);
    expect(ids(sendTargets(getToolById("json-formatter")!, "json"))).toEqual(["json-csv-converter", "json-jsonl-converter", "json-path-tester", "json-to-types", "yaml-json-converter"]);
    expect(ids(sendTargets(getToolById("markdown-html-converter")!, "html"))).toEqual(["html-formatter"]);
    expect(ids(sendTargets(getToolById("html-formatter")!, "html"))).toEqual(["markdown-html-converter"]);
    expect(ids(sendTargets(getToolById("url-encoder")!, "text"))).toEqual([
      "base64-converter",
      "git-diff-viewer",
      "gitignore-generator",
      "hash-generator",
      "regex-tester",
      "semver-calculator",
      "text-diff-checker",
    ]);
  });

  it("sends the text diff checker's patch to the git diff viewer", () => {
    expect(ids(sendTargets(getToolById("text-diff-checker")!, "diff"))).toEqual(["git-diff-viewer"]);
  });

  it("ignores types the tool doesn't declare in produces", () => {
    expect(sendTargets(getToolById("jwt-decoder")!, "text")).toEqual([]);
  });

  it("returns nothing when no other tool consumes the type", () => {
    expect(sendTargets(getToolById("uuid-generator")!, "uuid")).toEqual([]);
  });
});

describe("tool data types", () => {
  it("don't repeat within a tool", () => {
    for (const tool of allTools) {
      expect(new Set(tool.consumes).size, `${tool.id} consumes`).toBe(tool.consumes.length);
      expect(new Set(tool.produces).size, `${tool.id} produces`).toBe(tool.produces.length);
    }
  });
});

describe("tool SEO fields", () => {
  // Page titles, meta descriptions and the sitemap are generated from these, so every tool needs them.
  it("are filled in for every tool", () => {
    for (const tool of allTools) {
      expect(tool.title.trim(), `${tool.id} title`).not.toBe("");
      expect(tool.description.trim().length, `${tool.id} description`).toBeGreaterThanOrEqual(20);
      expect(tool.description, `${tool.id} description ends with a full stop`).toMatch(/\.$/);
      expect(tool.keywords.length, `${tool.id} keywords`).toBeGreaterThanOrEqual(3);
    }
  });

  it("use unique titles", () => {
    const titles = allTools.map((tool) => tool.title.toLowerCase());
    expect(new Set(titles).size).toBe(titles.length);
  });
});
