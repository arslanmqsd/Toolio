import { describe, expect, it } from "vitest";
import { command } from "./test-helpers";

describe("inspect tasks", () => {
  it("shows status and history", () => {
    expect(command("status")).toBe("git status");
    expect(command("log-graph")).toBe("git log --oneline --graph --decorate");
    expect(command("log-graph", { all: true })).toBe("git log --oneline --graph --decorate --all");
  });

  it("diffs unstaged, staged or between two refs", () => {
    expect(command("diff")).toBe("git diff");
    expect(command("diff", { mode: "staged" })).toBe("git diff --staged");
    expect(command("diff", { mode: "between", from: "main", to: "feature/x" })).toBe("git diff main feature/x");
  });

  it("shows commits and blame", () => {
    expect(command("show-commit")).toBe("git show HEAD");
    expect(command("blame", { path: "src/app.ts" })).toBe("git blame src/app.ts");
  });

  it("searches messages and code", () => {
    expect(command("search-commit-messages", { text: "login bug" })).toBe("git log --grep='login bug' -i");
    expect(command("find-code-change", { text: "parseUser" })).toBe("git log -S parseUser");
  });

  it("starts a bisect in three steps", () => {
    expect(command("bisect-start", { good: "v1.0.0" })).toBe("git bisect start\ngit bisect bad HEAD\ngit bisect good v1.0.0");
  });
});
