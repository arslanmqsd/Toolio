import { describe, expect, it } from "vitest";
import {
  DEFAULT_CSV_TO_JSON,
  DEFAULT_JSON_TO_CSV,
  csvToJson,
  detectDelimiter,
  jsonToCsv,
  parseCsv,
  type CsvToJsonOptions,
  type JsonToCsvOptions,
} from "./json-csv";

const rows = (text: string, delimiter: "," | ";" | "\t" | "|" = ",") => {
  const r = parseCsv(text, delimiter);
  if (!r.ok) throw new Error(r.error.message);
  return r.rows;
};

const toJson = (text: string, options: Partial<CsvToJsonOptions> = {}) => {
  const r = csvToJson(text, { ...DEFAULT_CSV_TO_JSON, indent: "", ...options });
  if (!r.ok) throw new Error(r.error.message);
  return r;
};

const toCsv = (text: string, options: Partial<JsonToCsvOptions> = {}) => {
  const r = jsonToCsv(text, { ...DEFAULT_JSON_TO_CSV, ...options });
  if (!r.ok) throw new Error(r.error.message);
  return r;
};

describe("parseCsv", () => {
  it("reads plain fields and line endings of every kind", () => {
    expect(rows("a,b\r\n1,2\n3,4\r5,6")).toEqual([["a", "b"], ["1", "2"], ["3", "4"], ["5", "6"]]);
  });

  it("reads quoted fields with delimiters, doubled quotes and line breaks in them", () => {
    expect(rows('name,note\n"Smith, Jo","said ""hi""\nthen left"\n')).toEqual([
      ["name", "note"],
      ["Smith, Jo", 'said "hi"\nthen left'],
    ]);
  });

  it("keeps empty fields, spaces and a quote inside an unquoted field", () => {
    expect(rows('a,,c\n 1 ,5" screen,\n')).toEqual([["a", "", "c"], [" 1 ", '5" screen', ""]]);
  });

  it("drops a byte order mark, a final line break and blank lines", () => {
    const r = parseCsv("﻿a,b\n\n1,2\n\n", ",");
    expect(r.ok && r.rows).toEqual([["a", "b"], ["1", "2"]]);
    expect(r.ok && r.blankLines).toBe(2);
  });

  it("knows the line each row starts on, quoted line breaks and all", () => {
    const r = parseCsv('a\n"x\ny"\nz', ",");
    expect(r.ok && r.lines).toEqual([1, 2, 4]);
  });

  it("reads other delimiters", () => {
    expect(rows("a;b\n1,5;2", ";")).toEqual([["a", "b"], ["1,5", "2"]]);
    expect(rows("a\tb\n1\t2", "\t")).toEqual([["a", "b"], ["1", "2"]]);
  });

  it.each([
    ['a,b\n1,"two\n', 2, 3, /never closed/],
    ['a,b\n"1"x,2', 2, 4, /after the closing quote.*""/],
  ])("rejects %j", (text, line, column, message) => {
    const r = parseCsv(text, ",");
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error.message).toMatch(message);
      expect([r.error.line, r.error.column]).toEqual([line, column]);
    }
  });
});

describe("detectDelimiter", () => {
  it.each([
    ["a,b,c\n1,2,3", ","],
    ["a;b;c\n1,5;2,5;3", ";"],
    ["a\tb\n1\t2", "\t"],
    ["a|b\n1|2", "|"],
    ['name,quote\n"x","a;b;c;d"\n"y","e;f"', ","],
    ["just one column\nvalue", ","],
  ])("%j uses %j", (text, delimiter) => {
    expect(detectDelimiter(text)).toBe(delimiter);
  });
});

