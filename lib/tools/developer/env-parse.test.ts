import { describe, expect, it } from "vitest";
import { checkValue, inferSecret, inferType, parseEnv } from "./env-parse";

const values = (text: string) => Object.fromEntries(parseEnv(text).vars.map((v) => [v.key, v.value]));

describe("parseEnv", () => {
  it("reads plain, quoted and exported values", () => {
    expect(
      values(`# comment
PLAIN=hello world
export EXPORTED=yes
SINGLE='say "hi" to $HOME \\n'
DOUBLE="line1\\nline2 \\"quoted\\""
BACKTICK=\`raw \\n\`
EMPTY=
SPACED = padded   `),
    ).toEqual({
      PLAIN: "hello world",
      EXPORTED: "yes",
      SINGLE: 'say "hi" to $HOME \\n',
      DOUBLE: 'line1\nline2 "quoted"',
      BACKTICK: "raw \\n",
      EMPTY: "",
      SPACED: "padded",
    });
  });

  it("strips inline comments only from unquoted values, and only after whitespace", () => {
    expect(values(`A=value # note\nB="value # kept"\nC=pass#word`)).toEqual({ A: "value", B: "value # kept", C: "pass#word" });
  });

  it("reads multi-line quoted values", () => {
    const { vars, issues } = parseEnv(`KEY="-----BEGIN KEY-----\nabc\n-----END KEY-----"\nNEXT=1`);
    expect(issues).toEqual([]);
    expect(vars.map((v) => [v.key, v.value, v.line])).toEqual([
      ["KEY", "-----BEGIN KEY-----\nabc\n-----END KEY-----", 1],
      ["NEXT", "1", 4],
    ]);
  });

  it("keeps the last value for repeated keys, at the first key's position, and warns", () => {
    const { vars, issues } = parseEnv("A=1\nB=2\nA=3");
    expect(vars.map((v) => [v.key, v.value])).toEqual([
      ["A", "3"],
      ["B", "2"],
    ]);
    expect(issues).toEqual([{ line: 3, severity: "warning", message: "A is set again here; the last value (line 3) wins." }]);
  });

  it("reports malformed lines and unclosed quotes with line numbers", () => {
    expect(parseEnv("GOOD=1\nnot a pair\n1BAD=x").issues).toEqual([
      { line: 2, severity: "error", message: "Expected KEY=value." },
      { line: 3, severity: "error", message: "1BAD isn't a valid name. Use letters, digits and _, not starting with a digit." },
    ]);
    expect(parseEnv('A="open\nB=2').issues).toEqual([{ line: 1, severity: "error", message: "The \" opened here is never closed." }]);
  });

  it("warns about text after a closing quote", () => {
    expect(parseEnv('A="x" y').issues).toEqual([{ line: 1, severity: "warning", message: "Text after the closing quote is ignored." }]);
  });

  it("handles Windows line endings", () => {
    expect(values("A=1\r\nB=two\r\n")).toEqual({ A: "1", B: "two" });
  });
});

describe("inferType", () => {
  it.each([
    ["PORT", "3000", "port"],
    ["DB_PORT", "70000", "integer"],
    ["WORKERS", "4", "integer"],
    ["FILE_MODE", "0755", "string"],
    ["RATIO", "0.75", "number"],
    ["DEBUG", "true", "boolean"],
    ["VERBOSE", "FALSE", "boolean"],
    ["DATABASE_URL", "postgres://u:p@localhost:5432/app", "url"],
    ["ADMIN_EMAIL", "ops@example.com", "email"],
    ["FLAGS", '{"beta":true}', "json"],
    ["ALLOWED_ORIGINS", "https://a.com,https://b.com", "list"],
    ["HOSTS", "a, b ,c", "list"],
    ["API_URL", "https://x.test/items?ids=1,2", "url"],
    ["TAGS", '["a","b"]', "json"],
    ["NAME", "Toolio", "string"],
    ["EMPTY", "", "string"],
  ])("%s=%s → %s", (key, value, type) => {
    expect(inferType(key, value)).toBe(type);
  });
});

describe("inferSecret", () => {
  it.each([
    ["API_KEY", "x", true],
    ["STRIPE_SECRET_KEY", "x", true],
    ["GITHUB_TOKEN", "x", true],
    ["DB_PASSWORD", "x", true],
    ["DATABASE_URL", "postgres://user:hunter2@db/app", true],
    ["DATABASE_URL", "postgres://db/app", false],
    ["PORT", "3000", false],
    ["TOKEN_TTL_SECONDS", "60", false],
  ])("%s=%s → %s", (key, value, secret) => {
    expect(inferSecret(key, value)).toBe(secret);
  });
});

describe("checkValue", () => {
  it("explains values that don't fit the chosen type", () => {
    expect(checkValue("integer", "abc")).toBe("Not a whole number.");
    expect(checkValue("port", "0")).toBe("Ports go from 1 to 65535.");
    expect(checkValue("boolean", "maybe")).toBe("Use true or false.");
    expect(checkValue("url", "example.com")).toBe("Not a full URL (it needs a scheme like https://).");
    expect(checkValue("json", "{bad")).toBe("Not valid JSON.");
    expect(checkValue("integer", "42")).toBeNull();
    expect(checkValue("integer", "")).toBeNull();
  });
});
