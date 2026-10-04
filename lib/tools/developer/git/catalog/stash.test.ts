import { describe, expect, it } from "vitest";
import { command, danger } from "./test-helpers";

describe("stash tasks", () => {
  it("stashes, optionally with untracked files and a label", () => {
    expect(command("stash-changes")).toBe("git stash push");
    expect(command("stash-changes", { untracked: true, message: "wip login" })).toBe("git stash push -u -m 'wip login'");
  });

  it("lists, shows, applies and pops by number", () => {
    expect(command("list-stashes")).toBe("git stash list");
    expect(command("show-stash")).toBe("git stash show -p stash@{0}");
    expect(command("apply-stash", { index: "2" })).toBe("git stash apply stash@{2}");
    expect(command("pop-stash")).toBe("git stash pop stash@{0}");
  });

  it("drops and clears destructively", () => {
    expect(command("drop-stash")).toBe("git stash drop stash@{0}");
    expect(danger("drop-stash")).toBe("destructive");
    expect(command("clear-stashes")).toBe("git stash clear");
    expect(danger("clear-stashes")).toBe("destructive");
  });
});
