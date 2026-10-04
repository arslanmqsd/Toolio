import { describe, expect, it } from "vitest";
import { integerError, pathError, pathsError, refNameError, revisionError, singleLineError, urlError } from "./ref-name";

describe("refNameError", () => {
  it.each(["main", "feature/user-profile", "v1.2.0", "fix-123", "release/2026.10", "a'b"])("accepts %s", (name) => {
    expect(refNameError(name)).toBeNull();
  });

  it.each([
    ["my branch", "Can't contain spaces."],
    ["a\u0001b", "Can't contain control characters."],
    ["-f", "Can't start with -."],
    ["a~b", "Can't contain ~."],
    ["a^b", "Can't contain ^."],
    ["a:b", "Can't contain :."],
    ["a?b", "Can't contain ?."],
    ["a*b", "Can't contain *."],
    ["a[b", "Can't contain [."],
    ["a\\b", "Can't contain \\."],
    ["a..b", "Can't contain two dots in a row."],
    ["a@{b", "Can't contain @{."],
    ["@", "Can't be just @."],
    ["/a", "Can't start or end with /."],
    ["a/", "Can't start or end with /."],
    ["a//b", "Can't contain //."],
    [".hidden", "No part between slashes can start with a dot."],
    ["feature/.x", "No part between slashes can start with a dot."],
    ["a.lock", "Can't end with .lock."],
    ["a.", "Can't end with a dot."],
  ])("rejects %j: %s", (name, message) => {
    expect(refNameError(name)).toBe(message);
  });
});

describe("revisionError", () => {
  it("accepts hashes, refs and relative revisions", () => {
    for (const rev of ["a1b2c3d", "HEAD~2", "origin/main", "v1.0.0", "HEAD^"]) expect(revisionError(rev)).toBeNull();
  });
  it("rejects spaces and a leading dash", () => {
    expect(revisionError("a b")).toBe("Can't contain spaces.");
    expect(revisionError("--all")).toBe("Can't start with -.");
  });
});

describe("path validators", () => {
  it("allow spaces in a single path but not a leading dash", () => {
    expect(pathError("docs/My Notes.md")).toBeNull();
    expect(pathError("-rf")).toBe("Can't start with -.");
  });
  it("check every path in a list", () => {
    expect(pathsError("src/a.ts src/*.ts")).toBeNull();
    expect(pathsError("src/a.ts -rf")).toBe("Paths can't start with -.");
  });
});

describe("integerError", () => {
  it("accepts whole numbers at or above the minimum", () => {
    expect(integerError(1)("1")).toBeNull();
    expect(integerError(0)("0")).toBeNull();
    expect(integerError(2)("10")).toBeNull();
  });
  it.each(["0", "1.5", "abc", "-1"])("rejects %j for a minimum of 1", (value) => {
    expect(integerError(1)(value)).toBe("Enter a whole number, 1 or more.");
  });
});

describe("other validators", () => {
  it("check URLs and single lines", () => {
    expect(urlError("git@github.com:me/app.git")).toBeNull();
    expect(urlError("https://x.com/a b")).toBe("Can't contain spaces.");
    expect(urlError("-u")).toBe("Can't start with -.");
    expect(singleLineError("Fix login")).toBeNull();
    expect(singleLineError("a\nb")).toBe("Must be a single line.");
  });
});
