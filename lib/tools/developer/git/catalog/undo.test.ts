import { describe, expect, it } from "vitest";
import { commandText } from "../build";
import { command, danger, resolve } from "./test-helpers";

describe("undo tasks", () => {
  it("unstages all files or the given ones, quoting globs", () => {
    expect(command("unstage-files")).toBe("git restore --staged .");
    expect(command("unstage-files", { paths: "src/app.ts README.md" })).toBe("git restore --staged src/app.ts README.md");
    expect(command("unstage-files", { paths: "src/*.ts" })).toBe("git restore --staged 'src/*.ts'");
  });

  it("discards file changes destructively", () => {
    expect(command("discard-file-changes")).toBe("git restore .");
    expect(danger("discard-file-changes")).toBe("destructive");
  });

  it("resets soft, mixed and hard", () => {
    expect(command("reset-soft")).toBe("git reset --soft HEAD~1");
    expect(command("reset-soft", { count: "3" })).toBe("git reset --soft HEAD~3");
    expect(danger("reset-soft")).toBe("caution");
    expect(command("reset-mixed")).toBe("git reset HEAD~1");
    expect(command("reset-hard")).toBe("git reset --hard HEAD~1");
    expect(danger("reset-hard")).toBe("destructive");
  });

  it("shows a placeholder when the count is cleared", () => {
    const r = resolve("reset-soft", { count: "" });
    expect(r.status).toBe("incomplete");
    if (r.status === "incomplete") expect(commandText(r.steps)).toBe("git reset --soft HEAD~<n>");
  });

  it("reverts, restores and recovers", () => {
    expect(command("revert-commit")).toBe("git revert HEAD");
    expect(command("restore-file-from-commit", { commit: "HEAD~2", path: "src/app.ts" })).toBe(
      "git restore --source=HEAD~2 src/app.ts",
    );
    expect(command("reset-to-remote")).toBe("git fetch origin\ngit reset --hard origin/main");
    expect(command("recover-lost-commit", { commit: "a1b2c3d", branch: "rescued" })).toBe(
      "git reflog\ngit switch -c rescued a1b2c3d",
    );
  });
});
