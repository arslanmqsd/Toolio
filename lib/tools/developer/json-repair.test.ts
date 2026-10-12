import { describe, expect, it } from "vitest";
import { repairJson, rewriteJson } from "./json-repair";

describe("rewriteJson", () => {
  it("turns single quotes into double quotes, escaping and unescaping quotes inside", () => {
    expect(rewriteJson(`{'name': 'it\\'s "ok"', 'tab': 'a\\tb'}`).text).toBe(`{"name": "it's \\"ok\\"", "tab": "a\\tb"}`);
  });

  it("quotes unquoted property names but not true, false or null values", () => {
    expect(rewriteJson("{ id: 1, $ref /* x */ : true, ok: null }").text).toBe('{ "id": 1, "$ref"  : true, "ok": null }');
  });

  it("removes trailing commas and comments, leaving double-quoted strings alone", () => {
    const { text, counts } = rewriteJson('{\n  "a": "// not a comment, }", // note\n  "b": [1, 2,],\n}');
    expect(text).toBe('{\n  "a": "// not a comment, }", \n  "b": [1, 2]\n}');
    expect(counts).toEqual({ singleQuoted: 0, unquotedKeys: 0, trailingCommas: 2, comments: 1 });
  });

  it("leaves an unclosed single-quoted string for the parser", () => {
    expect(rewriteJson("{'a': 'b}").text).toBe(`{"a": 'b}`);
  });
});

describe("repairJson", () => {
  it("returns fixed JSON and what changed", () => {
    expect(repairJson("{'a': 1, b: 'two',}")).toEqual({
      text: '{"a": 1, "b": "two"}',
      summary: "Convert 2 single-quoted strings to double quotes, quote 1 property name and remove 1 trailing comma",
    });
  });

  it("returns null when nothing changes or the result still isn't valid", () => {
    expect(repairJson('{"a": }')).toBeNull();
    expect(repairJson("{'a': undefined}")).toBeNull();
  });
});
