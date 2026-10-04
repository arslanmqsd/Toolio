import { describe, expect, it } from "vitest";
import { command, danger, resolve } from "./test-helpers";

describe("commit tasks", () => {
  it("commits with a subject and optional body", () => {
    expect(command("commit-staged", { subject: "Add login form" })).toBe("git commit -m 'Add login form'");
    expect(command("commit-staged", { subject: "Fix crash", body: "Null check on user." })).toBe(
      "git commit -m 'Fix crash' -m 'Null check on user.'",
    );
  });

  it("passes shell metacharacters through literally", () => {
    expect(command("commit-staged", { subject: "don't expand $HOME or `ls`" })).toBe(
      "git commit -m 'don'\\''t expand $HOME or `ls`'",
    );
  });

  it("stages everything before committing", () => {
    expect(command("commit-all", { subject: "Add login form" })).toBe("git add -A\ngit commit -m 'Add login form'");
  });

  it("amends the last commit", () => {
    expect(command("amend-message", { subject: "Fix typo" })).toBe("git commit --amend -m 'Fix typo'");
    expect(danger("amend-message", { subject: "Fix typo" })).toBe("caution");
    expect(command("amend-add-files")).toBe("git add .\ngit commit --amend --no-edit");
    expect(command("amend-add-files", { paths: "a.ts b.ts" })).toBe("git add a.ts b.ts\ngit commit --amend --no-edit");
  });

  it("squashes at least two commits", () => {
    expect(command("squash-last-n", { subject: "Add search" })).toBe("git reset --soft HEAD~2\ngit commit -m 'Add search'");
    expect(resolve("squash-last-n", { subject: "Add search", count: "1" })).toEqual({
      status: "invalid",
      errors: { count: "Enter a whole number, 2 or more." },
    });
  });

  it("rebases, fixes up, cherry-picks and makes empty commits", () => {
    expect(command("interactive-rebase")).toBe("git rebase -i HEAD~3");
    expect(command("fixup-commit", { target: "abc1234" })).toBe(
      "git commit --fixup=abc1234\ngit rebase -i --autosquash abc1234~1",
    );
    expect(command("cherry-pick", { commit: "abc1234" })).toBe("git cherry-pick abc1234");
    expect(command("empty-commit", { subject: "Trigger CI" })).toBe("git commit --allow-empty -m 'Trigger CI'");
  });
});
