import { describe, expect, it } from "vitest";
import { command, danger } from "./test-helpers";

describe("branch tasks", () => {
  it("creates a branch, optionally from a start point", () => {
    expect(command("create-branch", { name: "feature/user-profile" })).toBe("git switch -c feature/user-profile");
    expect(command("create-branch", { name: "feature/user-profile", start: "origin/main" })).toBe(
      "git switch -c feature/user-profile origin/main",
    );
  });

  it("switches to local and remote branches", () => {
    expect(command("switch-branch", { name: "main" })).toBe("git switch main");
    expect(command("checkout-remote-branch", { branch: "feature/login" })).toBe("git switch --track origin/feature/login");
  });

  it("renames the current or a named branch", () => {
    expect(command("rename-branch", { new: "feature/new" })).toBe("git branch -m feature/new");
    expect(command("rename-branch", { old: "old", new: "new" })).toBe("git branch -m old new");
  });

  it("renames on the remote in three steps", () => {
    expect(command("rename-branch-remote", { old: "old", new: "new" })).toBe(
      ["git branch -m old new", "git push -u origin new", "git push origin --delete old"].join("\n"),
    );
    expect(danger("rename-branch-remote", { old: "old", new: "new" })).toBe("caution");
  });

  it("deletes safely unless forced", () => {
    expect(command("delete-branch", { name: "old" })).toBe("git branch -d old");
    expect(danger("delete-branch", { name: "old" })).toBe("safe");
    expect(command("delete-branch", { name: "old", force: true })).toBe("git branch -D old");
    expect(danger("delete-branch", { name: "old", force: true })).toBe("destructive");
    expect(command("delete-remote-branch", { branch: "old" })).toBe("git push origin --delete old");
  });

  it("lists branches by scope", () => {
    expect(command("list-branches")).toBe("git branch");
    expect(command("list-branches", { scope: "remote" })).toBe("git branch -r");
    expect(command("list-branches", { scope: "all", verbose: true })).toBe("git branch -a -vv");
  });

  it("adds a worktree for an existing or a new branch", () => {
    expect(command("add-worktree", { path: "../hotfix", branch: "hotfix" })).toBe("git worktree add ../hotfix hotfix");
    expect(command("add-worktree", { path: "../hotfix", branch: "hotfix", create: true })).toBe(
      "git worktree add -b hotfix ../hotfix",
    );
  });
});
