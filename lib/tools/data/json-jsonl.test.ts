import { describe, expect, it } from "vitest";
import { parseJson, printJson, type JsonNode } from "@/lib/tools/developer/json-format";
import {
  convertRecords,
  fieldNames,
  filterFields,
  flattenObject,
  parseJsonl,
  parseJsonRecords,
  type ConvertOptions,
} from "./json-jsonl";

const node = (json: string): JsonNode => {
  const parsed = parseJson(json);
  if (!parsed.ok) throw new Error(parsed.error.message);
  return parsed.value;
};
const print = (n: JsonNode) => printJson(n, { indent: "", sortKeys: false });

const TO_JSONL: ConvertOptions = { direction: "json-to-jsonl", flatten: false, keep: [], indent: "" };
const TO_JSON: ConvertOptions = { direction: "jsonl-to-json", flatten: false, keep: [], indent: "" };

describe("parseJsonRecords", () => {
  it("takes an array's items, or a lone object as one record", () => {
    const array = parseJsonRecords('[{"a":1},2]');
    expect(array.ok && array.records.map(print)).toEqual(['{"a":1}', "2"]);
    const object = parseJsonRecords('﻿{"a":1}');
    expect(object.ok && object.records.map(print)).toEqual(['{"a":1}']);
  });

  it("rejects other top-level values with a clear message", () => {
    const result = parseJsonRecords("  42");
    expect(result).toMatchObject({ ok: false, error: { message: expect.stringContaining("found a number"), column: 3 } });
  });

  it("reports syntax errors with their position", () => {
    const result = parseJsonRecords('[\n  {"a": 1,}\n]');
    expect(result).toMatchObject({ ok: false, error: { line: 2, message: 'Trailing comma before "}"; remove it.' } });
  });
});

describe("parseJsonl", () => {
  it("parses each line on its own and reports bad lines by 1-indexed line number", () => {
    const result = parseJsonl('{"id":1}\n\n{"id":2,}\r\n{"id":3}\n{bad}\n');
    expect(result.records.map(print)).toEqual(['{"id":1}', '{"id":3}']);
    expect(result.lines).toBe(4);
    expect(result.errors).toEqual([
      { line: 3, column: 9, message: 'Trailing comma before "}"; remove it.' },
      { line: 5, column: 2, message: "Property names must be in double quotes." },
    ]);
  });

  it("keeps big integers exactly", () => {
    expect(parseJsonl('{"id":9007199254740993}').records.map(print)).toEqual(['{"id":9007199254740993}']);
  });
});

describe("flattenObject", () => {
  it("joins nested keys with dots and keeps arrays and empty objects as values", () => {
    expect(print(flattenObject(node('{"user":{"name":"Ada","tags":[{"x":1}],"meta":{}},"id":1}')))).toBe(
      '{"user.name":"Ada","user.tags":[{"x":1}],"user.meta":{},"id":1}',
    );
  });

  it("lets the later value win when a flattened key collides", () => {
    expect(print(flattenObject(node('{"a.b":1,"a":{"b":2}}')))).toBe('{"a.b":2}');
  });

  it("leaves non-objects alone", () => {
    expect(print(flattenObject(node("[1,2]")))).toBe("[1,2]");
  });
});

describe("filterFields and fieldNames", () => {
  const records = [node('{"id":1,"name":"a","x":true}'), node('{"id":2,"y":null}'), node("3")];

  it("lists keys in first-seen order", () => {
    expect(fieldNames(records)).toEqual(["id", "name", "x", "y"]);
  });

  it("keeps only the listed keys, passing non-objects through", () => {
    expect(filterFields(records, ["id", "y"]).map(print)).toEqual(['{"id":1}', '{"id":2,"y":null}', "3"]);
  });

  it("keeps everything when nothing is listed", () => {
    expect(filterFields(records, [])).toBe(records);
  });
});

describe("convertRecords", () => {
  it("converts a JSON array to one compact line per record", () => {
    const result = convertRecords('[\n  {"id": 1, "name": "Ada"},\n  {"id": 2, "name": "Linus"}\n]', TO_JSONL);
    expect(result).toEqual({
      ok: true,
      output: '{"id":1,"name":"Ada"}\n{"id":2,"name":"Linus"}',
      records: 2,
      lines: 2,
      fields: ["id", "name"],
      errors: [],
    });
  });

  it("converts JSONL to a JSON array, pretty or minified", () => {
    expect(convertRecords('{"id":1}\n{"id":2}', { ...TO_JSON, indent: "  " })).toMatchObject({
      ok: true,
      output: '[\n  {\n    "id": 1\n  },\n  {\n    "id": 2\n  }\n]',
    });
    expect(convertRecords('{"id":1}\n{"id":2}', TO_JSON)).toMatchObject({ output: '[{"id":1},{"id":2}]' });
  });

  it("still converts the valid lines when some are malformed", () => {
    const result = convertRecords('{"id":1}\nnope\n{"id":3}', TO_JSON);
    expect(result).toMatchObject({ ok: true, output: '[{"id":1},{"id":3}]', records: 2, lines: 3 });
    expect(result.ok && result.errors.map((e) => e.line)).toEqual([2]);
  });

  it("gives no output when every line is malformed", () => {
    expect(convertRecords("nope\nnah", TO_JSON)).toMatchObject({ ok: true, output: "", records: 0, lines: 2 });
  });

  it("refuses empty JSONL input", () => {
    expect(convertRecords("  \n", TO_JSON)).toMatchObject({ ok: false, error: { message: "Input is empty. Paste some JSONL." } });
  });

  it("filters on flattened keys and lists them as fields", () => {
    const result = convertRecords('[{"id":1,"user":{"name":"Ada","age":36}}]', { ...TO_JSONL, flatten: true, keep: ["user.name"] });
    expect(result).toMatchObject({ output: '{"user.name":"Ada"}', fields: ["id", "user.name", "user.age"] });
  });

  it("ignores kept fields the input doesn't have", () => {
    expect(convertRecords('[{"id":1}]', { ...TO_JSONL, keep: ["gone"] })).toMatchObject({ output: '{"id":1}' });
  });
});
