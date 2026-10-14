import { describe, expect, it } from "vitest";
import { parseJson } from "@/lib/tools/developer/json-format";
import { flatten, formatPath, valueHint } from "./inspect";

const node = (text: string) => {
  const r = parseJson(text);
  if (!r.ok) throw new Error(r.error.message);
  return r.value;
};

describe("formatPath", () => {
  it("writes JavaScript and JSONPath paths, quoting awkward keys", () => {
    expect(formatPath(["data", "object", "amount"], "js")).toBe("data.object.amount");
    expect(formatPath(["items", 0, "content-type"], "js")).toBe('items[0]["content-type"]');
    expect(formatPath(["items", 0, "it's"], "jsonpath")).toBe("$.items[0]['it\\'s']");
    expect(formatPath([0, "id"], "js")).toBe("[0].id");
    expect(formatPath([], "js")).toBe("(root)");
    expect(formatPath([], "jsonpath")).toBe("$");
  });
});

describe("valueHint", () => {
  it("spots timestamps, dates, ids, URLs and numbers in strings", () => {
    expect(valueHint(node("1700000000"))).toBe("Unix time? 2023-11-14 22:13:20 UTC");
    expect(valueHint(node("1700000000123"))).toBe("Unix time in ms? 2023-11-14 22:13:20.123 UTC");
    expect(valueHint(node("4900"))).toBeUndefined();
    expect(valueHint(node('"2026-01-01T12:00:00Z"'))).toBe("ISO 8601 date");
    expect(valueHint(node('"72d3162e-cc78-11e3-81ab-4c9367dc0958"'))).toBe("UUID");
    expect(valueHint(node('"https://example.com/x"'))).toBe("URL");
    expect(valueHint(node('"jane@example.com"'))).toBe("Email");
    expect(valueHint(node('"49.00"'))).toBe("Number as a string");
  });
});

describe("flatten", () => {
  it("lists every field depth first with counts", () => {
    const { rows, truncated, total } = flatten(node('{"a":{"b":[1,"x"]},"c":null}'));
    expect(rows.map((r) => [formatPath(r.path, "js"), r.type, r.preview])).toEqual([
      ["(root)", "object", "{2}"],
      ["a", "object", "{1}"],
      ["a.b", "array", "[2]"],
      ["a.b[0]", "number", "1"],
      ["a.b[1]", "string", '"x"'],
      ["c", "null", "null"],
    ]);
    expect([truncated, total]).toEqual([false, 6]);
  });

  it("stops at the limit but counts everything", () => {
    const f = flatten(node(`[${Array(10).fill(0).join(",")}]`), 4);
    expect([f.rows.length, f.truncated, f.total]).toEqual([4, true, 11]);
  });
});
