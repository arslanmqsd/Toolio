import { describe, expect, it } from "vitest";
import { filePath, MAX_GIT_DIFF_BYTES, parseGitDiff } from "./git-parse";
import { GIT_DIFF_SAMPLE } from "./git-sample";
import type { DiffFile, Row } from "@/lib/diff/model";

function files(text: string): DiffFile[] {
  const result = parseGitDiff(text);
  if (!result.ok) throw new Error(`not parsed: ${result.reason}`);
  return result.files;
}

const summary = (list: DiffFile[]) => list.map((f) => [filePath(f), f.status, f.binary, f.stats.added, f.stats.removed]);
const brief = (rows: Row[]) => rows.map((r) => `${r.kind[0]} ${r.oldNo ?? "-"} ${r.newNo ?? "-"} ${r.text}`);

const SAMPLE_SUMMARY = [
  ["src/greet.ts", "modified", false, 5, 2],
  ["lib/old-utils.ts → lib/utils.ts", "renamed", false, 1, 1],
  ["public/logo.png", "added", true, 0, 0],
];

describe("parseGitDiff", () => {
  it("reads a modified file, a rename and a new binary file", () => {
    expect(summary(files(GIT_DIFF_SAMPLE))).toEqual(SAMPLE_SUMMARY);
  });

  it("reads Windows line endings like Unix ones", () => {
    expect(summary(files(GIT_DIFF_SAMPLE.replace(/\n/g, "\r\n")))).toEqual(SAMPLE_SUMMARY);
  });

  it("keeps real line numbers and strips the diff markers", () => {
    const [greet] = files(GIT_DIFF_SAMPLE);
    expect(greet.hunks[0].header).toBe("@@ -1,6 +1,6 @@");
    expect(brief(greet.hunks[0].rows)).toEqual([
      "c 1 1 export function greet(name: string) {",
      'r 2 -   return "Hello " + name;',
      "a - 2   return `Hello ${name}`;",
      "c 3 3 }",
      "c 4 4 ",
      "c 5 5 export function shout(name: string) {",
      "c 6 6   return greet(name).toUpperCase();",
    ]);
  });

  it("notes the old-side lines between hunks", () => {
    const [greet] = files(GIT_DIFF_SAMPLE);
    expect(greet.hunks.map((h) => h.skippedBefore)).toEqual([undefined, { from: 7, to: 19 }]);
  });

  it("pairs changed lines for word marks", () => {
    const [greet] = files(GIT_DIFF_SAMPLE);
    expect(greet.hunks[0].rows[1].words).toBeDefined();
    expect(greet.hunks[0].rows[2].words).toBeDefined();
  });

  it("reads a mode-only change and a deleted file", () => {
    const text = [
      "diff --git a/run.sh b/run.sh",
      "old mode 100644",
      "new mode 100755",
      "diff --git a/old.txt b/old.txt",
      "deleted file mode 100644",
      "index abc1234..0000000",
      "--- a/old.txt",
      "+++ /dev/null",
      "@@ -1,2 +0,0 @@",
      "-x",
      "-y",
      "\\ No newline at end of file",
      "",
    ].join("\n");
    const list = files(text);
    expect(summary(list)).toEqual([
      ["run.sh", "mode", false, 0, 0],
      ["old.txt", "deleted", false, 0, 2],
    ]);
    expect(list[1].hunks[0].rows).toHaveLength(2);
  });

  it("skips the commit header of git show output", () => {
    const text = [
      "commit 0123456789abcdef0123456789abcdef01234567",
      "Author: Ada <ada@example.com>",
      "Date:   Mon Oct 4 10:00:00 2026 +0000",
      "",
      "    Fix the greeting",
      "",
      "diff --git a/a.ts b/a.ts",
      "index 1111111..2222222 100644",
      "--- a/a.ts",
      "+++ b/a.ts",
      "@@ -1 +1 @@",
      "-a",
      "+b",
      "",
    ].join("\n");
    expect(summary(files(text))).toEqual([["a.ts", "modified", false, 1, 1]]);
  });

  it("keeps spaces in file paths", () => {
    const text = [
      "diff --git a/my notes.md b/my notes.md",
      "index 1111111..2222222 100644",
      "--- a/my notes.md",
      "+++ b/my notes.md",
      "@@ -1 +1 @@",
      "-a",
      "+b",
      "",
    ].join("\n");
    expect(files(text).map(filePath)).toEqual(["my notes.md"]);
  });

  it("refuses combined merge diffs", () => {
    expect(parseGitDiff("diff --cc file.txt\nindex 1111111,2222222..3333333\n")).toEqual({ ok: false, reason: "combined" });
  });

  it("finds nothing in plain text", () => {
    expect(parseGitDiff("hello world\nnot a diff")).toEqual({ ok: false, reason: "empty" });
  });

  it("refuses input over 5 MB", () => {
    expect(parseGitDiff("a".repeat(MAX_GIT_DIFF_BYTES + 1))).toEqual({ ok: false, reason: "too-large" });
  });
});
