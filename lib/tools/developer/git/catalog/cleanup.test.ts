import { describe, expect, it } from "vitest";
import { command, danger } from "./test-helpers";

describe("cleanup tasks", () => {
  it("previews and cleans untracked files", () => {
    expect(command("preview-clean")).toBe("git clean -n -d");
    expect(command("clean-untracked")).toBe("git clean -f");
    expect(command("clean-untracked", { dirs: true, ignored: true })).toBe("git clean -f -d -x");
    expect(danger("clean-untracked")).toBe("destructive");
  });

  it("prunes stale remote-tracking branches", () => {
    expect(command("prune-remote-branches")).toBe("git remote prune origin");
  });

  it("deletes merged branches, escaping the base for grep", () => {
    expect(command("delete-merged-branches")).toBe(
      "git branch --merged main | grep -vE '^[*+]|^[[:space:]]*main$' | xargs git branch -d",
    );
    expect(command("delete-merged-branches", { base: "release-1.0" })).toBe(
      "git branch --merged release-1.0 | grep -vE '^[*+]|^[[:space:]]*release-1\\.0$' | xargs git branch -d",
    );
  });
});
