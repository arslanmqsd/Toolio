import { parse } from "yaml";
import { describe, expect, it } from "vitest";
import { jsonToYaml, yamlToJson, type Notice } from "./yaml-json";

function json(text: string, options: Parameters<typeof yamlToJson>[1] = {}) {
  const result = yamlToJson(text, options);
  if (!result.ok) throw new Error(`unexpected error: ${result.error.message}`);
  return result;
}

const kinds = (notices: Notice[]) => notices.map((n) => n.kind);

describe("yamlToJson", () => {
  it("converts a mapping, keeping key order", () => {
    expect(json("b: 1\na: [x, true, null]\nc: {d: 'e'}\n").output).toBe('{\n  "b": 1,\n  "a": [\n    "x",\n    true,\n    null\n  ],\n  "c": {\n    "d": "e"\n  }\n}');
  });

  it("indents as asked, or minifies", () => {
    expect(json("a: [1]", { indent: "    " }).output).toBe('{\n    "a": [\n        1\n    ]\n}');
    expect(json("a: [1]", { indent: "" }).output).toBe('{"a":[1]}');
  });

  it("reports syntax errors with a position", () => {
    const result = yamlToJson("a: 1\nb: [1, 2\n");
    expect(result).toMatchObject({ ok: false, error: { line: expect.any(Number), column: expect.any(Number) } });
    if (!result.ok) expect(result.error.message).not.toMatch(/\n/);
  });

  it("keeps big integers exact", () => {
    expect(json("id: 12345678901234567890").output).toBe('{\n  "id": 12345678901234567890\n}');
  });

  it("turns several documents into an array and says so", () => {
    const result = json("a: 1\n---\nb: 2\n");
    expect(JSON.parse(result.output)).toEqual([{ a: 1 }, { b: 2 }]);
    expect(result.documents).toBe(2);
    expect(kinds(result.notices)).toContain("documents");
  });

  it("applies merge keys and expands aliases", () => {
    const result = json("base: &b {a: 1, b: 2}\nchild:\n  <<: *b\n  b: 3\ncopy: *b\n");
    expect(JSON.parse(result.output)).toEqual({ base: { a: 1, b: 2 }, child: { a: 1, b: 3 }, copy: { a: 1, b: 2 } });
    expect(kinds(result.notices)).toEqual(["aliases"]);
  });

  it("refuses alias bombs", () => {
    const bomb = "a: &a [x,x,x,x,x,x,x,x,x]\nb: &b [*a,*a,*a,*a,*a,*a,*a,*a,*a]\nc: &c [*b,*b,*b,*b,*b,*b,*b,*b,*b]\nd: &d [*c,*c,*c,*c,*c,*c,*c,*c,*c]\ne: [*d,*d,*d,*d,*d,*d,*d,*d,*d]";
    expect(yamlToJson(bomb)).toMatchObject({ ok: false, error: { message: expect.stringMatching(/alias/i) } });
  });

  it("keeps a __proto__ key as data", () => {
    const result = json('"__proto__": {polluted: 1}\n');
    expect(result.output).toContain('"__proto__"');
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });

  it("flags values that read differently in YAML 1.1", () => {
    const result = json("country: NO\nenabled: on\ntime: 1:30\nmode: 0755\nname: plain\n");
    expect(JSON.parse(result.output)).toEqual({ country: "NO", enabled: "on", time: "1:30", mode: 755, name: "plain" });
    const versionNotices = result.notices.filter((n) => n.kind === "version");
    expect(versionNotices.map((n) => n.line)).toEqual([1, 2, 3, 4]);
    expect(versionNotices[0].message).toMatch(/NO/);
    expect(versionNotices[0].message).toMatch(/false/);
  });

  it("reads as YAML 1.1 when asked, flagging the 1.2 reading instead", () => {
    const result = json("country: NO\non: yes\n", { version: "1.1" });
    expect(JSON.parse(result.output)).toEqual({ country: false, true: true });
    expect(result.notices.filter((n) => n.kind === "version")).toHaveLength(3);
  });

  it("flags numbers that won't read the same in JSON", () => {
    const result = json("version: 1.10\nzip: 02134\nhex: 0x1F\ninf: .inf\nfine: 42\nfloat: 1.5\n");
    const numbers = result.notices.filter((n) => n.kind === "number");
    expect(numbers.map((n) => n.line)).toEqual([1, 2, 3, 4]);
    expect(numbers[0].message).toMatch(/1\.10.*1\.1/);
    expect(numbers[3].message).toMatch(/null/);
  });

  it("notes unknown tags, keys that aren't text, and comments", () => {
    const result = json("# top\nf: !!js/function 'function(){}'\n1: one\n? [a, b]\n: pair\n");
    expect(kinds(result.notices)).toEqual(expect.arrayContaining(["tag", "key", "comments"]));
    expect(JSON.parse(result.output)).toMatchObject({ f: "function(){}", "1": "one" });
  });

  it("gives empty YAML as null", () => {
    expect(json("# nothing here\n").output).toBe("null");
  });
});

