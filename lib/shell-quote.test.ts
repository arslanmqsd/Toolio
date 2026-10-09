import { describe, expect, it } from "vitest";
import { quote } from "./shell-quote";

describe("quote", () => {
  it.each(["feature/user-profile", "HEAD~2", "origin/main", "v1.2.3", "git@github.com:me/app.git", "a,b", "50%"])(
    "leaves %s bare",
    (arg) => {
      expect(quote(arg)).toBe(arg);
    },
  );

  it.each([
    ["fix login", "'fix login'"],
    ["", "''"],
    ["-f", "'-f'"],
    ["~/repo", "'~/repo'"],
    ["src/*.ts", "'src/*.ts'"],
    ["$HOME", "'$HOME'"],
    ["{a,b}", "'{a,b}'"],
    ["=ls", "'=ls'"],
    ["a=~b", "'a=~b'"],
    ["HEAD^", "'HEAD^'"],
    ["café", "'café'"],
    ["a;rm -rf /", "'a;rm -rf /'"],
  ])("quotes %j as %s", (arg, expected) => {
    expect(quote(arg)).toBe(expected);
  });

  it("closes, escapes and reopens around single quotes", () => {
    expect(quote("don't")).toBe("'don'\\''t'");
  });
});
