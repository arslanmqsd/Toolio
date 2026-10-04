import { describe, expect, it } from "vitest";
import { command, danger } from "./test-helpers";

describe("merge and rebase tasks", () => {
  it("merges, optionally always with a merge commit", () => {
    expect(command("merge-branch", { branch: "feature/x" })).toBe("git merge feature/x");
    expect(command("merge-branch", { branch: "feature/x", noFf: true })).toBe("git merge --no-ff feature/x");
  });

  it("rebases onto main by default", () => {
    expect(command("rebase-branch")).toBe("git rebase main");
    expect(danger("rebase-branch")).toBe("caution");
  });

  it("continues whichever operation stopped", () => {
    expect(command("continue-after-conflict")).toBe("git add .\ngit merge --continue");
    expect(command("continue-after-conflict", { op: "rebase", paths: "a.ts" })).toBe("git add a.ts\ngit rebase --continue");
    expect(command("continue-after-conflict", { op: "cherry-pick" })).toBe("git add .\ngit cherry-pick --continue");
  });

  it("aborts merges and rebases", () => {
    expect(command("abort-merge")).toBe("git merge --abort");
    expect(command("abort-rebase")).toBe("git rebase --abort");
  });
});
