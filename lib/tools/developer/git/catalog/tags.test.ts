import { describe, expect, it } from "vitest";
import { command, danger } from "./test-helpers";

describe("tag tasks", () => {
  it("creates lightweight and annotated tags", () => {
    expect(command("create-tag", { name: "v1.2.0" })).toBe("git tag v1.2.0");
    expect(command("create-tag", { name: "v1.2.0", commit: "abc1234" })).toBe("git tag v1.2.0 abc1234");
    expect(command("create-annotated-tag", { name: "v1.2.0", message: "Release 1.2.0" })).toBe(
      "git tag -a v1.2.0 -m 'Release 1.2.0'",
    );
  });

  it("lists tags, quoting the pattern so the shell doesn't expand it", () => {
    expect(command("list-tags")).toBe("git tag -l");
    expect(command("list-tags", { pattern: "v1.*" })).toBe("git tag -l 'v1.*'");
  });

  it("pushes one or all tags", () => {
    expect(command("push-tag", { name: "v1.2.0" })).toBe("git push origin v1.2.0");
    expect(command("push-all-tags")).toBe("git push origin --tags");
  });

  it("deletes tags, spelling out the remote ref", () => {
    expect(command("delete-tag", { name: "v1.2.0" })).toBe("git tag -d v1.2.0");
    expect(command("delete-remote-tag", { name: "v1.2.0" })).toBe("git push origin --delete refs/tags/v1.2.0");
    expect(danger("delete-remote-tag", { name: "v1.2.0" })).toBe("caution");
  });
});
