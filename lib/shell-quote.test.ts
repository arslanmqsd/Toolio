import { describe, expect, it } from "vitest";
import { quote, quoteFor, quotePowerShell, splitWords } from "./shell-quote";

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

describe("quotePowerShell", () => {
  it.each(["nginx:1.27", "8080:80", "NODE_ENV=production", "ghcr.io/me/app:1.0", "/var/lib/data", "1000:1000", "a-b"])("leaves %s bare", (arg) => {
    expect(quotePowerShell(arg)).toBe(arg);
  });

  it.each([
    ["", "''"],
    ["hello world", "'hello world'"],
    ["$env:HOME", "'$env:HOME'"],
    ["a,b", "'a,b'"],
    ["@args", "'@args'"],
    ["-x", "'-x'"],
    ["./src:/app", "'./src:/app'"],
    ["{{.State.Status}}", "'{{.State.Status}}'"],
    ["a;Remove-Item -Recurse C:\\", "'a;Remove-Item -Recurse C:\\'"],
    ["`whoami`", "'`whoami`'"],
    ["(Get-Date)", "'(Get-Date)'"],
  ])("quotes %j as %s", (arg, expected) => {
    expect(quotePowerShell(arg)).toBe(expected);
  });

  it("doubles single quotes, curly ones included", () => {
    expect(quotePowerShell("don't")).toBe("'don''t'");
    expect(quotePowerShell("it’s")).toBe("'it’’s'");
  });

  it("picks the quoting for the shell", () => {
    expect(quoteFor("posix")("a b")).toBe("'a b'");
    expect(quoteFor("powershell")("a,b")).toBe("'a,b'");
    expect(quoteFor("posix")("a,b")).toBe("a,b");
  });
});

describe("splitWords", () => {
  const words = (text: string) => {
    const r = splitWords(text);
    return r.ok ? r.words : r.error;
  };

  it("splits like bash, without expanding anything", () => {
    expect(words("  npm   run start ")).toEqual(["npm", "run", "start"]);
    expect(words("sh -c 'echo $HOME; ls'")).toEqual(["sh", "-c", "echo $HOME; ls"]);
    expect(words(`echo "a \\"b\\" \\\\ c" d\\ e`)).toEqual(["echo", 'a "b" \\ c', "d e"]);
    expect(words("a''b ''")).toEqual(["ab", ""]);
  });

  it("reports unclosed quotes", () => {
    expect(words("echo 'hi")).toBe("A ' quote isn't closed.");
    expect(words('echo "hi')).toBe('A " quote isn\'t closed.');
  });
});
