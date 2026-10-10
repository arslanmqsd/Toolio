import { describe, expect, it } from "vitest";
import { generateTypes, inferType, mergeTypes, pascalCase, singularize, type Language } from "./json-to-types";

const gen = (value: unknown, language: Language, rootName = "Root") => {
  const result = generateTypes(JSON.stringify(value), language, rootName);
  if (!result.ok) throw new Error(result.error);
  return result.code;
};

describe("inferType / mergeTypes", () => {
  it("widens integer + float to number", () => {
    expect(inferType([1, 2.5])).toEqual({ kind: "array", items: { kind: "number" } });
    expect(inferType([1, 2])).toEqual({ kind: "array", items: { kind: "integer" } });
  });

  it("treats an empty array's element type as unknown, and lets it absorb other types", () => {
    expect(inferType([])).toEqual({ kind: "array", items: { kind: "unknown" } });
    expect(mergeTypes(inferType([]), inferType(["a"]))).toEqual({ kind: "array", items: { kind: "string" } });
  });

  it("produces a flat union for mixed values", () => {
    expect(inferType(["a", 1, null, "b", 2])).toEqual({
      kind: "array",
      items: { kind: "union", types: [{ kind: "string" }, { kind: "integer" }, { kind: "null" }] },
    });
  });
});

describe("naming helpers", () => {
  it.each([
    ["user_name", "UserName"],
    ["userName", "UserName"],
    ["HTTPServer", "HttpServer"],
    ["first-name", "FirstName"],
    ["123abc", "Type123abc"],
    ["$$$", "Type"],
  ])("pascalCase(%j) = %j", (input, expected) => {
    expect(pascalCase(input)).toBe(expected);
  });

  it("applies Go initialisms", () => {
    expect(pascalCase("user_id", true)).toBe("UserID");
    expect(pascalCase("avatarUrl", true)).toBe("AvatarURL");
    expect(pascalCase("HTTPServer", true)).toBe("HTTPServer");
  });

  it.each([
    ["orders", "order"],
    ["categories", "category"],
    ["addresses", "address"],
    ["status", "status"],
    ["analysis", "analysis"],
    ["data", "data"],
  ])("singularize(%j) = %j", (input, expected) => {
    expect(singularize(input)).toBe(expected);
  });
});

describe("TypeScript", () => {
  it("marks keys missing from some array elements optional, and null-able values", () => {
    expect(gen({ items: [{ a: 1, b: null }, { a: 2, b: "x", c: true }] }, "typescript")).toBe(
      [
        "export interface Root {",
        "  items: Item[];",
        "}",
        "",
        "export interface Item {",
        "  a: number;",
        "  b: string | null;",
        "  c?: boolean;",
        "}",
        "",
      ].join("\n"),
    );
  });

  it("quotes keys that aren't identifiers", () => {
    expect(gen({ "first-name": "a", "2x": 1, $ok: 1 }, "typescript")).toContain('  "first-name": string;\n  "2x": number;\n  $ok: number;');
  });

  it("handles root arrays, root primitives, and empty objects/arrays", () => {
    expect(gen([{ id: 1 }], "typescript")).toBe("export type Root = RootItem[];\n\nexport interface RootItem {\n  id: number;\n}\n");
    expect(gen("hi", "typescript")).toBe("export type Root = string;\n");
    expect(gen({ meta: {}, list: [] }, "typescript")).toContain("  list: unknown[];\n}\n\nexport interface Meta {}");
  });

  it("parenthesizes union element types and nests arrays", () => {
    expect(gen({ v: [1, "a"], grid: [[1, 2], [3]] }, "typescript")).toContain("  v: (number | string)[];\n  grid: number[][];");
  });

  it("de-duplicates type names that collide", () => {
    const code = gen({ user: { name: "a" }, owner: { user: { id: 1 } } }, "typescript");
    expect(code).toContain("export interface User {\n  name: string;\n}");
    expect(code).toContain("export interface User2 {\n  id: number;\n}");
    expect(code).toContain("  user: User2;");
  });

  it("uses the root name the user provides", () => {
    expect(gen({ a: 1 }, "typescript", "api response")).toContain("export interface ApiResponse {");
    expect(gen({ a: 1 }, "typescript", "   ")).toContain("export interface Root {");
  });
});

describe("Python", () => {
  it("emits TypedDicts children-first with only the imports it needs", () => {
    expect(gen({ id: 1, tags: ["a"], owner: { name: "x", email: null } }, "python")).toBe(
      [
        "from typing import TypedDict",
        "",
        "",
        "class Owner(TypedDict):",
        "    name: str",
        "    email: None",
        "",
        "",
        "class Root(TypedDict):",
        "    id: int",
        "    tags: list[str]",
        "    owner: Owner",
        "",
      ].join("\n"),
    );
  });

  it("uses NotRequired for optional keys, | None for nulls, Any for unknowns", () => {
    const code = gen({ rows: [{ a: 1.5, b: null, e: [] }, { a: 2, b: "x" }] }, "python");
    expect(code.split("\n")[0]).toBe("from typing import Any, NotRequired, TypedDict");
    expect(code).toContain("    a: float\n    b: str | None\n    e: NotRequired[list[Any]]");
  });

  it("falls back to the functional syntax for non-identifier or keyword keys", () => {
    expect(gen({ "first-name": "a", class: 1 }, "python")).toContain(
      'Root = TypedDict("Root", {\n    "first-name": str,\n    "class": int,\n})',
    );
  });

  it("emits a type alias for non-object roots, after the classes it uses", () => {
    expect(gen([{ id: 1 }], "python")).toBe(
      "from typing import TypedDict\n\n\nclass RootItem(TypedDict):\n    id: int\n\n\nRoot = list[RootItem]\n",
    );
    expect(gen({}, "python")).toBe("from typing import TypedDict\n\n\nclass Root(TypedDict):\n    pass\n");
  });
});

