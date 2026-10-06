import { describe, expect, it } from "vitest";
import { checkPathSyntax, evaluateJsonPath, formatPointer, queryJsonPath } from "./json-path";

const store = {
  store: {
    book: [
      { title: "A", author: "Ann", price: 8 },
      { title: "B", author: "Bo", price: 15 },
      { title: "C", author: "Cy", price: 9 },
    ],
    bicycle: { color: "red", price: 20 },
  },
};

function paths(path: string, json: unknown = store) {
  const result = queryJsonPath(json, path);
  if (!result.ok) throw new Error(`unexpected error: ${result.error.message}`);
  return result.matches.map((m) => m.path);
}

function values(path: string, json: unknown = store) {
  const result = queryJsonPath(json, path);
  if (!result.ok) throw new Error(`unexpected error: ${result.error.message}`);
  return result.matches.map((m) => m.value);
}

describe("queryJsonPath", () => {
  it("runs a filter", () => {
    expect(values("$.store.book[?(@.price<10)].title")).toEqual(["A", "C"]);
  });

  it("gives each match's concrete path in dot notation", () => {
    expect(paths("$.store.book[*].author")).toEqual(["$.store.book[0].author", "$.store.book[1].author", "$.store.book[2].author"]);
  });

  it("covers root, child, recursive descent, wildcard, index and slice", () => {
    expect(paths("$")).toEqual(["$"]);
    expect(values("$.store.bicycle.color")).toEqual(["red"]);
    expect(values("$..price")).toEqual([8, 15, 9, 20]);
    expect(paths("$.store.*")).toEqual(["$.store.book", "$.store.bicycle"]);
    expect(values("$.store.book[1].title")).toEqual(["B"]);
    expect(values("$.store.book[0:2].title")).toEqual(["A", "B"]);
    expect(values("$.store.book[-1:].title")).toEqual(["C"]);
    expect(values("$['store']['bicycle']['color']")).toEqual(["red"]);
  });

  it("returns no matches, not an error, for a valid path that matches nothing", () => {
    expect(queryJsonPath(store, "$.store.nothing")).toEqual({ ok: true, matches: [] });
    expect(queryJsonPath(store, "$.store.book[?(@.price>100)]")).toEqual({ ok: true, matches: [] });
  });

  it("filters over mixed values without failing on primitives", () => {
    expect(values("$..[?(@.price<10)].title")).toEqual(["A", "C"]);
  });

  it("treats an item a filter can't read as not matching it", () => {
    const json = { list: [{ a: { b: 1 } }, { c: 2 }, 5, null] };
    expect(paths("$.list[?(@.a.b == 1)]", json)).toEqual(["$.list[0]"]);
  });

  it("matches falsy values", () => {
    expect(values("$.*", { a: 0, b: false, c: null, d: "" })).toEqual([0, false, null, ""]);
  });

  it("brackets keys that aren't plain names, and tells an object key \"0\" from an index", () => {
    const json = { "a b": 1, "it's": 2, "0": 3, "x.y": 4, "": 5, "~/": 6, list: [7] };
    expect(paths("$.*", json)).toEqual(["$['0']", "$['a b']", "$['it\\'s']", "$['x.y']", "$['']", "$['~/']", "$.list"]);
    expect(paths("$.list[0]", json)).toEqual(["$.list[0]"]);
  });
});

describe("path syntax errors", () => {
  const invalid = [
    "$.store[",
    "$.store.book[0",
    "$.store.book[0]]",
    "$.store.",
    "$.store..",
    "$...store",
    "$.",
    "store.book",
    "@.price",
    "$.store.book[?(@.price<10]",
    "$.store.book[?(@.price<10))]",
    "$['store]",
    "$.store.book[]",
    "$.store.book[?(@.price>)]",
    "$..[?(@.price<",
    "$ .store",
  ];

  it.each(invalid)("reports %s as invalid, never as zero matches", (path) => {
    const result = queryJsonPath(store, path);
    expect(result.ok).toBe(false);
  });

  it("points at where the problem is", () => {
    expect(checkPathSyntax("$.store[")).toMatchObject({ offset: 7 });
    expect(checkPathSyntax("$.store.book[0]]")).toMatchObject({ offset: 15 });
    expect(checkPathSyntax("store")).toMatchObject({ offset: 0 });
    expect(checkPathSyntax("$['store]")).toMatchObject({ offset: 2 });
  });

  it("allows brackets and quotes inside strings and filters", () => {
    expect(checkPathSyntax("$['a]b']")).toBeNull();
    expect(checkPathSyntax(`$[?(@.title == "x)y")]`)).toBeNull();
    expect(checkPathSyntax("$[?(@.title.match(/[A-C]/))]")).toBeNull();
    expect(checkPathSyntax("$.store.book[0:2]")).toBeNull();
    expect(checkPathSyntax("$..book[*]")).toBeNull();
  });

  it("reports a filter that doesn't parse", () => {
    expect(queryJsonPath(store, "$.store.book[?(@.price ==== 1)]")).toMatchObject({ ok: false, error: { message: expect.stringContaining("Expected expression") } });
  });
});