describe("jsonToYaml", () => {
  function yaml(text: string, options: Parameters<typeof jsonToYaml>[1] = {}) {
    const result = jsonToYaml(text, options);
    if (!result.ok) throw new Error(`unexpected error: ${result.error.message}`);
    return result;
  }

  it("converts, keeping key order", () => {
    expect(yaml('{"b": 1, "a": [1, "x"], "c": {"d": null}}').output).toBe("b: 1\na:\n  - 1\n  - x\nc:\n  d: null\n");
  });

  it("quotes strings YAML would read as something else, for 1.1 readers too by default", () => {
    const out = yaml('{"a": "no", "b": "1.0", "c": "null", "d": "yes", "e": "0755", "f": "1:30", "g": "2001-12-14", "h": "", "i": "@x"}').output;
    expect(parse(out, { version: "1.1" })).toEqual({ a: "no", b: "1.0", c: "null", d: "yes", e: "0755", f: "1:30", g: "2001-12-14", h: "", i: "@x" });
    expect(parse(out)).toEqual(parse(out, { version: "1.1" }));
  });

  it("can quote for YAML 1.2 readers only", () => {
    expect(yaml('{"a": "no"}', { compat11: false }).output).toBe("a: no\n");
  });

  it("round-trips through YAML", () => {
    const value = { name: "Toolio", list: [1, 2.5, -3, true, false, null, "multi\nline", "  padded  ", "#hash", "- dash", "key: value"], nested: { "a b": { "": 0 } } };
    expect(JSON.parse(json(yaml(JSON.stringify(value)).output).output)).toEqual(value);
  });

  it("keeps big integers exact", () => {
    expect(yaml('{"id": 12345678901234567890}').output).toBe("id: 12345678901234567890\n");
  });

  it("keeps a __proto__ key as data", () => {
    const out = yaml('{"__proto__": {"polluted": 1}}').output;
    expect(out).toBe("__proto__:\n  polluted: 1\n");
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });

  it("indents as asked", () => {
    expect(yaml('{"a": {"b": [1]}}', { indent: 4 }).output).toBe("a:\n    b:\n        - 1\n");
  });

  it("doesn't fold long lines", () => {
    const long = "word ".repeat(40).trim();
    expect(yaml(JSON.stringify({ a: long })).output).toBe(`a: ${long}\n`);
  });

  it("reports invalid JSON with a position, and notes duplicate keys", () => {
    expect(jsonToYaml('{"a": }')).toMatchObject({ ok: false, error: { line: 1, column: 7 } });
    expect(yaml('{"a": 1, "a": 2}')).toMatchObject({ output: "a: 2\n", notices: [{ kind: "duplicate" }] });
  });
});
