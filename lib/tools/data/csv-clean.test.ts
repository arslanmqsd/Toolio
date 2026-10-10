import { describe, expect, it } from "vitest";
import { DEFAULT_CSV_CLEAN, cleanCsv, type CsvCleanOptions } from "./csv-clean";

const clean = (text: string, options: Partial<CsvCleanOptions> = {}) => {
  const r = cleanCsv(text, { ...DEFAULT_CSV_CLEAN, ...options });
  if (!r.ok) throw new Error(r.error.message);
  return r;
};

const messages = (r: ReturnType<typeof clean>) => r.notices.map((n) => n.message).join("\n");

describe("cleanCsv cells", () => {
  it("trims spaces around values, and says how many cells it changed", () => {
    const r = clean(" a , b \n 1 ,2\n");
    expect(r.output).toBe("a,b\n1,2\n");
    expect(messages(r)).toMatch(/Trimmed spaces from 3 cells/);
  });

  it("removes invisible characters and turns non-breaking spaces into spaces", () => {
    const r = clean("name\nLi​nus T\u0007\n﻿x\n");
    expect(r.output).toBe("name\nLinus T\nx\n");
    expect(messages(r)).toMatch(/invisible.*2 cells/);
  });

  it("can collapse runs of spaces and line breaks in a cell", () => {
    expect(clean('a\n"x   y\n z"\n').output).toBe('a\n"x   y\n z"\n');
    expect(clean('a\n"x   y\n z"\n', { collapseSpaces: true }).output).toBe("a\nx y z\n");
  });

  it("leaves cells alone when those fixes are off", () => {
    const off = { trim: false, invisible: false };
    expect(clean(" a ​\n", off).output).toBe(" a ​\n");
  });
});

describe("cleanCsv rows", () => {
  it("removes blank lines and rows with only empty cells", () => {
    const r = clean("a,b\n\n1,2\n,\n , \n3,4\n");
    expect(r.output).toBe("a,b\n1,2\n3,4\n");
    expect(messages(r)).toMatch(/Removed 3 empty rows/);
  });

  it("removes exact duplicate rows when asked, keeping the first, after other fixes", () => {
    const text = "a,b\n1,x\n2,y\n1 ,x\n1,x\n";
    expect(clean(text).output).toBe("a,b\n1,x\n2,y\n1,x\n1,x\n");
    const r = clean(text, { duplicates: true });
    expect(r.output).toBe("a,b\n1,x\n2,y\n");
    expect(messages(r)).toMatch(/Removed 2 duplicate rows.*lines 4 and 5/);
  });

  it("pads short rows and drops empty extra fields", () => {
    const r = clean("a,b,c\n1\n2,3,4,,\n");
    expect(r.output).toBe("a,b,c\n1,,\n2,3,4\n");
    expect(messages(r)).toMatch(/Filled out 1 short row/);
  });

  it("gives extra values a column of their own, and warns", () => {
    const r = clean("a,b\n1,2,3\n");
    expect(r.output).toBe("a,b,column_3\n1,2,3\n");
    expect(r.notices.find((n) => n.kind === "warning")?.message).toMatch(/line 2 has 3 fields.*header has 2/i);
  });

  it("leaves rows uneven when asked, but says so", () => {
    const r = clean("a,b\n1\n", { evenRows: false });
    expect(r.output).toBe("a,b\n1\n");
    expect(r.notices.find((n) => n.kind === "warning")?.message).toMatch(/line 2 has 1 field/i);
  });

  it("makes rows as wide as the widest when there's no header", () => {
    expect(clean("1\n2,3\n", { header: false }).output).toBe("1,\n2,3\n");
  });
});

describe("cleanCsv columns and header", () => {
  it("removes columns with no name and no values", () => {
    const r = clean("a,,b,\n1,,2,\n3,,4\n");
    expect(r.output).toBe("a,b\n1,2\n3,4\n");
    expect(messages(r)).toMatch(/Removed 2 empty columns/);
  });

  it("treats empty fields past the header as ragged rows, not columns", () => {
    const r = clean("a,b\n1,2,,\n");
    expect(r.output).toBe("a,b\n1,2\n");
    expect(messages(r)).not.toMatch(/empty column/);
    expect(messages(r)).toMatch(/Dropped empty fields past the last column on 1 row/);
    expect(r.stats.columnsBefore).toBe(2);
  });

  it("keeps a named column even when it has no values", () => {
    expect(clean("a,notes\n1,\n").output).toBe("a,notes\n1,\n");
  });

  it("names unnamed columns and renames repeated ones", () => {
    const r = clean("id,,id\n1,2,3\n");
    expect(r.output).toBe("id,column_2,id_2\n1,2,3\n");
    expect(messages(r)).toMatch(/id.*more than once/);
    expect(clean("id,,id\n1,2,3\n", { fixHeader: false }).output).toBe("id,,id\n1,2,3\n");
  });

  it("doesn't treat the first row as a header when told not to", () => {
    expect(clean("a,a\n1,1\na,a\n", { header: false, duplicates: true }).output).toBe("a,a\n1,1\n");
  });
});

describe("cleanCsv output", () => {
  it("detects the delimiter and keeps it, or writes another", () => {
    const r = clean("a;b\n1,5;2\n");
    expect(r.delimiter).toBe(";");
    expect(r.output).toBe("a;b\n1,5;2\n");
    expect(clean("a;b\n1,5;2\n", { outputDelimiter: "," }).output).toBe('a,b\n"1,5",2\n');
    expect(clean("a;b\n1,5;2\n", { outputDelimiter: "\t", crlf: true }).output).toBe("a\tb\r\n1,5\t2\r\n");
  });

  it("warns about formula cells, and can escape them", () => {
    const text = "v\n=1+1\n-5\n@SUM(A1)\n";
    expect(clean(text).notices.find((n) => n.kind === "warning")?.message).toMatch(/2 cells.*formula/);
    expect(clean(text, { escapeFormulas: true }).output).toBe("v\n'=1+1\n-5\n'@SUM(A1)\n");
  });

  it("warns about replacement characters, the sign of a file read in the wrong encoding", () => {
    expect(clean("a\nCaf�\n").notices.find((n) => n.kind === "warning")?.message).toMatch(/1 cell.*�/);
  });

  it("counts rows and columns before and after", () => {
    const r = clean("a,,b\n1,,2\n\n1,,2\n", { duplicates: true });
    expect(r.stats).toEqual({ rowsBefore: 2, rowsAfter: 1, columnsBefore: 3, columnsAfter: 2 });
    expect(r.table).toEqual({ header: ["a", "b"], rows: [["1", "2"]], rowCount: 1, columnCount: 2 });
  });

  it("says when nothing needed fixing", () => {
    const r = clean("a,b\n1,2\n");
    expect(r.output).toBe("a,b\n1,2\n");
    expect(r.notices).toEqual([]);
    expect(r.changed).toBe(false);
  });

  it("reports CSV it can't read, and input with no rows", () => {
    const bad = cleanCsv('a\n"open\n', DEFAULT_CSV_CLEAN);
    expect(!bad.ok && bad.error).toMatchObject({ line: 2, message: expect.stringMatching(/never closed/) });
    const blank = cleanCsv("\n\n", DEFAULT_CSV_CLEAN);
    expect(!blank.ok && blank.error.message).toMatch(/no rows/);
  });
});