describe("untrusted paths can't run code", () => {
  const attacks = [
    "$[?(@.constructor.constructor('globalThis.__jsonPathPwned = 1')())]",
    "$.store.book[?(@.title.constructor.constructor('globalThis.__jsonPathPwned = 1')())]",
    "$[?(@['constructor']['constructor']('globalThis.__jsonPathPwned = 1')())]",
    "$[?(eval('globalThis.__jsonPathPwned = 1'))]",
    "$[?(Function('globalThis.__jsonPathPwned = 1')())]",
    "$[?(globalThis.__jsonPathPwned = 1)]",
    "$[?(this.__jsonPathPwned = 1)]",
    "$[?(@.__proto__.__jsonPathPwned = 1)]",
    "$[(@.constructor.constructor('globalThis.__jsonPathPwned = 1')())]",
  ];

  it.each(attacks)("blocks %s", (path) => {
    const result = queryJsonPath(store, path);
    expect((globalThis as Record<string, unknown>).__jsonPathPwned).toBeUndefined();
    expect(({} as Record<string, unknown>).__jsonPathPwned).toBeUndefined();
    // Either rejected outright or matching nothing; never a value produced by running the code.
    if (result.ok) expect(result.matches).toEqual([]);
  });
});

describe("evaluateJsonPath", () => {
  it("parses the document and queries it", () => {
    const result = evaluateJsonPath('{"a":[1,2]}', "$.a[*]");
    expect(result).toMatchObject({ kind: "matches", total: 2, matches: [{ path: "$.a[0]", json: "1" }, { path: "$.a[1]", json: "2" }] });
    if (result.kind === "matches") expect(JSON.parse(result.valuesJson)).toEqual([1, 2]);
  });

  it("reports invalid JSON with its position, separately from path errors", () => {
    expect(evaluateJsonPath('{"a":', "$.a")).toMatchObject({ kind: "json-error", error: { line: 1 } });
    expect(evaluateJsonPath('{"a":1}', "$.a[")).toMatchObject({ kind: "path-error" });
  });

  it("waits for a path", () => {
    expect(evaluateJsonPath('{"a":1}', "  ")).toEqual({ kind: "no-path" });
  });

  it("lists only the first matches but copies them all", () => {
    const big = JSON.stringify(Array.from({ length: 1500 }, (_, i) => i));
    const result = evaluateJsonPath(big, "$[*]");
    expect(result).toMatchObject({ kind: "matches", total: 1500 });
    if (result.kind === "matches") {
      expect(result.matches).toHaveLength(1000);
      expect(JSON.parse(result.valuesJson)).toHaveLength(1500);
    }
  });

  it("shortens a long match's preview, never the copied values", () => {
    const long = "x".repeat(5000);
    const result = evaluateJsonPath(JSON.stringify({ a: long }), "$.a");
    expect(result).toMatchObject({ kind: "matches", matches: [{ shortened: true }] });
    if (result.kind === "matches") {
      expect(result.matches[0].json.length).toBeLessThan(2100);
      expect(JSON.parse(result.valuesJson)).toEqual([long]);
    }
  });

  it("notes numbers too large to keep exactly", () => {
    expect(evaluateJsonPath('{"id":9007199254740993}', "$.id")).toMatchObject({ kind: "matches", unsafeIntegers: 1 });
  });
});

describe("formatPointer", () => {
  it("unescapes ~0 and ~1", () => {
    expect(formatPointer({ "~/": { a: 1 } }, "/~0~1/a")).toBe("$['~/'].a");
  });
});