describe("Go", () => {
  it("emits gofmt-aligned structs with json tags", () => {
    expect(gen({ user_id: 1, name: "a", score: 1.5, tags: ["x"] }, "go")).toBe(
      [
        "type Root struct {",
        '\tUserID int      `json:"user_id"`',
        '\tName   string   `json:"name"`',
        '\tScore  float64  `json:"score"`',
        '\tTags   []string `json:"tags"`',
        "}",
        "",
      ].join("\n"),
    );
  });

  it("uses pointers for nullable values, omitempty for optional keys, any for mixed", () => {
    const code = gen({ rows: [{ a: null, o: { x: 1 }, s: [1] }, { a: "x", o: null, s: null, m: [1, "a"] }] }, "go");
    expect(code).toContain(
      [
        "type Row struct {",
        '\tA *string `json:"a"`',
        '\tO *O      `json:"o"`',
        '\tS []int   `json:"s"`',
        '\tM []any   `json:"m,omitempty"`',
        "}",
      ].join("\n"),
    );
  });

  it("makes field names valid and unique", () => {
    const code = gen({ "user-name": 1, user_name: 2, "9lives": 3, "": 4 }, "go");
    expect(code).toContain('\tUserName    int `json:"user-name"`');
    expect(code).toContain('\tUserName2   int `json:"user_name"`');
    expect(code).toContain('\tField9lives int `json:"9lives"`');
    expect(code).toContain('\tField       int `json:""`');
  });

  it("emits named types for non-object roots and empty structs", () => {
    expect(gen([1, 2], "go")).toBe("type Root []int\n");
    expect(gen({}, "go")).toBe("type Root struct {\n}\n");
  });
});

describe("Zod", () => {
  it("emits schemas children-first, each with its inferred type", () => {
    expect(gen({ id: 1, score: 1.5, ok: true, tags: ["a"], owner: { name: "x" } }, "zod")).toBe(
      [
        'import { z } from "zod";',
        "",
        "export const OwnerSchema = z.object({",
        "  name: z.string(),",
        "});",
        "export type Owner = z.infer<typeof OwnerSchema>;",
        "",
        "export const RootSchema = z.object({",
        "  id: z.number().int(),",
        "  score: z.number(),",
        "  ok: z.boolean(),",
        "  tags: z.array(z.string()),",
        "  owner: OwnerSchema,",
        "});",
        "export type Root = z.infer<typeof RootSchema>;",
        "",
      ].join("\n"),
    );
  });

  it("uses optional for missing keys, nullable for nulls, nullish for both", () => {
    const code = gen({ rows: [{ a: null, b: 1, c: null, o: { x: 1 } }, { a: "x", c: "y", o: null }, { a: "z", b: 2, o: { x: 2 } }] }, "zod");
    expect(code).toContain(
      ["export const RowSchema = z.object({", "  a: z.string().nullable(),", "  b: z.number().int().optional(),", "  c: z.string().nullish(),", "  o: OSchema.nullable(),", "});"].join("\n"),
    );
  });

  it("writes unions, nulls, unknowns and nested arrays", () => {
    const code = gen({ v: [1, "a", null], n: null, e: [], grid: [[1.5]] }, "zod");
    expect(code).toContain(
      "  v: z.array(z.union([z.number().int(), z.string()]).nullable()),\n  n: z.null(),\n  e: z.array(z.unknown()),\n  grid: z.array(z.array(z.number())),",
    );
  });

  it("quotes keys that aren't identifiers, and keeps __proto__ a plain key", () => {
    expect(gen({ "first-name": "a", "2x": 1, $ok: 1 }, "zod")).toContain('  "first-name": z.string(),\n  "2x": z.number().int(),\n  $ok: z.number().int(),');
    const result = generateTypes('{"__proto__": "x"}', "zod");
    expect(result.ok && result.code).toContain('  ["__proto__"]: z.string(),');
  });

  it("emits a schema for non-object roots, after the schemas it uses, and empty objects", () => {
    expect(gen([{ id: 1 }], "zod", "users")).toBe(
      [
        'import { z } from "zod";',
        "",
        "export const UserSchema = z.object({",
        "  id: z.number().int(),",
        "});",
        "export type User = z.infer<typeof UserSchema>;",
        "",
        "export const UsersSchema = z.array(UserSchema);",
        "export type Users = z.infer<typeof UsersSchema>;",
        "",
      ].join("\n"),
    );
    expect(gen({}, "zod")).toContain("export const RootSchema = z.object({});");
  });
});

describe("errors", () => {
  it("reports empty and invalid input", () => {
    expect(generateTypes("  ", "typescript")).toEqual({ ok: false, error: "Input is empty. Paste some JSON." });
    const bad = generateTypes("{ nope }", "typescript");
    expect(bad.ok).toBe(false);
    expect(!bad.ok && bad.error).toMatch(/^Invalid JSON: /);
  });
});