describe("csvToJson", () => {
  it("makes an object per row, keyed by the header", () => {
    expect(toJson("name,age\nAda,36\nAlan,41").output).toBe('[{"name":"Ada","age":36},{"name":"Alan","age":41}]');
  });

  it("indents as asked", () => {
    expect(toJson("a\n1", { indent: "  " }).output).toBe('[\n  {\n    "a": 1\n  }\n]');
  });

  it("guesses numbers, booleans and null, but keeps values that only look like numbers", () => {
    const { output } = toJson("v\n42\n-3.5\n0\ntrue\nFALSE\nnull\n007\n1e5\n+1\n\"1,000\"\n 42\n.5\nhello");
    expect(JSON.parse(output).map((r: { v: unknown }) => r.v)).toEqual([42, -3.5, 0, true, false, null, "007", "1e5", "+1", "1,000", " 42", ".5", "hello"]);
  });

  it("keeps integers past 2^53 as strings, and says so", () => {
    const r = toJson("id\n9007199254740993\n12");
    expect(r.output).toBe('[{"id":"9007199254740993"},{"id":12}]');
    expect(r.notices.map((n) => n.message).join()).toMatch(/9007199254740993.*too large/);
  });

  it("can keep every value a string", () => {
    expect(toJson("a,b\n1,true", { inferTypes: false }).output).toBe('[{"a":"1","b":"true"}]');
  });

  it("writes empty cells as empty strings, or null when asked", () => {
    expect(toJson("a,b\n,1").output).toBe('[{"a":"","b":1}]');
    expect(toJson("a,b\n,1", { emptyAsNull: true }).output).toBe('[{"a":null,"b":1}]');
  });

  it("makes arrays of rows when there's no header", () => {
    expect(toJson("1,x\n2,y", { header: false }).output).toBe('[[1,"x"],[2,"y"]]');
  });

  it("names empty and repeated headers, and says so", () => {
    const r = toJson("name,,name\na,b,c");
    expect(r.output).toBe('[{"name":"a","column_2":"b","name_2":"c"}]');
    expect(r.notices.map((n) => n.message).join(" ")).toMatch(/name.*more than once/);
  });

  it("points out rows with the wrong number of fields, filling or naming what's missing or extra", () => {
    const r = toJson("a,b\n1\n2,3,4");
    expect(r.output).toBe('[{"a":1,"b":""},{"a":2,"b":3,"column_3":4}]');
    expect(r.notices.find((n) => n.kind === "warning")?.message).toMatch(/line 2 has 1 field.*line 3 has 3 fields.*header has 2/i);
  });

  it("can nest dot-separated headers, making arrays from numbered ones", () => {
    expect(toJson("id,owner.name,owner.active,tags.0,tags.1\n1,Ada,true,x,y", { nest: true }).output).toBe(
      '[{"id":1,"owner":{"name":"Ada","active":true},"tags":["x","y"]}]',
    );
  });

  it("keeps headers flat when nesting them would clash", () => {
    const r = toJson("a,a.b\n1,2", { nest: true });
    expect(r.output).toBe('[{"a":1,"a.b":2}]');
    expect(r.notices.map((n) => n.message).join()).toMatch(/a and a\.b/);
  });

  it("detects the delimiter unless one is chosen", () => {
    expect(toJson("a;b\n1;2").delimiter).toBe(";");
    expect(toJson("a;b\n1;2", { delimiter: "," }).output).toBe('[{"a;b":"1;2"}]');
  });

  it("gives a preview of the table", () => {
    const r = toJson("a,b\n1,2\n3,4");
    expect(r.table).toEqual({ header: ["a", "b"], rows: [["1", "2"], ["3", "4"]], rowCount: 2, columnCount: 2 });
  });

  it("keeps a __proto__ header as a plain key", () => {
    expect(toJson("__proto__,x\n1,2").output).toBe('[{"__proto__":1,"x":2}]');
  });
});

