import { describe, expect, it } from "vitest";
import { command, danger } from "./test-helpers";

describe("remote tasks", () => {
  it("adds, changes and lists remotes", () => {
    expect(command("add-remote", { url: "git@github.com:me/app.git" })).toBe("git remote add origin git@github.com:me/app.git");
    expect(command("change-remote-url", { url: "https://github.com/me/app.git" })).toBe(
      "git remote set-url origin https://github.com/me/app.git",
    );
    expect(command("list-remotes")).toBe("git remote -v");
  });

  it("pushes, with upstream for new branches", () => {
    expect(command("push")).toBe("git push");
    expect(command("push-set-upstream", { branch: "feature/x" })).toBe("git push -u origin feature/x");
  });

  it("force pushes with a lease unless told otherwise", () => {
    expect(command("force-push", { branch: "feature/x" })).toBe("git push --force-with-lease origin feature/x");
    expect(danger("force-push", { branch: "feature/x" })).toBe("caution");
    expect(command("force-push", { branch: "feature/x", noLease: true })).toBe("git push --force origin feature/x");
    expect(danger("force-push", { branch: "feature/x", noLease: true })).toBe("destructive");
  });

  it("fetches from all remotes or one, optionally pruning", () => {
    expect(command("fetch")).toBe("git fetch --all");
    expect(command("fetch", { remote: "upstream", prune: true })).toBe("git fetch upstream --prune");
  });

  it("pulls and sets upstream", () => {
    expect(command("pull")).toBe("git pull");
    expect(command("pull", { rebase: true })).toBe("git pull --rebase");
    expect(command("set-upstream", { branch: "main" })).toBe("git branch --set-upstream-to=origin/main");
  });
});
