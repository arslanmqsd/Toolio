import { describe, expect, it } from "vitest";
import { LANGUAGES, languageForFile } from "./language";

describe("languageForFile", () => {
  it.each([
    ["src/app.ts", "typescript"],
    ["App.TSX", "typescript"],
    ["index.mjs", "javascript"],
    ["data.json", "json"],
    ["styles.scss", "css"],
    ["page.html", "xml"],
    ["main.py", "python"],
    ["main.go", "go"],
    ["query.sql", "sql"],
    [".github/ci.yml", "yaml"],
    ["deploy.sh", "bash"],
    ["home/.zshrc", "bash"],
    ["README.md", "markdown"],
  ])("%s → %s", (path, expected) => {
    expect(languageForFile(path)).toBe(expected);
  });

  it.each([["Dockerfile"], ["notes.txt"], [".env"], ["Makefile"]])("%s → plain text", (path) => {
    expect(languageForFile(path)).toBeNull();
  });

  it("offers 11 distinct languages", () => {
    expect(new Set(LANGUAGES.map((l) => l.id)).size).toBe(11);
  });
});