describe("jsonToCsv", () => {
  it("makes a column for every key, in the order they first appear", () => {
    expect(toCsv('[{"a":1,"b":"x"},{"b":"y","c":true}]').output).toBe("a,b,c\n1,x,\n,y,true\n");
  });

  it("quotes only the fields that need it", () => {
    expect(toCsv('[{"t":"Smith, Jo"},{"t":"say \\"hi\\""},{"t":"two\\nlines"},{"t":"plain"}]').output).toBe('t\n"Smith, Jo"\n"say ""hi"""\n"two\nlines"\nplain\n');
  });

  it("flattens nested objects into dot-path columns", () => {
    expect(toCsv('[{"id":1,"owner":{"name":"Ada","meta":{"x":null}},"e":{}}]').output).toBe("id,owner.name,owner.meta.x,e\n1,Ada,,{}\n");
  });

  it("writes arrays as JSON in one cell, or one column per item", () => {
    expect(toCsv('[{"tags":["a","b"]}]').output).toBe('tags\n"[""a"",""b""]"\n');
    expect(toCsv('[{"tags":["a","b"]},{"tags":["c"]}]', { arrays: "columns" }).output).toBe("tags.0,tags.1\na,b\nc,\n");
  });

  it("keeps numbers exactly as written", () => {
    expect(toCsv('[{"id":9007199254740993,"p":1.10}]').output).toBe("id,p\n9007199254740993,1.10\n");
  });

  it("takes a single object, an object of records, arrays of arrays and plain values", () => {
    expect(toCsv('{"a":1,"b":2}').output).toBe("a,b\n1,2\n");
    expect(toCsv('{"u1":{"name":"Ada"},"u2":{"name":"Alan"}}').output).toBe("key,name\nu1,Ada\nu2,Alan\n");
    expect(toCsv('[["a","b"],[1,2]]').output).toBe("a,b\n1,2\n");
    expect(toCsv('[1,"x"]').output).toBe("value\n1\nx\n");
  });

  it("uses the delimiter and line endings asked for", () => {
    expect(toCsv('[{"a":"1,5","b":2}]', { delimiter: ";", crlf: true }).output).toBe("a;b\r\n1,5;2\r\n");
    expect(toCsv('[{"a":"x;y"}]', { delimiter: ";" }).output).toBe('a\n"x;y"\n');
  });

  it("warns about cells a spreadsheet would run as a formula, and can escape them", () => {
    const json = '[{"v":"=HYPERLINK(\\"http://x.test\\")"},{"v":"@SUM(1)"},{"v":"-5"},{"v":"+1.5"},{"v":"-x"}]';
    const r = toCsv(json);
    expect(r.notices.find((n) => n.kind === "warning")?.message).toMatch(/3 cells.*formula/);
    expect(toCsv(json, { escapeFormulas: true }).table.rows[1]).toEqual(["'@SUM(1)"]);
    expect(toCsv(json, { escapeFormulas: true }).output).toBe('v\n"\'=HYPERLINK(""http://x.test"")"\n\'@SUM(1)\n-5\n+1.5\n\'-x\n');
  });

  it("says when two paths end up in the same column", () => {
    const r = toCsv('[{"a.b":1,"a":{"b":2}}]');
    expect(r.notices.map((n) => n.message).join()).toMatch(/a\.b/);
  });

  it("reports JSON it can't read, and JSON that isn't records", () => {
    const bad = jsonToCsv('[{"a":1,}]', DEFAULT_JSON_TO_CSV);
    expect(bad.ok || bad.error).toMatchObject({ line: 1 });
    const scalar = jsonToCsv("42", DEFAULT_JSON_TO_CSV);
    expect(!scalar.ok && scalar.error.message).toMatch(/array of objects/);
  });

  it("gives a preview of the table", () => {
    expect(toCsv('[{"a":1},{"a":2}]').table).toEqual({ header: ["a"], rows: [["1"], ["2"]], rowCount: 2, columnCount: 1 });
  });
});

describe("round trip", () => {
  it("gets the same records back", () => {
    const json = '[{"id":1,"name":"Smith, \\"Jo\\"","owner":{"active":true},"note":"a\\nb"}]';
    const csv = toCsv(json).output;
    expect(JSON.parse(toJson(csv, { nest: true }).output)).toEqual(JSON.parse(json));
  });
});
