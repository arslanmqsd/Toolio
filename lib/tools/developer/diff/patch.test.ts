import { describe, expect, it } from "vitest";
import { generatePatch, patchFileName } from "./patch";

describe("generatePatch", () => {
  it("writes a unified patch that git apply accepts", () => {
    expect(generatePatch("a\nb\n", "a\nc\n", "original.txt", "modified.txt")).toBe(
      "--- a/original.txt\n+++ b/modified.txt\n@@ -1,2 +1,2 @@\n a\n-b\n+c\n",
    );
  });

  it("returns an empty string for identical texts", () => {
    expect(generatePatch("a\n", "a\n", "o", "m")).toBe("");
  });

  it("marks a missing final newline", () => {
    expect(generatePatch("a", "b", "o", "m")).toContain("\\ No newline at end of file");
  });

  it("compares exactly, whitespace included", () => {
    expect(generatePatch("a b\n", "a  b\n", "o", "m")).toContain("-a b\n+a  b\n");
  });

  it("returns null when the texts are too different to compare quickly", () => {
    const a = Array.from({ length: 20000 }, (_, i) => `a${i}`).join("\n");
    const b = Array.from({ length: 20000 }, (_, i) => `b${i}`).join("\n");
    expect(generatePatch(a, b, "o", "m", 1)).toBeNull();
  });
});

describe("patchFileName", () => {
  it.each([
    ["modified.txt", "modified.patch"],
    ["src/app.test.ts", "src/app.test.patch"],
    ["Makefile", "Makefile.patch"],
    [".env", "changes.patch"],
  ])("%s → %s", (name, expected) => {
    expect(patchFileName(name)).toBe(expected);
  });
});
